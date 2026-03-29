"""
Location API routes.
"""
import sys
import json
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify
import mysql.connector
from src.api.db import get_db
from src.api.models.location import Location
from src.api.middleware.auth import require_leader
from src.api.repositories import locations_repository as repo

locations_bp = Blueprint('locations', __name__)


def get_fill_for_type(location_type):
    """Get CSS fill color variable for location type."""
    type_fills = {
        'drawer': 'var(--drawer)',
        'cabinet': 'var(--table)',
        'tall_cabinet': 'var(--table)',
        'table': 'var(--table)',
        'other': 'var(--table)',
        'special': '#ff69b4',  # Special category - pink
        'external': '#ff9800',  # External category - orange
    }
    return type_fills.get(location_type, 'var(--table)')


def sync_locations_json():
    """
    Sync inventory-locations.json with database.
    Updates the JSON file to match current database state.
    NOTE: This function is deprecated and no longer called. JSON file is now seed data only.
    """
    try:
        # Get project root (go up from src/api/routes to project root)
        script_dir = Path(__file__).parent.parent.parent.parent
        # JSON file is now in seed_data directory
        json_path = script_dir / "src" / "seed_data" / "inventory-locations.json"
        
        if not json_path.exists():
            # Try legacy path for backwards compatibility
            json_path = script_dir / "milventory" / "public" / "inventory-locations.json"
            if not json_path.exists():
                print(f"⚠ Warning: inventory-locations.json not found at {json_path}")
                return False
        
        # Fetch all locations from DB
        conn = get_db()
        cur = conn.cursor()
        rows = repo.list_all_tuple_ordered(cur)
        db_locations = {}
        for row in rows:
            db_locations[row[0]] = {
                'name': row[0],
                'x': row[1],
                'y': row[2],
                'width': row[3],
                'height': row[4],
                'type': row[5],
                'protected': bool(row[6]) if len(row) > 6 else False
            }
        cur.close()
        conn.close()
        
        # Load existing JSON to preserve inventory-bounds
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            # Create default structure if file doesn't exist or is invalid
            data = {
                "inventory-bounds": {
                    "viewBox": {"x": 0, "y": 0, "width": 4000, "height": 4000},
                    "room": {"x": 80, "y": 80, "width": 3600, "height": 3840, "rx": 18, "ry": 18}
                },
                "boxes": []
            }
        
        # Convert DB locations to JSON boxes format
        boxes = []
        for name, loc_data in db_locations.items():
            boxes.append({
                'title': loc_data['name'],
                'x': loc_data['x'],
                'y': loc_data['y'],
                'width': loc_data['width'],
                'height': loc_data['height'],
                'fill': get_fill_for_type(loc_data['type'])
            })
        
        data['boxes'] = boxes
        
        # Write back to JSON
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        
        # Also update the alternative path if it exists
        alt_path = script_dir / "milventory" / "public" / "inventory-locations.json"
        if alt_path.exists() and alt_path != json_path:
            with open(alt_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        
        return True
    except Exception as e:
        print(f"⚠ Warning: Failed to sync locations JSON: {e}")
        import traceback
        traceback.print_exc()
        return False


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
        rows = repo.list_all_tuple_ordered(cur)
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
        row = repo.fetch_by_name_tuple(cur, name)
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
@require_leader
def create_location(current_user_id=None):
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
        
        # Determine shelf_count based on type
        shelf_count = 6 if location.type == 'tall_cabinet' else 0
        
        conn = get_db()
        cur = conn.cursor()
        repo.insert_location(
            cur,
            location.name,
            location.x,
            location.y,
            location.width,
            location.height,
            location.type,
            shelf_count,
            False,
        )
        conn.commit()
        cur.close()
        conn.close()
        
        # Note: New locations are stored only in the database with protected=FALSE by default.
        # Protected status is managed via the database column, not the JSON file.
        
        return jsonify(location.to_dict()), 201
    except mysql.connector.IntegrityError as e:
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'Location with this name already exists'}), 409
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error creating location: {e}")
        import traceback
        traceback.print_exc()
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
        
        # Validate fields
        updatable_fields = ['x', 'y', 'width', 'height', 'type', 'name']
        update_data = {k: v for k, v in data.items() if k in updatable_fields}
        
        if not update_data:
            return jsonify({'error': 'No valid fields to update'}), 400
        
        conn = get_db()
        cur = conn.cursor()

        if not repo.name_exists(cur, name):
            cur.close()
            conn.close()
            return jsonify({'error': 'Location not found'}), 404

        new_name = update_data.pop('name', None)

        if update_data:
            set_clauses = []
            values = []
            for field, value in update_data.items():
                set_clauses.append(f"{field} = %s")
                values.append(value)
            values.append(name)
            repo.update_by_name(cur, set_clauses, values)

        final_name = name
        if new_name and new_name != name:
            if repo.name_exists(cur, new_name):
                cur.close()
                conn.close()
                return jsonify({'error': f'Location "{new_name}" already exists'}), 409
            repo.rename(cur, new_name, name)
            final_name = new_name
        
        conn.commit()
        
        # Fetch updated location using final name
        row = repo.fetch_by_name_tuple(cur, final_name)
        location = Location.from_db_row(row).to_dict()
        
        cur.close()
        conn.close()
        
        return jsonify(location), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@locations_bp.route('/<name>', methods=['DELETE'])
@require_leader
def delete_location(name, current_user_id=None):
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
        
        if not repo.name_exists(cur, name):
            cur.close()
            conn.close()
            return jsonify({'error': 'Location not found'}), 404

        repo.delete_by_name(cur, name)
        conn.commit()
        cur.close()
        conn.close()
        
        # Note: Deletions only affect the database.
        # Protected locations cannot be deleted (enforced by frontend based on protected column).
        
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500

