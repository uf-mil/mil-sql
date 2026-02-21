"""
Location API routes.
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify
import mysql.connector
from src.api.db import get_db
from src.api.models.location import Location

locations_bp = Blueprint('locations', __name__)


@locations_bp.route('', methods=['GET'])
def get_locations():
    """
    GET /api/locations
    Get all locations.
    
    Returns:
        JSON array of all locations
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name, x, y, width, height, type FROM locations ORDER BY name")
        rows = cur.fetchall()
        locations = [Location.from_db_row(row).to_dict() for row in rows]
        cur.close()
        conn.close()
        return jsonify(locations), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@locations_bp.route('/<name>', methods=['GET'])
def get_location(name):
    """
    GET /api/locations/<name>
    Get a specific location by name.
    
    Args:
        name: Location name
        
    Returns:
        JSON object of the location or 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name, x, y, width, height, type FROM locations WHERE name = %s", (name,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if row:
            location = Location.from_db_row(row).to_dict()
            return jsonify(location), 200
        else:
            return jsonify({'error': 'Location not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@locations_bp.route('', methods=['POST'])
def create_location():
    """
    POST /api/locations
    Create a new location.
    
    Request body:
        {
            "name": "string",
            "x": int,
            "y": int,
            "width": int,
            "height": int,
            "type": "string"
        }
        
    Returns:
        JSON object of the created location
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate required fields
        required_fields = ['name', 'x', 'y', 'width', 'height', 'type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        location = Location.from_dict(data)
        
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO locations (name, x, y, width, height, type) VALUES (%s, %s, %s, %s, %s, %s)",
            (location.name, location.x, location.y, location.width, location.height, location.type)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify(location.to_dict()), 201
    except mysql.connector.IntegrityError as e:
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'Location with this name already exists'}), 409
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@locations_bp.route('/<name>', methods=['PUT'])
def update_location(name):
    """
    PUT /api/locations/<name>
    Update an existing location.
    
    Args:
        name: Location name to update
        
    Request body:
        {
            "x": int,
            "y": int,
            "width": int,
            "height": int,
            "type": "string"
        }
        Note: name cannot be updated via PUT
        
    Returns:
        JSON object of the updated location
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validate fields (name is not updatable via PUT)
        updatable_fields = ['x', 'y', 'width', 'height', 'type']
        update_data = {k: v for k, v in data.items() if k in updatable_fields}
        
        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        conn = get_db()
        cur = conn.cursor()
        
        # Check if location exists
        cur.execute("SELECT name FROM locations WHERE name = %s", (name,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Location not found'}), 404
        
        # Build update query dynamically
        set_clauses = []
        values = []
        for field, value in update_data.items():
            set_clauses.append(f"{field} = %s")
            values.append(value)
        values.append(name)
        
        query = f"UPDATE locations SET {', '.join(set_clauses)} WHERE name = %s"
        cur.execute(query, values)
        conn.commit()
        
        # Fetch updated location
        cur.execute("SELECT name, x, y, width, height, type FROM locations WHERE name = %s", (name,))
        row = cur.fetchone()
        location = Location.from_db_row(row).to_dict()
        
        cur.close()
        conn.close()
        
        return jsonify(location), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@locations_bp.route('/<name>', methods=['DELETE'])
def delete_location(name):
    """
    DELETE /api/locations/<name>
    Delete a location.
    
    Args:
        name: Location name to delete
        
    Returns:
        204 No Content on success, 404 if not found
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Check if location exists
        cur.execute("SELECT name FROM locations WHERE name = %s", (name,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Location not found'}), 404
        
        cur.execute("DELETE FROM locations WHERE name = %s", (name,))
        conn.commit()
        cur.close()
        conn.close()
        
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500

