"""
Supply Location History API routes.
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify, session
import mysql.connector
from src.api.db import get_db
from src.api.middleware.auth import require_auth
from src.api.helpers.history import is_latest_global_history_timestamp

supplies_location_history_bp = Blueprint('supplies_location_history', __name__)


@supplies_location_history_bp.route('', methods=['GET'])
@require_auth
def get_location_history(current_user_id=None):
    """
    GET /api/supplies-location-history
    Get paginated location history.
    
    Query parameters:
        supply_id: Filter by supply ID
        supply_name: Filter by supply name (for deleted supplies)
        location_name: Filter by location name
        limit: Number of results (default 50)
        offset: Offset for pagination (default 0)
        
    Returns:
        JSON array of history entries
        
    NOTE: Undone entries are DELETED entirely from the database (not just marked as undone).
          See undo_location_history and undo_batch_history endpoints which DELETE entries.
    """
    try:
        supply_id = request.args.get('supply_id', type=int)
        supply_name = request.args.get('supply_name')
        location_name = request.args.get('location_name')
        limit = request.args.get('limit', default=50, type=int)
        offset = request.args.get('offset', default=0, type=int)
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Build query with filters
        query = """
            SELECT 
                slh.id,
                slh.supply_id,
                slh.supply_name,
                slh.location_name,
                slh.shelf,
                slh.action_type,
                slh.old_amount,
                slh.new_amount,
                slh.related_location,
                slh.related_shelf,
                slh.batch_id,
                slh.undone,
                slh.undone_at,
                slh.undone_by,
                slh.changed_by,
                slh.changed_at,
                m.first_name,
                m.last_name
            FROM supplies_location_history slh
            LEFT JOIN members m ON slh.changed_by = m.uf_id
            WHERE 1=1
        """
        params = []
        
        if supply_id:
            query += " AND slh.supply_id = %s"
            params.append(supply_id)
        
        if supply_name:
            query += " AND slh.supply_name LIKE %s"
            params.append(f'%{supply_name}%')
        
        if location_name:
            query += " AND slh.location_name = %s"
            params.append(location_name)
        
        query += " ORDER BY slh.changed_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        # Format results
        results = []
        for row in rows:
            result = {
                'id': row['id'],
                'supply_id': row['supply_id'],
                'supply_name': row['supply_name'],
                'location_name': row['location_name'],
                'shelf': row['shelf'],
                'action_type': row['action_type'],
                'old_amount': row['old_amount'],
                'new_amount': row['new_amount'],
                'related_location': row['related_location'],
                'related_shelf': row['related_shelf'],
                'batch_id': row['batch_id'],
                'undone': bool(row['undone']),
                'undone_at': row['undone_at'].isoformat() if row['undone_at'] else None,
                'undone_by': row['undone_by'],
                'changed_by': row['changed_by'],
                'changed_by_name': f"{row['first_name']} {row['last_name']}" if row['first_name'] and row['last_name'] else None,
                'changed_at': row['changed_at'].isoformat() if row['changed_at'] else None
            }
            results.append(result)
        
        cur.close()
        conn.close()
        
        return jsonify(results), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_history_bp.route('/<int:history_id>/undo', methods=['POST'])
@require_auth
def undo_location_history(history_id, current_user_id=None):
    """
    POST /api/supplies-location-history/<id>/undo
    Undo a single history entry.
    
    Args:
        history_id: History entry ID to undo
        
    Returns:
        JSON object of the updated history entry
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Fetch history entry
        cur.execute("""
            SELECT id, supply_id, supply_name, location_name, shelf,
                   action_type, old_amount, new_amount,
                   related_location, related_shelf, batch_id, undone
            FROM supplies_location_history
            WHERE id = %s
        """, (history_id,))
        
        history = cur.fetchone()
        if not history:
            cur.close()
            conn.close()
            return jsonify({'error': 'History entry not found'}), 404
        
        if not session.get('is_leader', False):
            if not is_latest_global_history_timestamp(cur, history['changed_at']):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Only the most recent action can be undone.',
                    'error_type': 'UNDO_NOT_LATEST',
                }), 403
        
        # No need to check undone status - if entry exists, it can be undone
        
        action_type = history['action_type']
        
        # Handle CASCADED_SUBTRACT separately (cannot undo individual cascaded subtractions)
        if action_type == 'CASCADED_SUBTRACT':
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Cannot undo individual cascaded subtract entries. Use batch restore endpoint instead.',
                'error_type': 'CASCADED_SUBTRACT_ENTRY'
            }), 400
        
        cur = conn.cursor()  # Switch to regular cursor for updates
        
        # Undo based on action type
        if action_type == 'ADD':
            # Decrement amount by (new_amount - old_amount)
            # If old_amount was None, decrement by new_amount
            amount_to_remove = history['new_amount'] - (history['old_amount'] or 0)
            
            # Check if supply still exists
            if history['supply_id']:
                cur.execute("SELECT id FROM supplies WHERE id = %s", (history['supply_id'],))
                if not cur.fetchone():
                    cur.close()
                    conn.close()
                    return jsonify({
                        'error': 'Supply no longer exists',
                        'error_type': 'SUPPLY_DELETED',
                        'supply_name': history['supply_name']
                    }), 409
            
            # Find current location entry
            cur.execute("""
                SELECT id, amount FROM supplies_location
                WHERE supply_id = %s AND location_name = %s 
                  AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
            """, (history['supply_id'], history['location_name'], 
                  history['shelf'], history['shelf']))
            
            current = cur.fetchone()
            if current:
                new_amount = current[1] - amount_to_remove
                if new_amount <= 0:
                    # Delete the row
                    cur.execute("DELETE FROM supplies_location WHERE id = %s", (current[0],))
                else:
                    # Update amount
                    cur.execute("""
                        UPDATE supplies_location
                        SET amount = %s, last_modified_by = %s
                        WHERE id = %s
                    """, (new_amount, current_user_id, current[0]))
            else:
                # Location entry doesn't exist (already deleted), can't undo
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Location entry no longer exists, cannot undo',
                    'error_type': 'LOCATION_DELETED'
                }), 409
        
        elif action_type == 'REMOVE':
            # Re-insert or increment location entry with old_amount
            if not history['supply_id']:
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Supply no longer exists',
                    'error_type': 'SUPPLY_DELETED',
                    'supply_name': history['supply_name']
                }), 409
            
            # Check if supply still exists
            cur.execute("SELECT id FROM supplies WHERE id = %s", (history['supply_id'],))
            if not cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Supply no longer exists',
                    'error_type': 'SUPPLY_DELETED',
                    'supply_name': history['supply_name']
                }), 409
            
            # Check if location entry exists
            cur.execute("""
                SELECT id, amount FROM supplies_location
                WHERE supply_id = %s AND location_name = %s 
                  AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
            """, (history['supply_id'], history['location_name'],
                  history['shelf'], history['shelf']))
            
            existing = cur.fetchone()
            if existing:
                # Increment by old_amount
                new_amount = existing[1] + (history['old_amount'] or 0)
                cur.execute("""
                    UPDATE supplies_location
                    SET amount = %s, last_modified_by = %s
                    WHERE id = %s
                """, (new_amount, current_user_id, existing[0]))
            else:
                # Insert new entry
                cur.execute("""
                    INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                    VALUES (%s, %s, %s, %s, %s)
                """, (history['supply_id'], history['location_name'], 
                      history['shelf'], history['old_amount'], current_user_id))
        
        elif action_type == 'UPDATE':
            # Restore old_amount
            if not history['supply_id']:
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Supply no longer exists',
                    'error_type': 'SUPPLY_DELETED',
                    'supply_name': history['supply_name']
                }), 409
            
            cur.execute("""
                UPDATE supplies_location
                SET amount = %s, last_modified_by = %s
                WHERE supply_id = %s AND location_name = %s 
                  AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
            """, (history['old_amount'], current_user_id,
                  history['supply_id'], history['location_name'],
                  history['shelf'], history['shelf']))
        
        elif action_type == 'MOVE':
            # Find the paired history row via batch_id and reverse both legs
            cur.execute("""
                SELECT id, location_name, shelf, old_amount, new_amount
                FROM supplies_location_history
                WHERE batch_id = %s AND id != %s
            """, (history['batch_id'], history_id))
            
            paired = cur.fetchone()
            if not paired:
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Paired MOVE entry not found',
                    'error_type': 'MOVE_PAIR_MISSING',
                }), 400
            
            # Reverse both legs: undo REMOVE by restoring source, undo ADD by removing from dest
            if history['action_type'] == 'REMOVE':
                # This is the REMOVE leg - restore source
                cur.execute("""
                    SELECT id, amount FROM supplies_location
                    WHERE supply_id = %s AND location_name = %s 
                      AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
                """, (history['supply_id'], history['location_name'],
                      history['shelf'], history['shelf']))
                
                existing = cur.fetchone()
                amount_to_restore = history['old_amount'] - (history['new_amount'] or 0)
                if existing:
                    new_amount = existing[1] + amount_to_restore
                    cur.execute("""
                        UPDATE supplies_location
                        SET amount = %s, last_modified_by = %s
                        WHERE id = %s
                    """, (new_amount, current_user_id, existing[0]))
                else:
                    cur.execute("""
                        INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (history['supply_id'], history['location_name'],
                          history['shelf'], amount_to_restore, current_user_id))
                
                # Undo the ADD leg (remove from destination)
                cur.execute("""
                    SELECT id, amount FROM supplies_location
                    WHERE supply_id = %s AND location_name = %s 
                      AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
                """, (history['supply_id'], paired['location_name'],
                      paired['shelf'], paired['shelf']))
                
                dest_existing = cur.fetchone()
                if dest_existing:
                    amount_to_remove = paired['new_amount'] - (paired['old_amount'] or 0)
                    new_dest_amount = dest_existing[1] - amount_to_remove
                    if new_dest_amount <= 0:
                        cur.execute("DELETE FROM supplies_location WHERE id = %s", (dest_existing[0],))
                    else:
                        cur.execute("""
                            UPDATE supplies_location
                            SET amount = %s, last_modified_by = %s
                            WHERE id = %s
                        """, (new_dest_amount, current_user_id, dest_existing[0]))
            
            # Delete paired entry too
            cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (paired['id'],))
        
        # Delete this history entry entirely (not just mark as undone)
        cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (history_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'success': True, 'deleted_id': history_id}), 200
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({
                'error': 'Supply or location does not exist',
                'error_type': 'UNDO_IMPOSSIBLE',
            }), 400
        return jsonify({'error': str(e), 'error_type': 'UNDO_IMPOSSIBLE'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_history_bp.route('/<int:history_id>/discard', methods=['POST'])
@require_auth
def discard_location_history(history_id, current_user_id=None):
    """
    POST /api/supplies-location-history/<id>/discard
    Delete a location history row (and paired MOVE leg) without changing inventory.
    Same permission rules as undo (non-leaders: only the latest global history timestamp).
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)

        cur.execute("""
            SELECT id, action_type, batch_id, changed_at
            FROM supplies_location_history
            WHERE id = %s
        """, (history_id,))
        history = cur.fetchone()
        if not history:
            cur.close()
            conn.close()
            return jsonify({'error': 'History entry not found'}), 404

        if not session.get('is_leader', False):
            if not is_latest_global_history_timestamp(cur, history['changed_at']):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Only the most recent action can be undone.',
                    'error_type': 'UNDO_NOT_LATEST',
                }), 403

        if history['action_type'] == 'CASCADED_SUBTRACT':
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Cannot discard cascaded subtract entries individually.',
                'error_type': 'CASCADED_SUBTRACT_ENTRY',
            }), 400

        cur = conn.cursor()
        paired_id = None
        if history['action_type'] == 'MOVE' and history.get('batch_id'):
            cur.execute("""
                SELECT id FROM supplies_location_history
                WHERE batch_id = %s AND id != %s
            """, (history['batch_id'], history_id))
            prow = cur.fetchone()
            if prow:
                paired_id = prow[0]

        if paired_id is not None:
            cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (paired_id,))
        cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (history_id,))
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'success': True, 'discarded_id': history_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_history_bp.route('/batch/<batch_id>/undo', methods=['POST'])
@require_auth
def undo_batch_history(batch_id, current_user_id=None):
    """
    POST /api/supplies-location-history/batch/<batch_id>/undo
    Undo all history entries sharing a batch_id atomically by deleting them.
    
    Args:
        batch_id: Batch ID (UUID string)
        
    Returns:
        JSON object with count of deleted entries
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Fetch all entries for this batch
        cur.execute("""
            SELECT id, supply_id, supply_name, location_name, shelf,
                   action_type, old_amount, new_amount,
                   related_location, related_shelf
            FROM supplies_location_history
            WHERE batch_id = %s
            ORDER BY id
        """, (batch_id,))
        
        entries = cur.fetchall()
        if not entries:
            cur.close()
            conn.close()
            return jsonify({'error': 'No entries found for this batch'}), 404
        
        # Delete all entries in the batch
        deleted_count = 0
        for entry in entries:
            cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (entry['id'],))
            deleted_count += 1
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'batch_id': batch_id,
            'deleted_count': deleted_count
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

