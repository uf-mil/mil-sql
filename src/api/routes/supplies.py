"""
Supply API routes (catalog/reference table).
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify, session
import mysql.connector
from src.api.db import get_db
from src.api.models.supply import Supply
from src.api.middleware.auth import require_auth

supplies_bp = Blueprint('supplies', __name__)


@supplies_bp.route('', methods=['GET'])
@require_auth
def get_supplies(current_user_id=None):
    """
    GET /api/supplies
    Get all supplies (catalog) with computed quantities and locations.
    
    Returns:
        JSON array of supplies with totalQty and locations[] computed from supplies_location
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Get all supplies with computed quantities
        cur.execute("""
            SELECT 
                s.id,
                s.name,
                s.description,
                s.image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) as totalQty
            FROM supplies s
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            GROUP BY s.id, s.name, s.description, s.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
            ORDER BY s.name
        """)
        
        supplies = []
        for row in cur.fetchall():
            # Get locations for this supply
            cur.execute("""
                SELECT location_name, shelf, amount
                FROM supplies_location
                WHERE supply_id = %s
                ORDER BY location_name, shelf
            """, (row['id'],))
            
            locations = []
            for loc_row in cur.fetchall():
                locations.append({
                    'location': loc_row['location_name'],
                    'shelf': loc_row['shelf'],
                    'qty': loc_row['amount']
                })
            
            supply_dict = {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'image': row['image'],
                'lastModified': row['last_modified'].isoformat() if row['last_modified'] else None,
                'totalQty': int(row['totalQty']),
                'locations': locations
            }
            if row['last_order_date']:
                supply_dict['last_order_date'] = row['last_order_date'].isoformat() if hasattr(row['last_order_date'], 'isoformat') else str(row['last_order_date'])
            
            supplies.append(supply_dict)
        
        cur.close()
        conn.close()
        return jsonify(supplies), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['GET'])
