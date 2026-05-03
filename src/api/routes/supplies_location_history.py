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
from src.api.helpers.datetime_json import db_datetime_to_utc_iso
from src.api.middleware.auth import require_auth
from src.api.helpers.history import is_latest_global_history_timestamp
from src.api.helpers.unique_type_qty import map_total_qty_for_supply, check_unique_type_map_qty
from src.api.repositories import supplies_location_history_repository as lh_repo

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

        rows = lh_repo.fetch_history_page(
            cur, supply_id, supply_name, location_name, limit, offset
        )
        
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
                'undone_at': db_datetime_to_utc_iso(row['undone_at']),
                'undone_by': row['undone_by'],
                'changed_by': row['changed_by'],
                'changed_by_name': f"{row['first_name']} {row['last_name']}" if row['first_name'] and row['last_name'] else None,
                'changed_at': db_datetime_to_utc_iso(row['changed_at'])
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
        
        history = lh_repo.fetch_history_entry_for_undo_dict(cur, history_id)
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
            
            if history["supply_id"]:
                if not lh_repo.supply_exists_tuple(cur, history["supply_id"]):
                    cur.close()
                    conn.close()
                    return jsonify({
                        'error': 'Supply no longer exists',
                        'error_type': 'SUPPLY_DELETED',
                        'supply_name': history['supply_name']
                    }), 409
            
            current = lh_repo.select_location_entry_tuple(
                cur,
                history["supply_id"],
                history["location_name"],
                history["shelf"],
            )
            if current:
                new_amount = current[1] - amount_to_remove
                if new_amount <= 0:
                    lh_repo.delete_supplies_location_by_id(cur, current[0])
                else:
                    lh_repo.update_supplies_location_amount_tuple(
                        cur, new_amount, current_user_id, current[0]
                    )
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
            
            if not lh_repo.supply_exists_tuple(cur, history["supply_id"]):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Supply no longer exists',
                    'error_type': 'SUPPLY_DELETED',
                    'supply_name': history['supply_name']
                }), 409

            existing = lh_repo.select_location_entry_tuple(
                cur,
                history["supply_id"],
                history["location_name"],
                history["shelf"],
            )
            if existing:
                new_amount = existing[1] + (history["old_amount"] or 0)
                lh_repo.update_supplies_location_amount_tuple(
                    cur, new_amount, current_user_id, existing[0]
                )
            else:
                lh_repo.insert_supplies_location_box_tuple(
                    cur,
                    history["supply_id"],
                    history["location_name"],
                    history["shelf"],
                    history["old_amount"],
                    current_user_id,
                )
        
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
            
            lh_repo.update_amount_by_supply_location_shelf_tuple(
                cur,
                history["old_amount"],
                current_user_id,
                history["supply_id"],
                history["location_name"],
                history["shelf"],
            )

        elif action_type == 'MOVE':
            pcur = conn.cursor(dictionary=True)
            paired = lh_repo.fetch_paired_move_row_dict(
                pcur, history["batch_id"], history_id
            )
            pcur.close()
            if not paired:
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Paired MOVE entry not found',
                    'error_type': 'MOVE_PAIR_MISSING',
                }), 400
            
            if history["action_type"] == "REMOVE":
                existing = lh_repo.select_location_entry_tuple(
                    cur,
                    history["supply_id"],
                    history["location_name"],
                    history["shelf"],
                )
                amount_to_restore = history["old_amount"] - (history["new_amount"] or 0)
                if existing:
                    new_amount = existing[1] + amount_to_restore
                    lh_repo.update_supplies_location_amount_tuple(
                        cur, new_amount, current_user_id, existing[0]
                    )
                else:
                    lh_repo.insert_supplies_location_box_tuple(
                        cur,
                        history["supply_id"],
                        history["location_name"],
                        history["shelf"],
                        amount_to_restore,
                        current_user_id,
                    )

                dest_existing = lh_repo.select_location_entry_tuple(
                    cur,
                    history["supply_id"],
                    paired["location_name"],
                    paired["shelf"],
                )
                if dest_existing:
                    amount_to_remove = paired["new_amount"] - (paired["old_amount"] or 0)
                    new_dest_amount = dest_existing[1] - amount_to_remove
                    if new_dest_amount <= 0:
                        lh_repo.delete_supplies_location_by_id(cur, dest_existing[0])
                    else:
                        lh_repo.update_supplies_location_amount_tuple(
                            cur, new_dest_amount, current_user_id, dest_existing[0]
                        )

            lh_repo.delete_history_by_id(cur, paired["id"])
        
        sid = history.get('supply_id')
        if sid:
            cur_v = conn.cursor(dictionary=True)
            total = map_total_qty_for_supply(cur_v, sid)
            ok_qty, err_qty = check_unique_type_map_qty(cur_v, sid, total)
            cur_v.close()
            if not ok_qty:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({'error': err_qty, 'error_type': 'UNIQUE_TYPE_QTY'}), 400

        lh_repo.delete_history_by_id(cur, history_id)
        
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

        history = lh_repo.fetch_history_meta_for_discard_dict(cur, history_id)
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
        if history["action_type"] == "MOVE" and history.get("batch_id"):
            prow = lh_repo.fetch_paired_id_tuple(
                cur, history["batch_id"], history_id
            )
            if prow:
                paired_id = prow[0]

        if paired_id is not None:
            lh_repo.delete_history_by_id(cur, paired_id)
        lh_repo.delete_history_by_id(cur, history_id)
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
        
        entries = lh_repo.fetch_batch_entries_ordered_dict(cur, batch_id)
        if not entries:
            cur.close()
            conn.close()
            return jsonify({'error': 'No entries found for this batch'}), 404
        
        # Delete all entries in the batch
        deleted_count = 0
        for entry in entries:
            lh_repo.delete_history_by_id(cur, entry["id"])
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

