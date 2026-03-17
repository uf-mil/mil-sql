"""
Custom field definitions API. Public GET for dropdown; admin CRUD for create/update/delete.
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify
import mysql.connector
from src.api.db import get_db
from src.api.models.custom_field_definition import CustomFieldDefinition
from src.api.middleware.auth import require_auth, require_leader

custom_field_definitions_bp = Blueprint('custom_field_definitions', __name__)

VALID_TYPES = ('text', 'number', 'date')


@custom_field_definitions_bp.route('', methods=['GET'])
@require_auth
def get_custom_field_definitions(current_user_id=None):
    """
    GET /api/custom-field-definitions
    Get all custom field definitions (for dropdown in Create/Edit item modal).
    """
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, type
            FROM custom_field_definitions
            ORDER BY name
        """)
        rows = cur.fetchall()
        definitions = [CustomFieldDefinition.from_db_row(row).to_dict() for row in rows]
        cur.close()
        conn.close()
        return jsonify(definitions), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@custom_field_definitions_bp.route('', methods=['POST'])
@require_leader
def create_custom_field_definition(current_user_id=None):
    """
    POST /api/custom-field-definitions
    Create a new custom field definition. Admin only.
    Body: { "name": "Part ID", "type": "text" | "number" | "date" }
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        name = (data.get('name') or '').strip()
        type_val = (data.get('type') or 'text').strip().lower()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        if type_val not in VALID_TYPES:
            return jsonify({'error': f'Type must be one of: {", ".join(VALID_TYPES)}'}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO custom_field_definitions (name, type)
            VALUES (%s, %s)
        """, (name, type_val))
        conn.commit()
        definition_id = cur.lastrowid
        cur.execute("SELECT id, name, type FROM custom_field_definitions WHERE id = %s", (definition_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify(CustomFieldDefinition.from_db_row(row).to_dict()), 201
    except mysql.connector.IntegrityError as e:
        if 'Duplicate entry' in str(e) or 'unique' in str(e).lower():
            return jsonify({'error': 'A custom field with this name already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@custom_field_definitions_bp.route('/<int:definition_id>', methods=['PUT'])
@require_leader
def update_custom_field_definition(definition_id, current_user_id=None):
    """
    PUT /api/custom-field-definitions/<id>
    Update a custom field definition. Admin only.
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        name = (data.get('name') or '').strip() if 'name' in data else None
        type_val = (data.get('type') or '').strip().lower() if 'type' in data else None
        if type_val is not None and type_val not in VALID_TYPES:
            return jsonify({'error': f'Type must be one of: {", ".join(VALID_TYPES)}'}), 400

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM custom_field_definitions WHERE id = %s", (definition_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Custom field definition not found'}), 404

        updates = []
        values = []
        if 'name' in data and name:
            updates.append("name = %s")
            values.append(name)
        if 'type' in data and type_val:
            updates.append("type = %s")
            values.append(type_val)
        if updates:
            values.append(definition_id)
            cur.execute(
                "UPDATE custom_field_definitions SET " + ", ".join(updates) + " WHERE id = %s",
                values
            )
            conn.commit()

        cur.execute("SELECT id, name, type FROM custom_field_definitions WHERE id = %s", (definition_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify(CustomFieldDefinition.from_db_row(row).to_dict()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@custom_field_definitions_bp.route('/<int:definition_id>', methods=['DELETE'])
@require_leader
def delete_custom_field_definition(definition_id, current_user_id=None):
    """
    DELETE /api/custom-field-definitions/<id>
    Delete a custom field definition and remove that field from all supplies. Admin only.
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)

        # Get definition name before deleting (need it to wipe from supplies)
        cur.execute("SELECT name FROM custom_field_definitions WHERE id = %s", (definition_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Custom field definition not found'}), 404
        field_name = row['name']

        # Delete the definition (commit after we've also wiped supplies)
        cur.execute("DELETE FROM custom_field_definitions WHERE id = %s", (definition_id,))

        # Wipe this field from all supplies' custom_fields
        cur.execute("SELECT id, custom_fields FROM supplies WHERE custom_fields IS NOT NULL")
        for row in cur.fetchall():
            cf = row['custom_fields']
            if isinstance(cf, str):
                try:
                    cf = json.loads(cf)
                except (TypeError, ValueError):
                    continue
            if not isinstance(cf, dict) or field_name not in cf:
                continue
            del cf[field_name]
            new_json = json.dumps(cf) if cf else None
            cur.execute("UPDATE supplies SET custom_fields = %s WHERE id = %s", (new_json, row['id']))

        conn.commit()

        cur.close()
        conn.close()
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500
