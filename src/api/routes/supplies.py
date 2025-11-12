"""
Supply API routes.
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify
import mysql.connector
from src.api.db import get_db
from src.api.models.supply import Supply

supplies_bp = Blueprint('supplies', __name__)


@supplies_bp.route('', methods=['GET'])
def get_supplies():
    """
    GET /api/supplies
    Get all supplies, optionally filtered by location.
    
    Query parameters:
        location: Optional location name to filter by
        
    Returns:
        JSON array of all supplies
    """
    try:
        location_filter = request.args.get('location')
        
        conn = get_db()
        cur = conn.cursor()
        
        if location_filter:
            cur.execute(
                "SELECT id, name, amount, last_order_date, location FROM supplies WHERE location = %s ORDER BY name",
                (location_filter,)
            )
        else:
            cur.execute("SELECT id, name, amount, last_order_date, location FROM supplies ORDER BY name, location")
        
        rows = cur.fetchall()
        supplies = [Supply.from_db_row(row).to_dict() for row in rows]
        cur.close()
        conn.close()
        return jsonify(supplies), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['GET'])
def get_supply(supply_id):
    """
    GET /api/supplies/<id>
    Get a specific supply by ID.
    
    Args:
        supply_id: Supply ID
        
    Returns:
        JSON object of the supply or 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, amount, last_order_date, location FROM supplies WHERE id = %s",
            (supply_id,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            supply = Supply.from_db_row(row).to_dict()
            return jsonify(supply), 200
        else:
            return jsonify({'error': 'Supply not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('', methods=['POST'])
def create_supply():
    """
    POST /api/supplies
    Create a new supply entry.
    
    Request body:
        {
            "name": "string",
            "amount": int,
            "last_order_date": "YYYY-MM-DD" (optional),
            "location": "string"
        }
        
    Returns:
        JSON object of the created supply
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate required fields
        required_fields = ['name', 'amount', 'location']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        if data['amount'] < 0:
            return jsonify({'error': 'Amount cannot be negative'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Check if supply already exists at this location
        cur.execute(
            "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
            (data['name'], data['location'])
        )
        existing = cur.fetchone()
        
        if existing:
            # Update existing entry by adding to amount
            new_amount = existing[1] + data['amount']
            cur.execute(
                "UPDATE supplies SET amount = %s WHERE id = %s",
                (new_amount, existing[0])
            )
            supply_id = existing[0]
        else:
            # Create new entry
            cur.execute(
                "INSERT INTO supplies (name, amount, last_order_date, location) VALUES (%s, %s, %s, %s)",
                (data['name'], data['amount'], data.get('last_order_date'), data['location'])
            )
            supply_id = cur.lastrowid
        
        conn.commit()
        
        # Fetch the created/updated supply
        cur.execute(
            "SELECT id, name, amount, last_order_date, location FROM supplies WHERE id = %s",
            (supply_id,)
        )
        row = cur.fetchone()
        supply = Supply.from_db_row(row).to_dict()
        
        cur.close()
        conn.close()
        
        return jsonify(supply), 201
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Location does not exist'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['PUT'])
def update_supply(supply_id):
    """
    PUT /api/supplies/<id>
    Update an existing supply entry.
    
    Args:
        supply_id: Supply ID to update
        
    Request body:
        {
            "amount": int (optional),
            "last_order_date": "YYYY-MM-DD" (optional)
        }
        Note: name and location cannot be updated via PUT (use move endpoint)
        
    Returns:
        JSON object of the updated supply
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate fields (name and location are not updatable via PUT)
        updatable_fields = ['amount', 'last_order_date']
        update_data = {k: v for k, v in data.items() if k in updatable_fields}
        
        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        if 'amount' in update_data and update_data['amount'] < 0:
            return jsonify({'error': 'Amount cannot be negative'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Check if supply exists
        cur.execute("SELECT id FROM supplies WHERE id = %s", (supply_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        # Build update query dynamically
        set_clauses = []
        values = []
        for field, value in update_data.items():
            set_clauses.append(f"{field} = %s")
            values.append(value)
        values.append(supply_id)
        
        query = f"UPDATE supplies SET {', '.join(set_clauses)} WHERE id = %s"
        cur.execute(query, values)
        conn.commit()
        
        # Fetch updated supply
        cur.execute(
            "SELECT id, name, amount, last_order_date, location FROM supplies WHERE id = %s",
            (supply_id,)
        )
        row = cur.fetchone()
        supply = Supply.from_db_row(row).to_dict()
        
        cur.close()
        conn.close()
        
        return jsonify(supply), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['DELETE'])
def delete_supply(supply_id):
    """
    DELETE /api/supplies/<id>
    Delete a supply entry.
    
    Args:
        supply_id: Supply ID to delete
        
    Returns:
        204 No Content on success, 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Check if supply exists
        cur.execute("SELECT id FROM supplies WHERE id = %s", (supply_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/move', methods=['POST'])
def move_supplies():
    """
    POST /api/supplies/move
    Move supplies from one location to another.
    
    Request body:
        {
            "name": "string",           # Supply name
            "from_location": "string",  # Source location
            "to_location": "string",    # Destination location
            "amount": int                # Amount to move (optional, defaults to all)
        }
        
    Returns:
        JSON object with move results:
        {
            "moved": int,                # Amount actually moved
            "from_remaining": int,       # Remaining at source
            "to_total": int              # Total at destination after move
        }
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate required fields
        required_fields = ['name', 'from_location', 'to_location']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        if data['from_location'] == data['to_location']:
            return jsonify({'error': 'Source and destination locations must be different'}), 400
        
        amount_to_move = data.get('amount')  # None means move all
        
        if amount_to_move is not None and amount_to_move <= 0:
            return jsonify({'error': 'Amount to move must be positive'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Get source supply entry
        cur.execute(
            "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
            (data['name'], data['from_location'])
        )
        source_entry = cur.fetchone()
        
        if not source_entry:
            cur.close()
            conn.close()
            return jsonify({'error': f'Supply "{data["name"]}" not found at location "{data["from_location"]}"'}), 404
        
        source_id, source_amount = source_entry
        
        # Determine how much to move
        if amount_to_move is None:
            amount_to_move = source_amount  # Move all
        elif amount_to_move > source_amount:
            cur.close()
            conn.close()
            return jsonify({
                'error': f'Cannot move {amount_to_move} units. Only {source_amount} available at source location'
            }), 400
        
        # Get destination supply entry (if exists)
        cur.execute(
            "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
            (data['name'], data['to_location'])
        )
        dest_entry = cur.fetchone()
        
        # Calculate new amounts
        new_source_amount = source_amount - amount_to_move
        if dest_entry:
            # Destination exists - add to it
            dest_id, dest_amount = dest_entry
            new_dest_amount = dest_amount + amount_to_move
            
            # Update destination
            cur.execute(
                "UPDATE supplies SET amount = %s WHERE id = %s",
                (new_dest_amount, dest_id)
            )
        else:
            # Destination doesn't exist - create new entry
            cur.execute(
                "INSERT INTO supplies (name, amount, location) VALUES (%s, %s, %s)",
                (data['name'], amount_to_move, data['to_location'])
            )
            new_dest_amount = amount_to_move
        
        # Update or delete source
        if new_source_amount > 0:
            # Update source with remaining amount
            cur.execute(
                "UPDATE supplies SET amount = %s WHERE id = %s",
                (new_source_amount, source_id)
            )
        else:
            # Delete source entry if amount becomes 0
            cur.execute("DELETE FROM supplies WHERE id = %s", (source_id,))
        
        conn.commit()
        
        result = {
            'moved': amount_to_move,
            'from_remaining': new_source_amount,
            'to_total': new_dest_amount
        }
        
        cur.close()
        conn.close()
        
        return jsonify(result), 200
    except mysql.connector.IntegrityError as e:
        if 'foreign key constraint' in str(e).lower():
            return jsonify({'error': 'Location does not exist'}), 400
        if 'unique_supply_location' in str(e).lower():
            return jsonify({'error': 'Supply already exists at destination (this should not happen)'}), 500
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

