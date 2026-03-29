"""
Supply types (item templates): public GET; leader CRUD.
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify

from src.api.helpers.datetime_json import db_datetime_to_utc_iso
import mysql.connector
from src.api.db import get_db
from src.api.middleware.auth import require_auth, require_leader
from src.api.helpers.unique_type_qty import type_has_supply_with_map_qty_over_one

supply_types_bp = Blueprint('supply_types', __name__)


def _row_to_dict(row):
    if not row:
        return None
    dcf = row.get('default_custom_fields')
    if isinstance(dcf, str) and dcf:
        try:
            dcf = json.loads(dcf)
        except (TypeError, ValueError):
            dcf = {}
    elif dcf is None:
        dcf = {}
    lck = row.get('locked_custom_field_keys')
    if isinstance(lck, str) and lck:
        try:
            lck = json.loads(lck)
        except (TypeError, ValueError):
            lck = []
    elif lck is None:
        lck = []
    if not isinstance(lck, list):
        lck = []
    return {
        'id': row['id'],
        'name': row['name'],
        'template_description': row.get('template_description'),
        'item_name_prefix': row.get('item_name_prefix') or '',
        'item_description_prefix': row.get('item_description_prefix'),
        'image': row.get('image'),
        'default_custom_fields': dcf,
        'locked_custom_field_keys': lck,
        'is_unique': bool(row.get('is_unique')),
        'created_at': db_datetime_to_utc_iso(row.get('created_at')),
        'updated_at': db_datetime_to_utc_iso(row.get('updated_at')),
    }


@supply_types_bp.route('', methods=['GET'])
@require_auth
def list_supply_types(current_user_id=None):
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, name, template_description, item_name_prefix, item_description_prefix,
                   image, default_custom_fields, locked_custom_field_keys, is_unique,
                   created_at, updated_at
            FROM supply_types
            ORDER BY name
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([_row_to_dict(r) for r in rows]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supply_types_bp.route('/<int:type_id>', methods=['GET'])
@require_auth
def get_supply_type(type_id, current_user_id=None):
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, name, template_description, item_name_prefix, item_description_prefix,
                   image, default_custom_fields, locked_custom_field_keys, is_unique,
                   created_at, updated_at
            FROM supply_types WHERE id = %s
        """, (type_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({'error': 'Type not found'}), 404
        return jsonify(_row_to_dict(row)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supply_types_bp.route('', methods=['POST'])
@require_leader
def create_supply_type(current_user_id=None):
    try:
        data = request.json or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400

        template_description = (data.get('template_description') or '').strip() or None
        item_name_prefix = (data.get('item_name_prefix') or '').strip()
        item_description_prefix = (data.get('item_description_prefix') or '').strip() or None
        image = data.get('image') or None
        dcf = data.get('default_custom_fields')
        if dcf is not None and not isinstance(dcf, dict):
            return jsonify({'error': 'default_custom_fields must be an object'}), 400
        lck = data.get('locked_custom_field_keys')
        if lck is not None and not isinstance(lck, list):
            return jsonify({'error': 'locked_custom_field_keys must be an array'}), 400
        is_unique = 1 if data.get('is_unique') else 0

        if image and str(image).startswith('data:image'):
            b64 = str(image).split(',', 1)[1] if ',' in str(image) else ''
            if len(b64) > 13_300_000:
                return jsonify({'error': 'Image file size exceeds 10MB limit'}), 400

        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            INSERT INTO supply_types (
                name, template_description, item_name_prefix, item_description_prefix,
                image, default_custom_fields, locked_custom_field_keys, is_unique
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            name,
            template_description,
            item_name_prefix,
            item_description_prefix,
            image,
            json.dumps(dcf) if dcf else None,
            json.dumps(lck) if lck else None,
            is_unique,
        ))
        conn.commit()
        tid = cur.lastrowid
        cur.execute("""
            SELECT id, name, template_description, item_name_prefix, item_description_prefix,
                   image, default_custom_fields, locked_custom_field_keys, is_unique,
                   created_at, updated_at
            FROM supply_types WHERE id = %s
        """, (tid,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify(_row_to_dict(row)), 201
    except mysql.connector.IntegrityError as e:
        if 'Duplicate' in str(e) or 'unique' in str(e).lower():
            return jsonify({'error': 'A type with this name already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supply_types_bp.route('/<int:type_id>', methods=['PUT'])
@require_leader
def update_supply_type(type_id, current_user_id=None):
    try:
        data = request.json or {}
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id FROM supply_types WHERE id = %s", (type_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Type not found'}), 404

        if 'is_unique' in data and data.get('is_unique'):
            if type_has_supply_with_map_qty_over_one(cur, type_id):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Cannot enable unique: an item using this type already has more than 1 total quantity on the map.'
                }), 400

        fields = []
        vals = []
        if 'name' in data:
            fields.append('name = %s')
            vals.append((data.get('name') or '').strip())
        if 'template_description' in data:
            fields.append('template_description = %s')
            v = (data.get('template_description') or '').strip() or None
            vals.append(v)
        if 'item_name_prefix' in data:
            fields.append('item_name_prefix = %s')
            vals.append((data.get('item_name_prefix') or '').strip())
        if 'item_description_prefix' in data:
            fields.append('item_description_prefix = %s')
            v = (data.get('item_description_prefix') or '').strip() or None
            vals.append(v)
        if 'image' in data:
            fields.append('image = %s')
            vals.append(data.get('image') or None)
        if 'default_custom_fields' in data:
            dcf = data.get('default_custom_fields')
            if dcf is not None and not isinstance(dcf, dict):
                cur.close()
                conn.close()
                return jsonify({'error': 'default_custom_fields must be an object'}), 400
            fields.append('default_custom_fields = %s')
            vals.append(json.dumps(dcf) if dcf else None)
        if 'locked_custom_field_keys' in data:
            lck = data.get('locked_custom_field_keys')
            if lck is not None and not isinstance(lck, list):
                cur.close()
                conn.close()
                return jsonify({'error': 'locked_custom_field_keys must be an array'}), 400
            fields.append('locked_custom_field_keys = %s')
            vals.append(json.dumps(lck) if lck else None)
        if 'is_unique' in data:
            fields.append('is_unique = %s')
            vals.append(1 if data.get('is_unique') else 0)

        if fields:
            vals.append(type_id)
            cur.execute(f"UPDATE supply_types SET {', '.join(fields)} WHERE id = %s", vals)
            conn.commit()

        cur.execute("""
            SELECT id, name, template_description, item_name_prefix, item_description_prefix,
                   image, default_custom_fields, locked_custom_field_keys, is_unique,
                   created_at, updated_at
            FROM supply_types WHERE id = %s
        """, (type_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify(_row_to_dict(row)), 200
    except mysql.connector.IntegrityError as e:
        if 'Duplicate' in str(e) or 'unique' in str(e).lower():
            return jsonify({'error': 'A type with this name already exists'}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supply_types_bp.route('/<int:type_id>', methods=['DELETE'])
@require_leader
def delete_supply_type(type_id, current_user_id=None):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM supply_types WHERE id = %s", (type_id,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            return jsonify({'error': 'Type not found'}), 404
        conn.commit()
        cur.close()
        conn.close()
        return '', 204
    except mysql.connector.IntegrityError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