@require_auth
def get_supply(supply_id, current_user_id=None):
    """
    GET /api/supplies/<id>
    Get a specific supply by ID with computed quantities and locations.
    
    Args:
        supply_id: Supply ID
        
    Returns:
        JSON object of the supply or 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        cur.execute("""
            SELECT 
                s.id,
                s.name,
                s.description,
                s.image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) as totalQty
            FROM supplies s
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            WHERE s.id = %s
            GROUP BY s.id, s.name, s.description, s.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
        """, (supply_id,))
        
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        # Get locations for this supply
        cur.execute("""
            SELECT location_name, shelf, amount
            FROM supplies_location
            WHERE supply_id = %s
            ORDER BY location_name, shelf
        """, (supply_id,))
        
        locations = []
        for loc_row in cur.fetchall():
            locations.append({
                'location': loc_row['location_name'],
                'shelf': loc_row['shelf'],
                'qty': loc_row['amount']
            })
        
        supply_dict = {
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'image': row['image'],
            'lastModified': row['last_modified'].isoformat() if row['last_modified'] else None,
            'totalQty': int(row['totalQty']),
            'locations': locations
        }
        if row['last_order_date']:
            supply_dict['last_order_date'] = row['last_order_date'].isoformat() if hasattr(row['last_order_date'], 'isoformat') else str(row['last_order_date'])
        
        cur.close()
        conn.close()
        return jsonify(supply_dict), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('', methods=['POST'])
@require_auth
def create_supply(current_user_id=None):
    """
    POST /api/supplies
    Create a new supply (catalog entry).
    
    Request body:
        {
            "name": "string" (required),
            "description": "string" (optional),
            "image": "data:image/...;base64,..." (optional, max 10MB file),
            "last_order_date": "YYYY-MM-DD" (optional)
        }
        
    Returns:
        JSON object of the created supply
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        if 'name' not in data or not data['name'].strip():
            return jsonify({'error': 'Name is required'}), 400
        
        # Validate image size (max 10MB file = ~13.3MB base64)
        if 'image' in data and data['image']:
            # Base64 data URI format: data:image/...;base64,<base64_string>
            if data['image'].startswith('data:image'):
                base64_part = data['image'].split(',', 1)[1] if ',' in data['image'] else ''
                # Approximate: base64 is ~33% larger than original
                if len(base64_part) > 13_300_000:  # ~10MB file
                    return jsonify({'error': 'Image file size exceeds 10MB limit'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Check if supply with this name already exists
        cur.execute("SELECT id FROM supplies WHERE name = %s", (data['name'].strip(),))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply with this name already exists'}), 400
        
        # Insert new supply
        cur.execute("""
            INSERT INTO supplies (name, description, image, last_order_date, last_modified_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            data['name'].strip(),
            data.get('description', '').strip() or None,
            data.get('image') or None,
            data.get('last_order_date') or None,
            current_user_id
        ))
        
        supply_id = cur.lastrowid
        conn.commit()
        
        # Fetch the created supply
        cur.execute("""
            SELECT id, name, description, image, last_order_date, last_modified, last_modified_by, created_at
            FROM supplies WHERE id = %s
        """, (supply_id,))
        
        row = cur.fetchone()
        supply = Supply.from_db_row(row).to_dict()
        supply['totalQty'] = 0
        supply['locations'] = []
        
        cur.close()
        conn.close()
        
        return jsonify(supply), 201
    except mysql.connector.IntegrityError as e:
        if 'Duplicate entry' in str(e) or 'unique' in str(e).lower():
            return jsonify({'error': 'Supply with this name already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['PUT'])
@require_auth
def update_supply(supply_id, current_user_id=None):
    """
    PUT /api/supplies/<id>
    Update an existing supply (catalog entry).
    
    Args:
        supply_id: Supply ID to update
        
    Request body:
        {
            "name": "string" (optional),
            "description": "string" (optional),
            "image": "data:image/...;base64,..." (optional, max 10MB file),
            "last_order_date": "YYYY-MM-DD" (optional)
        }
        
    Returns:
        JSON object of the updated supply
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate image size if provided
        if 'image' in data and data['image']:
            if data['image'].startswith('data:image'):
                base64_part = data['image'].split(',', 1)[1] if ',' in data['image'] else ''
                if len(base64_part) > 13_300_000:
                    return jsonify({'error': 'Image file size exceeds 10MB limit'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Check if supply exists
        cur.execute("SELECT id FROM supplies WHERE id = %s", (supply_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        # Check if name is being changed and new name already exists
        if 'name' in data and data['name']:
            cur.execute("SELECT id FROM supplies WHERE name = %s AND id != %s", (data['name'].strip(), supply_id))
            if cur.fetchone():
                cur.close()
                conn.close()
                return jsonify({'error': 'Supply with this name already exists'}), 400
        
        # Build update query
        updates = []
        values = []
        
        if 'name' in data:
            updates.append("name = %s")
            values.append(data['name'].strip())
        if 'description' in data:
            updates.append("description = %s")
            values.append(data['description'].strip() or None)
        if 'image' in data:
            updates.append("image = %s")
            values.append(data['image'] or None)
        if 'last_order_date' in data:
            updates.append("last_order_date = %s")
            values.append(data['last_order_date'] or None)
        
        # Always update last_modified_by
        updates.append("last_modified_by = %s")
        values.append(current_user_id)
        
        values.append(supply_id)
        
        if updates:
            query = f"UPDATE supplies SET {', '.join(updates)} WHERE id = %s"
            cur.execute(query, values)
            conn.commit()
        
        # Fetch updated supply
        cur.execute("""
            SELECT id, name, description, image, last_order_date, last_modified, last_modified_by, created_at
            FROM supplies WHERE id = %s
        """, (supply_id,))
        
        row = cur.fetchone()
        supply = Supply.from_db_row(row).to_dict()
        
        # Get computed quantities
        cur.execute("""
            SELECT COALESCE(SUM(amount), 0) as totalQty
            FROM supplies_location
            WHERE supply_id = %s
        """, (supply_id,))
        total_qty = cur.fetchone()[0] or 0
        
        cur.execute("""
            SELECT location_name, shelf, amount
            FROM supplies_location
            WHERE supply_id = %s
            ORDER BY location_name, shelf
        """, (supply_id,))
        
        locations = []
        for loc_row in cur.fetchall():
            locations.append({
                'location': loc_row[0],
                'shelf': loc_row[1],
                'qty': loc_row[2]
            })
        
        supply['totalQty'] = int(total_qty)
        supply['locations'] = locations
        
        cur.close()
        conn.close()
        
        return jsonify(supply), 200
    except mysql.connector.IntegrityError as e:
        if 'Duplicate entry' in str(e) or 'unique' in str(e).lower():
            return jsonify({'error': 'Supply with this name already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/<int:supply_id>', methods=['DELETE'])
@require_auth
def delete_supply(supply_id, current_user_id=None):
    """
    DELETE /api/supplies/<id>
    Delete a supply (catalog entry).
    CASCADE will automatically delete all supplies_location entries.
    
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
