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


def _join_prefix_suffix(prefix, suffix):
    """Match milventory joinPrefixSuffix: rstrip(prefix) + optional space + trim(suffix)."""
    p = (prefix or '').rstrip()
    s = (suffix or '').strip()
    if not p:
        return s
    if not s:
        return p
    sep = '' if p.endswith(' ') else ' '
    return f"{p}{sep}{s}"


def _suffix_after_prefix(full, prefix):
    op = (prefix or '').strip()
    if not op:
        return None
    fn = (full or '').strip()
    if fn.startswith(op):
        return fn[len(op):].lstrip()
    return None


def _recompute_linked_supply_name(old_name, old_np, new_np):
    """Rebuild supply.name after type item_name_prefix change; None = leave unchanged."""
    old_np = (old_np or '').strip()
    new_np = (new_np or '').strip()
    old_name = (old_name or '').strip()
    if not old_np:
        if not new_np:
            return None
        return _join_prefix_suffix(new_np, old_name)
    su = _suffix_after_prefix(old_name, old_np)
    if su is None:
        return None
    return _join_prefix_suffix(new_np, su)


def _recompute_linked_supply_description(old_desc, old_dp, new_dp):
    """Rebuild supply.description after type item_description_prefix change; None = leave unchanged."""
    old_dp = (old_dp or '').strip() if old_dp else ''
    new_dp = (new_dp or '').strip() if new_dp else ''
    old_d = (old_desc or '').strip() if old_desc else ''
    if not old_dp:
        if not new_dp:
            return None
        return _join_prefix_suffix(new_dp, old_d) if old_d else new_dp
    if not old_d:
        return new_dp if new_dp else None
    su = _suffix_after_prefix(old_d, old_dp)
    if su is None:
        return None
    out = _join_prefix_suffix(new_dp, su)
    return out if out else (su or None)


def _desc_norm(d):
    if d is None:
        return ''
    return str(d).strip()


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
        cur.execute("""
            SELECT id, item_name_prefix, item_description_prefix
            FROM supply_types WHERE id = %s
        """, (type_id,))
        before = cur.fetchone()
        if not before:
            cur.close()
            conn.close()
            return jsonify({'error': 'Type not found'}), 404

        old_np = (before.get('item_name_prefix') or '').strip()
        odp = before.get('item_description_prefix')
        old_dp = (odp or '').strip() if odp else ''
        new_np = old_np
        new_dp = old_dp
        if 'item_name_prefix' in data:
            new_np = (data.get('item_name_prefix') or '').strip()
        if 'item_description_prefix' in data:
            r = data.get('item_description_prefix')
            if r is None:
                new_dp = ''
            else:
                new_dp = (str(r) or '').strip()

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

        cascade_name = 'item_name_prefix' in data
        cascade_desc = 'item_description_prefix' in data
        if cascade_name or cascade_desc:
            cur.execute(
                "SELECT id, name, description FROM supplies WHERE supply_type_id = %s",
                (type_id,),
            )
            sup_rows = cur.fetchall()
            updates = []
            for s in sup_rows:
                nm = s['name']
                dc = s['description']
                if cascade_name:
                    nn = _recompute_linked_supply_name(s['name'], old_np, new_np)
                    if nn is not None:
                        nm = nn
                if cascade_desc:
                    nd = _recompute_linked_supply_description(s['description'], old_dp, new_dp)
                    if nd is not None:
                        dc = nd
                if nm != s['name'] or _desc_norm(dc) != _desc_norm(s['description']):
                    updates.append((s['id'], nm, dc))
            proposed = [u[1] for u in updates]
            if len(proposed) != len(set(proposed)):
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Updating prefixes would create duplicate item names for this type.',
                }), 400
            for sid, nm, dc in updates:
                cur.execute("SELECT id FROM supplies WHERE name = %s AND id != %s", (nm, sid))
                if cur.fetchone():
                    conn.rollback()
                    cur.close()
                    conn.close()
                    return jsonify({
                        'error': f'Item name "{nm}" is already used by another supply.',
                    }), 400
            for sid, nm, dc in updates:
                cur.execute(
                    "UPDATE supplies SET name = %s, description = %s WHERE id = %s",
                    (nm, dc, sid),
                )

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
