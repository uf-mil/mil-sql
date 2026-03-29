"""
SupplyLocation API routes (inventory entries).
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify
import mysql.connector
import uuid
from src.api.db import get_db
from src.api.models.supply_location import SupplyLocation
from src.api.middleware.auth import require_auth
from src.api.helpers.history import log_location_history
from src.api.helpers.unique_type_qty import (
    map_total_qty_for_supply,
    check_unique_type_map_qty,
)
from src.api.helpers.map_bounds import coords_in_room, clamp_coords_to_room

supplies_location_bp = Blueprint('supplies_location', __name__)

FREE_COORD_HISTORY_LABEL = 'Free Coordinate'


@supplies_location_bp.route('', methods=['GET'])
@require_auth
def get_all_supply_locations(current_user_id=None):
    """
    GET /api/supplies-location
    Get all supply locations, optionally filtered by location or supply_id.
    
    Query parameters:
        location: Optional location name to filter by
        supply_id: Optional supply ID to filter by
        
    Returns:
        JSON array of supply locations
    """
    try:
        location_filter = request.args.get('location')
        supply_id_filter = request.args.get('supply_id')
        
        conn = get_db()
        cur = conn.cursor()
        
        query = """
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   sl.last_modified, sl.last_modified_by, sl.created_at,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE 1=1
        """
        params = []
        
        if location_filter:
            query += " AND sl.location_name = %s"
            params.append(location_filter)
        
        if supply_id_filter:
            query += " AND sl.supply_id = %s"
            params.append(int(supply_id_filter))
        
        query += " ORDER BY COALESCE(sl.location_name, ''), sl.shelf, s.name"
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        locations = []
        for row in rows:
            loc = SupplyLocation.from_db_row(row[:10])
            loc_dict = loc.to_dict()
            loc_dict['supply_name'] = row[10]
            locations.append(loc_dict)
        
        cur.close()
        conn.close()
        return jsonify(locations), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/<int:location_id>', methods=['GET'])
@require_auth
def get_supply_location(location_id, current_user_id=None):
    """
    GET /api/supplies-location/<id>
    Get a specific supply location by ID.
    
    Args:
        location_id: Supply location ID
        
    Returns:
        JSON object of the supply location or 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified, last_modified_by, created_at
            FROM supplies_location
            WHERE id = %s
        """, (location_id,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            location = SupplyLocation.from_db_row(row)
            return jsonify(location.to_dict()), 200
        else:
            return jsonify({'error': 'Supply location not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/by-location/<name>', methods=['GET'])
@require_auth
def get_location_supplies(name, current_user_id=None):
    """
    GET /api/supplies-location/by-location/<name>
    Get all supplies at a specific location.
    
    Args:
        name: Location name
        
    Returns:
        JSON array of supply locations at this location
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   sl.last_modified, sl.last_modified_by, sl.created_at,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.location_name = %s
            ORDER BY sl.shelf, s.name
        """, (name,))
        
        rows = cur.fetchall()
        
        locations = []
        for row in rows:
            loc = SupplyLocation.from_db_row(row[:10])
            loc_dict = loc.to_dict()
            loc_dict['supply_name'] = row[10]
            locations.append(loc_dict)
        
        cur.close()
        conn.close()
        return jsonify(locations), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('', methods=['POST'])
@require_auth
def add_supply_location(current_user_id=None):
    """
    POST /api/supplies-location
    Add a supply to a location (upsert: if supply_id+location+shelf exists, increment amount).
    
    Request body:
        {
            "supply_id": int (required),
            "location": "string" (required),
            "shelf": int (optional, null for non-shelf locations),
            "amount": int (required, amount to add)
        }
        
    Returns:
        JSON object of the supply location
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        if 'supply_id' not in data:
            return jsonify({'error': 'Missing required field: supply_id'}), 400
        
        supply_id = data['supply_id']
        cx_raw, cy_raw = data.get('coord_x'), data.get('coord_y')
        has_free = cx_raw is not None and cy_raw is not None
        has_box = bool(data.get('location'))
        
        if has_free and has_box:
            return jsonify({'error': 'Send either location (box) or coord_x/coord_y (free place), not both'}), 400
        
        if not has_free:
            required_fields = ['location', 'amount']
            for field in required_fields:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            if data['amount'] <= 0:
                return jsonify({'error': 'Amount must be positive'}), 400
        else:
            amount = int(data.get('amount', 1))
            if amount <= 0:
                return jsonify({'error': 'Amount must be positive'}), 400
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("SELECT id, name FROM supplies WHERE id = %s", (supply_id,))
        supply = cur.fetchone()
        if not supply:
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Supply not found',
                'error_type': 'SUPPLY_DELETED',
                'supply_id': supply_id,
                'supply_name': data.get('supply_name', 'Unknown'),
                'message': 'This item was deleted by another user. Please refresh the page to see the latest data.'
            }), 404
        
        cur = conn.cursor()
        
        batch_id = str(uuid.uuid4())
        
        if has_free:
            cx, cy = clamp_coords_to_room(cx_raw, cy_raw)
            if not coords_in_room(cx, cy):
                cur.close()
                conn.close()
                return jsonify({'error': 'Coordinates must be inside the map room bounds'}), 400
            
            total_now = map_total_qty_for_supply(cur, supply_id)
            ok_qty, err_qty = check_unique_type_map_qty(cur, supply_id, total_now + amount)
            if not ok_qty:
                cur.close()
                conn.close()
                return jsonify({'error': err_qty, 'error_type': 'UNIQUE_TYPE_QTY'}), 400
            
            cur.execute("""
                SELECT id, amount FROM supplies_location
                WHERE supply_id = %s AND location_name IS NULL
                  AND coord_x = %s AND coord_y = %s
            """, (supply_id, cx, cy))
            existing = cur.fetchone()
            
            if existing:
                old_amount = existing[1]
                new_amount = old_amount + amount
                cur.execute("""
                    UPDATE supplies_location
                    SET amount = %s, last_modified_by = %s
                    WHERE id = %s
                """, (new_amount, current_user_id, existing[0]))
                location_id = existing[0]
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply['name'],
                    location_name=FREE_COORD_HISTORY_LABEL,
                    shelf=None,
                    old_amount=old_amount,
                    new_amount=new_amount,
                    changed_by=current_user_id,
                    batch_id=batch_id,
                    related_location=f'{cx},{cy}',
                )
            else:
                cur.execute("""
                    INSERT INTO supplies_location
                    (supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified_by)
                    VALUES (%s, NULL, %s, %s, NULL, %s, %s)
                """, (supply_id, cx, cy, amount, current_user_id))
                location_id = cur.lastrowid
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply['name'],
                    location_name=FREE_COORD_HISTORY_LABEL,
                    shelf=None,
                    old_amount=None,
                    new_amount=amount,
                    changed_by=current_user_id,
                    batch_id=batch_id,
                    related_location=f'{cx},{cy}',
                )
        else:
            shelf = data.get('shelf')
            location_name = data['location']
            amount = data['amount']

            total_now = map_total_qty_for_supply(cur, supply_id)
            ok_qty, err_qty = check_unique_type_map_qty(cur, supply_id, total_now + amount)
            if not ok_qty:
                cur.close()
                conn.close()
                return jsonify({'error': err_qty, 'error_type': 'UNIQUE_TYPE_QTY'}), 400
            
            cur.execute("""
                SELECT id, amount FROM supplies_location
                WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
            """, (supply_id, location_name, shelf, shelf))
            
            existing = cur.fetchone()
            
            if existing:
                old_amount = existing[1]
                new_amount = old_amount + amount
                cur.execute("""
                    UPDATE supplies_location
                    SET amount = %s, last_modified_by = %s
                    WHERE id = %s
                """, (new_amount, current_user_id, existing[0]))
                location_id = existing[0]
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply['name'],
                    location_name=location_name,
                    shelf=shelf,
                    old_amount=old_amount,
                    new_amount=new_amount,
                    changed_by=current_user_id,
                    batch_id=batch_id
                )
            else:
                cur.execute("""
                    INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                    VALUES (%s, %s, %s, %s, %s)
                """, (supply_id, location_name, shelf, amount, current_user_id))
                location_id = cur.lastrowid
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply['name'],
                    location_name=location_name,
                    shelf=shelf,
                    old_amount=None,
                    new_amount=amount,
                    changed_by=current_user_id,
                    batch_id=batch_id
                )
        
        cur.execute("""
            UPDATE supplies
            SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
            WHERE id = %s
        """, (current_user_id, supply_id))
        
        conn.commit()
        
        cur.execute("""
            SELECT id, supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified, last_modified_by, created_at
            FROM supplies_location WHERE id = %s
        """, (location_id,))
        
        row = cur.fetchone()
        location = SupplyLocation.from_db_row(row)
        
        cur.close()
        conn.close()
        
        return jsonify(location.to_dict()), 201
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Supply or location does not exist'}), 400
        if 'unique_supply_location_shelf' in str(e).lower():
            return jsonify({'error': 'Supply location already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/<int:location_id>', methods=['PUT'])
@require_auth
def update_supply_location(location_id, current_user_id=None):
    """
    PUT /api/supplies-location/<id>
    Update a supply location (change amount, shelf, or move to different location).
    
    Args:
        location_id: Supply location ID to update
        
    Request body:
        {
            "amount": int (optional),
            "shelf": int (optional),
            "location": "string" (optional, for moving)
        }
        
    Returns:
        JSON object of the updated supply location
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("""
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.id = %s
        """, (location_id,))
        old_location = cur.fetchone()
        if not old_location:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply location not found'}), 404
        
        cur = conn.cursor()
        
        updates = []
        values = []
        
        old_amount = old_location['amount']
        old_location_name = old_location['location_name']
        old_shelf = old_location['shelf']
        is_free = old_location_name is None and old_location.get('coord_x') is not None
        
        hist_location = FREE_COORD_HISTORY_LABEL if is_free else old_location_name
        
        if 'amount' in data:
            if data['amount'] < 0:
                cur.close()
                conn.close()
                return jsonify({'error': 'Amount cannot be negative'}), 400
            updates.append("amount = %s")
            values.append(data['amount'])
        
        if 'shelf' in data and not is_free:
            updates.append("shelf = %s")
            values.append(data['shelf'])
        
        if 'location' in data:
            if is_free:
                cur.close()
                conn.close()
                return jsonify({'error': 'Cannot change box location on a free-coordinate row'}), 400
            updates.append("location_name = %s")
            values.append(data['location'])
        
        if 'coord_x' in data and 'coord_y' in data:
            if not is_free:
                cur.close()
                conn.close()
                return jsonify({'error': 'coord_x/coord_y only for free-coordinate placements'}), 400
            cx, cy = clamp_coords_to_room(data['coord_x'], data['coord_y'])
            if not coords_in_room(cx, cy):
                cur.close()
                conn.close()
                return jsonify({'error': 'Coordinates must be inside the map room bounds'}), 400
            updates.append("coord_x = %s")
            updates.append("coord_y = %s")
            values.extend([cx, cy])
        
        updates.append("last_modified_by = %s")
        values.append(current_user_id)
        
        values.append(location_id)
        
        if len(updates) > 1:
            if 'amount' in data:
                total_now = map_total_qty_for_supply(cur, old_location['supply_id'])
                proposed = total_now - old_amount + int(data['amount'])
                ok_qty, err_qty = check_unique_type_map_qty(cur, old_location['supply_id'], proposed)
                if not ok_qty:
                    cur.close()
                    conn.close()
                    return jsonify({'error': err_qty, 'error_type': 'UNIQUE_TYPE_QTY'}), 400

            query = f"UPDATE supplies_location SET {', '.join(updates)} WHERE id = %s"
            cur.execute(query, values)
            
            if 'amount' in data:
                log_location_history(
                    conn, 'UPDATE',
                    supply_id=old_location['supply_id'],
                    supply_name=old_location['supply_name'],
                    location_name=hist_location,
                    shelf=old_shelf,
                    old_amount=old_amount,
                    new_amount=data['amount'],
                    changed_by=current_user_id,
                    batch_id=str(uuid.uuid4()),
                    related_location=(
                        f"{old_location['coord_x']},{old_location['coord_y']}"
                        if is_free else None
                    ),
                )
            elif 'coord_x' in data:
                log_location_history(
                    conn, 'UPDATE',
                    supply_id=old_location['supply_id'],
                    supply_name=old_location['supply_name'],
                    location_name=hist_location,
                    shelf=old_shelf,
                    old_amount=old_amount,
                    new_amount=old_amount,
                    changed_by=current_user_id,
                    batch_id=str(uuid.uuid4()),
                    related_location=f"{old_location['coord_x']},{old_location['coord_y']}",
                )
            
            cur.execute("""
                UPDATE supplies
                SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
                WHERE id = %s
            """, (current_user_id, old_location['supply_id']))
            
            conn.commit()
        
        cur.execute("""
            SELECT id, supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified, last_modified_by, created_at
            FROM supplies_location WHERE id = %s
        """, (location_id,))
        
        row = cur.fetchone()
        location = SupplyLocation.from_db_row(row)
        
        cur.close()
        conn.close()
        
        return jsonify(location.to_dict()), 200
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Location does not exist'}), 400
        if 'unique_supply_location_shelf' in str(e).lower():
            return jsonify({'error': 'Supply location already exists at this location/shelf'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/<int:location_id>', methods=['DELETE'])
@require_auth
def delete_supply_location(location_id, current_user_id=None):
    """
    DELETE /api/supplies-location/<id>
    Delete a supply location.
    
    Args:
        location_id: Supply location ID to delete
        
    Returns:
        204 No Content on success, 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("""
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.id = %s
        """, (location_id,))
        location_data = cur.fetchone()
        if not location_data:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply location not found'}), 404
        
        del_free = location_data['location_name'] is None and location_data.get('coord_x') is not None
        log_location_history(
            conn, 'REMOVE',
            supply_id=location_data['supply_id'],
            supply_name=location_data['supply_name'],
            location_name=FREE_COORD_HISTORY_LABEL if del_free else location_data['location_name'],
            shelf=location_data['shelf'],
            old_amount=location_data['amount'],
            new_amount=None,
            changed_by=current_user_id,
            batch_id=str(uuid.uuid4()),
            related_location=(
                f"{location_data['coord_x']},{location_data['coord_y']}" if del_free else None
            ),
        )
        
        cur = conn.cursor()  # Switch back to regular cursor
        cur.execute("DELETE FROM supplies_location WHERE id = %s", (location_id,))
        
        # Update the master supply's last_modified timestamp
        cur.execute("""
            UPDATE supplies
            SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
            WHERE id = %s
        """, (current_user_id, location_data['supply_id']))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/move', methods=['POST'])
@require_auth
def move_supply_locations(current_user_id=None):
    """
    POST /api/supplies-location/move
    Move supplies between locations.
    
    Request body:
        {
            "from_location": "string" (required),
            "to_location": "string" (required),
            "supply_id": int (required),
            "shelf_from": int (optional),
            "shelf_to": int (optional),
            "amount": int (required)
        }
        
    Returns:
        JSON object with move results
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        required_fields = ['from_location', 'to_location', 'supply_id', 'amount']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        if data['from_location'] == data['to_location'] and data.get('shelf_from') == data.get('shelf_to'):
            return jsonify({'error': 'Source and destination must be different'}), 400
        
        if data['amount'] <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        supply_id = data['supply_id']
        shelf_from = data.get('shelf_from')
        shelf_to = data.get('shelf_to')
        amount = data['amount']
        
        # Get supply name for history
        cur.execute("SELECT name FROM supplies WHERE id = %s", (supply_id,))
        supply = cur.fetchone()
        if not supply:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        supply_name = supply['name']
        
        # Get source location
        cur.execute("""
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """, (supply_id, data['from_location'], shelf_from, shelf_from))
        
        source = cur.fetchone()
        if not source:
            cur.close()
            conn.close()
            return jsonify({'error': 'Source supply location not found'}), 404
        
        source_id = source['id']
        source_amount = source['amount']
        
        if amount > source_amount:
            cur.close()
            conn.close()
            return jsonify({'error': f'Cannot move {amount} units. Only {source_amount} available'}), 400
        
        # Get or create destination location
        cur.execute("""
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """, (supply_id, data['to_location'], shelf_to, shelf_to))
        
        dest = cur.fetchone()
        
        # Calculate new amounts
        new_source_amount = source_amount - amount
        
        batch_id = str(uuid.uuid4())
        
        cur = conn.cursor()  # Switch to regular cursor for updates
        
        if dest:
            dest_id = dest['id']
            dest_amount = dest['amount']
            new_dest_amount = dest_amount + amount
            cur.execute("""
                UPDATE supplies_location
                SET amount = %s, last_modified_by = %s
                WHERE id = %s
            """, (new_dest_amount, current_user_id, dest_id))
        else:
            cur.execute("""
                INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (supply_id, data['to_location'], shelf_to, amount, current_user_id))
            new_dest_amount = amount
        
        # Update or delete source
        if new_source_amount > 0:
            cur.execute("""
                UPDATE supplies_location
                SET amount = %s, last_modified_by = %s
                WHERE id = %s
            """, (new_source_amount, current_user_id, source_id))
        else:
            cur.execute("DELETE FROM supplies_location WHERE id = %s", (source_id,))
        
        # Log history: MOVE action (two rows: REMOVE from source, ADD to dest)
        log_location_history(
            conn, 'REMOVE',
            supply_id=supply_id,
            supply_name=supply_name,
            location_name=data['from_location'],
            shelf=shelf_from,
            old_amount=source_amount,
            new_amount=new_source_amount if new_source_amount > 0 else None,
            changed_by=current_user_id,
            related_location=data['to_location'],
            related_shelf=shelf_to,
            batch_id=batch_id
        )
        log_location_history(
            conn, 'ADD',
            supply_id=supply_id,
            supply_name=supply_name,
            location_name=data['to_location'],
            shelf=shelf_to,
            old_amount=dest['amount'] if dest else None,
            new_amount=new_dest_amount,
            changed_by=current_user_id,
            related_location=data['from_location'],
            related_shelf=shelf_from,
            batch_id=batch_id
        )
        
        # Update the master supply's last_modified timestamp
        cur.execute("""
            UPDATE supplies
            SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
            WHERE id = %s
        """, (current_user_id, supply_id))
        
        conn.commit()
        
        result = {
            'moved': amount,
            'from_remaining': new_source_amount,
            'to_total': new_dest_amount
        }
        
        cur.close()
        conn.close()
        
        return jsonify(result), 200
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Location does not exist'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_location_bp.route('/bulk-add', methods=['POST'])
@require_auth
def bulk_add_supply_locations(current_user_id=None):
    """
    POST /api/supplies-location/bulk-add
    Bulk add supplies to multiple locations (atomic transaction).
    
    Request body:
        {
            "supply_id": int (required),
            "additions": [
                {
                    "location": "string" (required),
                    "shelf": int (optional),
                    "amount": int (required)
                },
                ...
            ]
        }
        
    Returns:
        JSON object with results
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        if 'supply_id' not in data or 'additions' not in data:
            return jsonify({'error': 'Missing required fields: supply_id, additions'}), 400
        
        if not isinstance(data['additions'], list) or len(data['additions']) == 0:
            return jsonify({'error': 'additions must be a non-empty array'}), 400
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        supply_id = data['supply_id']
        additions = data['additions']
        
        # Get supply name for history
        cur.execute("SELECT name FROM supplies WHERE id = %s", (supply_id,))
        supply = cur.fetchone()
        if not supply:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        supply_name = supply['name']
        
        # Validate all additions
        for addition in additions:
            if 'location' not in addition or 'amount' not in addition:
                cur.close()
                conn.close()
                return jsonify({'error': 'Each addition must have location and amount'}), 400
            if addition['amount'] <= 0:
                cur.close()
                conn.close()
                return jsonify({'error': 'Amount must be positive'}), 400
        
        # Generate batch_id for all additions
        batch_id = str(uuid.uuid4())
        
        cur = conn.cursor()  # Switch to regular cursor for updates
        
        # Process all additions in a transaction
        results = []
        for addition in additions:
            location_name = addition['location']
            shelf = addition.get('shelf')
            amount = addition['amount']

            total_now = map_total_qty_for_supply(cur, supply_id)
            ok_qty, err_qty = check_unique_type_map_qty(cur, supply_id, total_now + amount)
            if not ok_qty:
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({'error': err_qty, 'error_type': 'UNIQUE_TYPE_QTY'}), 400
            
            # Check if entry exists
            cur.execute("""
                SELECT id, amount FROM supplies_location
                WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
            """, (supply_id, location_name, shelf, shelf))
            
            existing = cur.fetchone()
            
            if existing:
                # Increment existing
                old_amount = existing[1]
                new_amount = old_amount + amount
                cur.execute("""
                    UPDATE supplies_location
                    SET amount = %s, last_modified_by = %s
                    WHERE id = %s
                """, (new_amount, current_user_id, existing[0]))
                results.append({
                    'location': location_name,
                    'shelf': shelf,
                    'action': 'updated',
                    'new_amount': new_amount
                })
                # Log history: ADD action (incrementing existing)
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply_name,
                    location_name=location_name,
                    shelf=shelf,
                    old_amount=old_amount,
                    new_amount=new_amount,
                    changed_by=current_user_id,
                    batch_id=batch_id
                )
            else:
                # Insert new
                cur.execute("""
                    INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                    VALUES (%s, %s, %s, %s, %s)
                """, (supply_id, location_name, shelf, amount, current_user_id))
                results.append({
                    'location': location_name,
                    'shelf': shelf,
                    'action': 'created',
                    'new_amount': amount
                })
                # Log history: ADD action (new entry)
                log_location_history(
                    conn, 'ADD',
                    supply_id=supply_id,
                    supply_name=supply_name,
                    location_name=location_name,
                    shelf=shelf,
                    old_amount=None,
                    new_amount=amount,
                    changed_by=current_user_id,
                    batch_id=batch_id
                )
        
        # Update the master supply's last_modified timestamp
        cur.execute("""
            UPDATE supplies
            SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
            WHERE id = %s
        """, (current_user_id, supply_id))
        
        conn.commit()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'supply_id': supply_id,
            'results': results
        }), 201
    except mysql.connector.IntegrityError as e:
        conn.rollback()
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Supply or location does not exist'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500

