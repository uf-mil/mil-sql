"""
Supply API routes (catalog/reference table).
"""
import sys
import json
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify, session
import mysql.connector
from src.api.db import get_db
from src.api.models.supply import Supply
from src.api.middleware.auth import require_auth
from src.api.helpers.datetime_json import db_datetime_to_utc_iso
from src.api.helpers.history import (
    log_supply_history,
    log_team_changes,
    log_category_changes,
    get_supply_current_state,
    snapshot_supply_locations_before_delete,
    is_latest_global_history_timestamp,
)

supplies_bp = Blueprint('supplies', __name__)


def _effective_supply_image(supply_image, type_image):
    """If the linked type has a template image, that is the only image (supply row stores NULL)."""
    if type_image:
        return type_image
    return supply_image if supply_image else None


def _type_has_template_image(type_row):
    return bool(type_row and type_row.get('image'))


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
                s.custom_fields,
                s.supply_type_id,
                st.name AS type_name,
                st.image AS type_image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) as totalQty
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            GROUP BY s.id, s.name, s.description, s.image, s.custom_fields, s.supply_type_id,
                     st.name, st.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
            ORDER BY s.name
        """)
        
        supplies = []
        for row in cur.fetchall():
            # Get locations for this supply
            cur.execute("""
                SELECT id, location_name, coord_x, coord_y, shelf, amount
                FROM supplies_location
                WHERE supply_id = %s
                ORDER BY COALESCE(location_name, ''), shelf
            """, (row['id'],))
            
            locations = []
            for loc_row in cur.fetchall():
                if loc_row['location_name'] is None and loc_row['coord_x'] is not None:
                    locations.append({
                        'location': 'Free Coordinate',
                        'shelf': loc_row['shelf'],
                        'qty': loc_row['amount'],
                        'coord_x': int(loc_row['coord_x']),
                        'coord_y': int(loc_row['coord_y']),
                        'supply_location_id': loc_row['id'],
                    })
                else:
                    locations.append({
                        'location': loc_row['location_name'],
                        'shelf': loc_row['shelf'],
                        'qty': loc_row['amount'],
                        'supply_location_id': loc_row['id'],
                    })
            
            # Get teams for this supply
            cur.execute("""
                SELECT team_name
                FROM supplies_teams
                WHERE supply_id = %s
                ORDER BY team_name
            """, (row['id'],))
            teams = [team_row['team_name'].lower() for team_row in cur.fetchall()]
            
            # Get categories for this supply
            cur.execute("""
                SELECT category_id
                FROM supplies_categories
                WHERE supply_id = %s
                ORDER BY category_id
            """, (row['id'],))
            category_ids = [cat_row['category_id'] for cat_row in cur.fetchall()]
            
            cf = row.get('custom_fields')
            if isinstance(cf, str) and cf:
                try:
                    cf = json.loads(cf)
                except (TypeError, ValueError):
                    cf = {}
            elif cf is None:
                cf = {}
            supply_dict = {
                'id': row['id'],
                'name': row['name'],
                'description': row['description'],
                'image': _effective_supply_image(row.get('image'), row.get('type_image')),
                'type_has_template_image': bool(row.get('type_image')),
                'custom_fields': cf,
                'supply_type_id': row.get('supply_type_id'),
                'type_name': row.get('type_name'),
                'lastModified': db_datetime_to_utc_iso(row['last_modified']),
                'last_modified_by': row['last_modified_by'],
                'totalQty': int(row['totalQty']),
                'locations': locations,
                'teams': teams,
                'categories': category_ids
            }
            if row['last_order_date']:
                supply_dict['last_order_date'] = db_datetime_to_utc_iso(row['last_order_date'])
            
            # Get member name for last_modified_by if available
            if row['last_modified_by']:
                cur.execute("""
                    SELECT first_name, last_name, uf_email
                    FROM members
                    WHERE uf_id = %s
                """, (row['last_modified_by'],))
                member = cur.fetchone()
                if member:
                    supply_dict['last_modified_by_name'] = f"{member['first_name']} {member['last_name']}"
                    supply_dict['last_modified_by_email'] = member['uf_email']
            
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
                s.custom_fields,
                s.supply_type_id,
                st.name AS type_name,
                st.image AS type_image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) as totalQty
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            WHERE s.id = %s
            GROUP BY s.id, s.name, s.description, s.image, s.custom_fields, s.supply_type_id,
                     st.name, st.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
        """, (supply_id,))
        
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply not found'}), 404
        
        cf = row.get('custom_fields')
        if isinstance(cf, str) and cf:
            try:
                cf = json.loads(cf)
            except (TypeError, ValueError):
                cf = {}
        elif cf is None:
            cf = {}
        
        cur.execute("""
            SELECT id, location_name, coord_x, coord_y, shelf, amount
            FROM supplies_location
            WHERE supply_id = %s
            ORDER BY COALESCE(location_name, ''), shelf
        """, (supply_id,))
        
        locations = []
        for loc_row in cur.fetchall():
            if loc_row['location_name'] is None and loc_row['coord_x'] is not None:
                locations.append({
                    'location': 'Free Coordinate',
                    'shelf': loc_row['shelf'],
                    'qty': loc_row['amount'],
                    'coord_x': int(loc_row['coord_x']),
                    'coord_y': int(loc_row['coord_y']),
                    'supply_location_id': loc_row['id'],
                })
            else:
                locations.append({
                    'location': loc_row['location_name'],
                    'shelf': loc_row['shelf'],
                    'qty': loc_row['amount'],
                    'supply_location_id': loc_row['id'],
                })
        
        # Get teams for this supply
        cur.execute("""
            SELECT team_name
            FROM supplies_teams
            WHERE supply_id = %s
            ORDER BY team_name
        """, (supply_id,))
        teams = [team_row['team_name'].lower() for team_row in cur.fetchall()]
        
        # Get categories for this supply
        cur.execute("""
            SELECT category_id
            FROM supplies_categories
            WHERE supply_id = %s
            ORDER BY category_id
        """, (supply_id,))
        category_ids = [cat_row['category_id'] for cat_row in cur.fetchall()]
        
        supply_dict = {
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'image': _effective_supply_image(row.get('image'), row.get('type_image')),
            'type_has_template_image': bool(row.get('type_image')),
            'custom_fields': cf,
            'supply_type_id': row.get('supply_type_id'),
            'type_name': row.get('type_name'),
            'lastModified': db_datetime_to_utc_iso(row['last_modified']),
            'last_modified_by': row['last_modified_by'],
            'totalQty': int(row['totalQty']),
            'locations': locations,
            'teams': teams,
            'categories': category_ids
        }
        if row['last_order_date']:
            supply_dict['last_order_date'] = db_datetime_to_utc_iso(row['last_order_date'])
        
        # Get member name for last_modified_by if available
        if row['last_modified_by']:
            cur.execute("""
                SELECT first_name, last_name, uf_email
                FROM members
                WHERE uf_id = %s
            """, (row['last_modified_by'],))
            member = cur.fetchone()
            if member:
                supply_dict['last_modified_by_name'] = f"{member['first_name']} {member['last_name']}"
                supply_dict['last_modified_by_email'] = member['uf_email']
        
        cur.close()
        conn.close()
        return jsonify(supply_dict), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _get_allowed_custom_field_names(cur):
    """Return set of custom field definition names for validation."""
    try:
        cur.execute("SELECT name FROM custom_field_definitions")
        return {r['name'] for r in cur.fetchall()}
    except Exception:
        return set()


def _validate_custom_fields(custom_fields, allowed_names):
    """Validate custom_fields keys and optionally value types. Returns (ok, error_message)."""
    if not custom_fields:
        return True, None
    if not isinstance(custom_fields, dict):
        return False, 'custom_fields must be an object'
    for key in custom_fields:
        if key not in allowed_names:
            return False, f'Unknown custom field: {key}'
    return True, None


def _json_load_maybe(val, default=None):
    if default is None:
        default = {}
    if val is None:
        return default
    if isinstance(val, dict):
        return val
    if isinstance(val, str) and val.strip():
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, dict) else default
        except (TypeError, ValueError):
            return default
    return default


def _fetch_supply_type_row(cur, type_id):
    cur.execute("""
        SELECT id, name, item_name_prefix, item_description_prefix, image,
               default_custom_fields, locked_custom_field_keys, is_unique
        FROM supply_types WHERE id = %s
    """, (int(type_id),))
    return cur.fetchone()


def _merge_custom_fields_from_type(type_row, user_cf):
    defaults = _json_load_maybe(type_row.get('default_custom_fields'), {})
    if not isinstance(defaults, dict):
        defaults = {}
    locked = type_row.get('locked_custom_field_keys')
    if isinstance(locked, str) and locked.strip():
        try:
            locked = json.loads(locked)
        except (TypeError, ValueError):
            locked = []
    elif not isinstance(locked, list):
        locked = []
    merged = dict(defaults)
    if isinstance(user_cf, dict):
        merged.update(user_cf)
    for k in locked:
        if k in defaults:
            merged[k] = defaults[k]
        elif k not in merged:
            merged[k] = ''
    return merged


def _validate_name_desc_prefixes(type_row, name, description):
    np = (type_row.get('item_name_prefix') or '').strip()
    if np:
        nm = (name or '').strip()
        if not nm.startswith(np):
            return False, 'Name must begin with the type prefix.'
    ndp_raw = type_row.get('item_description_prefix')
    ndp = (ndp_raw or '').strip() if ndp_raw else ''
    if ndp:
        desc_str = (description or '').strip() if description is not None else ''
        if desc_str and not desc_str.startswith(ndp):
            return False, 'Description must begin with the type prefix.'
    return True, None


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
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        custom_fields = data.get('custom_fields')
        supply_type_id_raw = data.get('supply_type_id')
        type_row = None
        tid_insert = None
        if supply_type_id_raw is not None and supply_type_id_raw != '':
            try:
                tid_insert = int(supply_type_id_raw)
            except (TypeError, ValueError):
                cur.close()
                conn.close()
                return jsonify({'error': 'Invalid supply_type_id'}), 400
            type_row = _fetch_supply_type_row(cur, tid_insert)
            if not type_row:
                cur.close()
                conn.close()
                return jsonify({'error': 'Supply type not found'}), 400
            custom_fields = _merge_custom_fields_from_type(type_row, custom_fields)

        allowed = _get_allowed_custom_field_names(cur)
        ok, err = _validate_custom_fields(custom_fields, allowed)
        if not ok:
            cur.close()
            conn.close()
            return jsonify({'error': err}), 400

        name_final = data['name'].strip()
        desc_final = data.get('description', '').strip() or None

        if type_row and _type_has_template_image(type_row):
            if data.get('image'):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Items linked to a type that has a template image cannot use a separate item image.',
                }), 400
            image_final = None
        else:
            image_final = data.get('image') or None
            if image_final and str(image_final).startswith('data:image'):
                base64_part = image_final.split(',', 1)[1] if ',' in image_final else ''
                if len(base64_part) > 13_300_000:
                    cur.close()
                    conn.close()
                    return jsonify({'error': 'Image file size exceeds 10MB limit'}), 400

        if type_row:
            okp, errp = _validate_name_desc_prefixes(type_row, name_final, desc_final)
            if not okp:
                cur.close()
                conn.close()
                return jsonify({'error': errp}), 400
        
        # Check if supply with this name already exists
        cur.execute("SELECT id FROM supplies WHERE name = %s", (name_final,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({'error': 'Supply with this name already exists'}), 400
        
        cf_json = json.dumps(custom_fields) if custom_fields else None
        cur.execute("""
            INSERT INTO supplies (name, description, image, custom_fields, last_order_date, last_modified_by, supply_type_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            name_final,
            desc_final,
            image_final,
            cf_json,
            data.get('last_order_date') or None,
            current_user_id,
            tid_insert,
        ))
        
        supply_id = cur.lastrowid
        
        # Insert teams
        if data.get('teams'):
            for team_name in data['teams']:
                # Normalize team name (capitalize to match database: Software, Electrical, Mechanical)
                team_name_capitalized = team_name.capitalize()
                # Handle special case: "Software" not "Software" (already capitalized)
                if team_name_capitalized not in ['Software', 'Electrical', 'Mechanical']:
                    # Try to match case-insensitively
                    if team_name.lower() == 'software':
                        team_name_capitalized = 'Software'
                    elif team_name.lower() == 'electrical':
                        team_name_capitalized = 'Electrical'
                    elif team_name.lower() == 'mechanical':
                        team_name_capitalized = 'Mechanical'
                
                cur.execute(
                    "INSERT IGNORE INTO supplies_teams (supply_id, team_name) VALUES (%s, %s)",
                    (supply_id, team_name_capitalized)
                )
        
        # Insert categories
        if data.get('categories'):
            for category_id in data['categories']:
                # Ensure category_id is an integer
                try:
                    cat_id = int(category_id)
                    cur.execute(
                        "INSERT IGNORE INTO supplies_categories (supply_id, category_id) VALUES (%s, %s)",
                        (supply_id, cat_id)
                    )
                except (ValueError, TypeError):
                    # Skip invalid category IDs
                    continue
        
        # Log history for CREATE action
        old_values = {}
        new_values = {
            'name': name_final,
            'description': desc_final,
            'image': image_final,
            'last_order_date': data.get('last_order_date') or None
        }
        history_id = log_supply_history(
            conn, supply_id, 'CREATE', old_values, new_values, current_user_id
        )
        
        # Log team and category changes
        old_teams = []
        new_teams = [t.capitalize() if t.lower() in ['software', 'electrical', 'mechanical'] else t.capitalize() 
                     for t in (data.get('teams') or [])]
        # Normalize team names properly
        normalized_teams = []
        for team in (data.get('teams') or []):
            if team.lower() == 'software':
                normalized_teams.append('Software')
            elif team.lower() == 'electrical':
                normalized_teams.append('Electrical')
            elif team.lower() == 'mechanical':
                normalized_teams.append('Mechanical')
            else:
                normalized_teams.append(team.capitalize())
        
        log_team_changes(conn, history_id, old_teams, normalized_teams)
        log_category_changes(conn, history_id, [], data.get('categories') or [])
        
        conn.commit()
        
        # Fetch the created supply with teams and categories
        cur.execute("""
            SELECT s.id, s.name, s.description, s.image, s.custom_fields, s.last_order_date,
                   s.last_modified, s.last_modified_by, s.created_at,
                   s.supply_type_id, st.name AS type_name, st.image AS type_image
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            WHERE s.id = %s
        """, (supply_id,))
        
        row = cur.fetchone()
        cf = row.get('custom_fields')
        if isinstance(cf, str) and cf:
            try:
                cf = json.loads(cf)
            except (TypeError, ValueError):
                cf = {}
        else:
            cf = cf or {}
        
        # Get teams
        cur.execute("""
            SELECT team_name FROM supplies_teams WHERE supply_id = %s ORDER BY team_name
        """, (supply_id,))
        teams = [t['team_name'].lower() for t in cur.fetchall()]
        
        # Get categories
        cur.execute("""
            SELECT category_id FROM supplies_categories WHERE supply_id = %s ORDER BY category_id
        """, (supply_id,))
        category_ids = [c['category_id'] for c in cur.fetchall()]
        
        # Convert row dict to Supply object
        supply = Supply.from_dict(row).to_dict()
        supply['image'] = _effective_supply_image(row.get('image'), row.get('type_image'))
        supply['type_has_template_image'] = bool(row.get('type_image'))
        supply['custom_fields'] = cf
        supply['supply_type_id'] = row.get('supply_type_id')
        supply['type_name'] = row.get('type_name')
        supply['totalQty'] = 0
        supply['locations'] = []
        supply['teams'] = teams
        supply['categories'] = category_ids
        
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
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Check if supply exists (with conflict detection)
        cur.execute("SELECT id, name, supply_type_id FROM supplies WHERE id = %s", (supply_id,))
        supply_check = cur.fetchone()
        if not supply_check:
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Supply not found',
                'error_type': 'SUPPLY_DELETED',
                'supply_id': supply_id,
                'message': 'This item was deleted by another user. Please refresh the page to see the latest data.'
            }), 404
        
        # Get current state before update for history
        current_state = get_supply_current_state(conn, supply_id)
        old_values = {
            'name': current_state['name'],
            'description': current_state['description'],
            'image': current_state['image'],
            'last_order_date': current_state['last_order_date']
        }
        old_teams = current_state['teams']
        old_categories = current_state['categories']
        
        unlink_from_type = bool(data.get('unlink_from_type'))
        old_type_id = supply_check.get('supply_type_id')
        effective_type_id = None if unlink_from_type else old_type_id
        type_row_update = None
        if effective_type_id:
            type_row_update = _fetch_supply_type_row(cur, effective_type_id)
            if not type_row_update:
                effective_type_id = None

        has_type_template_image = _type_has_template_image(type_row_update)

        if 'image' in data and data['image'] and has_type_template_image:
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Items linked to a type that has a template image cannot use a separate item image.',
            }), 400

        if 'image' in data and data['image'] and not has_type_template_image:
            img = data['image']
            if str(img).startswith('data:image'):
                base64_part = img.split(',', 1)[1] if ',' in img else ''
                if len(base64_part) > 13_300_000:
                    cur.close()
                    conn.close()
                    return jsonify({'error': 'Image file size exceeds 10MB limit'}), 400
        
        merged_cf_for_update = None
        if 'custom_fields' in data:
            allowed = _get_allowed_custom_field_names(cur)
            cf_work = data.get('custom_fields')
            if effective_type_id and type_row_update:
                cf_work = _merge_custom_fields_from_type(type_row_update, cf_work)
            ok, err = _validate_custom_fields(cf_work, allowed)
            if not ok:
                cur.close()
                conn.close()
                return jsonify({'error': err}), 400
            merged_cf_for_update = cf_work
        
        if type_row_update and ('name' in data or 'description' in data):
            prop_name = (
                data['name'].strip()
                if ('name' in data and data.get('name') is not None and str(data.get('name', '')).strip())
                else current_state['name']
            )
            prop_desc = (
                (data['description'].strip() or None)
                if 'description' in data
                else current_state['description']
            )
            okp, errp = _validate_name_desc_prefixes(type_row_update, prop_name, prop_desc)
            if not okp:
                cur.close()
                conn.close()
                return jsonify({'error': errp}), 400
        
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
        if has_type_template_image:
            updates.append("image = %s")
            values.append(None)
        elif 'image' in data:
            updates.append("image = %s")
            values.append(data['image'] or None)
        if 'last_order_date' in data:
            updates.append("last_order_date = %s")
            values.append(data['last_order_date'] or None)
        if 'custom_fields' in data:
            updates.append("custom_fields = %s")
            values.append(json.dumps(merged_cf_for_update) if merged_cf_for_update else None)
        
        if unlink_from_type:
            updates.append("supply_type_id = %s")
            values.append(None)
        
        # Always update last_modified_by
        updates.append("last_modified_by = %s")
        values.append(current_user_id)
        
        values.append(supply_id)
        
        if updates:
            query = f"UPDATE supplies SET {', '.join(updates)} WHERE id = %s"
            cur.execute(query, values)
        
        # Update teams if provided
        if 'teams' in data:
            # Delete existing teams
            cur.execute("DELETE FROM supplies_teams WHERE supply_id = %s", (supply_id,))
            # Insert new teams
            if data.get('teams'):
                for team_name in data['teams']:
                    # Normalize team name (capitalize to match database)
                    team_name_capitalized = team_name.capitalize()
                    # Handle special cases
                    if team_name.lower() == 'software':
                        team_name_capitalized = 'Software'
                    elif team_name.lower() == 'electrical':
                        team_name_capitalized = 'Electrical'
                    elif team_name.lower() == 'mechanical':
                        team_name_capitalized = 'Mechanical'
                    
                    cur.execute(
                        "INSERT INTO supplies_teams (supply_id, team_name) VALUES (%s, %s)",
                        (supply_id, team_name_capitalized)
                    )
        
        # Update categories if provided
        if 'categories' in data:
            # Delete existing categories
            cur.execute("DELETE FROM supplies_categories WHERE supply_id = %s", (supply_id,))
            # Insert new categories
            if data.get('categories'):
                for category_id in data['categories']:
                    try:
                        cat_id = int(category_id)
                        cur.execute(
                            "INSERT INTO supplies_categories (supply_id, category_id) VALUES (%s, %s)",
                            (supply_id, cat_id)
                        )
                    except (ValueError, TypeError):
                        continue
        
        # Log history for UPDATE action
        if has_type_template_image:
            image_for_history = None
        elif 'image' in data:
            image_for_history = data['image'] or None
        else:
            image_for_history = old_values['image']

        new_values = {
            'name': data.get('name', old_values['name']).strip() if 'name' in data else old_values['name'],
            'description': (data.get('description', '').strip() or None) if 'description' in data else old_values['description'],
            'image': image_for_history,
            'last_order_date': data.get('last_order_date') if 'last_order_date' in data else old_values['last_order_date']
        }
        history_id = log_supply_history(
            conn, supply_id, 'UPDATE', old_values, new_values, current_user_id
        )
        
        # Log team and category changes
        new_teams = []
        if 'teams' in data:
            for team in (data.get('teams') or []):
                if team.lower() == 'software':
                    new_teams.append('Software')
                elif team.lower() == 'electrical':
                    new_teams.append('Electrical')
                elif team.lower() == 'mechanical':
                    new_teams.append('Mechanical')
                else:
                    new_teams.append(team.capitalize())
        else:
            new_teams = old_teams
        
        new_categories = data.get('categories', old_categories) if 'categories' in data else old_categories
        
        log_team_changes(conn, history_id, old_teams, new_teams)
        log_category_changes(conn, history_id, old_categories, new_categories)
        
        conn.commit()
        
        # Fetch updated supply
        cur.execute("""
            SELECT s.id, s.name, s.description, s.image, s.custom_fields, s.last_order_date,
                   s.last_modified, s.last_modified_by, s.created_at,
                   s.supply_type_id, st.name AS type_name, st.image AS type_image
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            WHERE s.id = %s
        """, (supply_id,))
        
        row = cur.fetchone()
        cf = row.get('custom_fields')
        if isinstance(cf, str) and cf:
            try:
                cf = json.loads(cf)
            except (TypeError, ValueError):
                cf = {}
        else:
            cf = cf or {}
        supply = Supply.from_dict(row).to_dict()
        supply['image'] = _effective_supply_image(row.get('image'), row.get('type_image'))
        supply['type_has_template_image'] = bool(row.get('type_image'))
        supply['custom_fields'] = cf
        supply['supply_type_id'] = row.get('supply_type_id')
        supply['type_name'] = row.get('type_name')
        
        # Get computed quantities
        cur.execute("""
            SELECT COALESCE(SUM(amount), 0) as totalQty
            FROM supplies_location
            WHERE supply_id = %s
        """, (supply_id,))
        total_qty_row = cur.fetchone()
        total_qty = total_qty_row['totalQty'] if total_qty_row else 0
        
        cur.execute("""
            SELECT id, location_name, coord_x, coord_y, shelf, amount
            FROM supplies_location
            WHERE supply_id = %s
            ORDER BY COALESCE(location_name, ''), shelf
        """, (supply_id,))
        
        locations = []
        for loc_row in cur.fetchall():
            if loc_row['location_name'] is None and loc_row['coord_x'] is not None:
                locations.append({
                    'location': 'Free Coordinate',
                    'shelf': loc_row['shelf'],
                    'qty': loc_row['amount'],
                    'coord_x': int(loc_row['coord_x']),
                    'coord_y': int(loc_row['coord_y']),
                    'supply_location_id': loc_row['id'],
                })
            else:
                locations.append({
                    'location': loc_row['location_name'],
                    'shelf': loc_row['shelf'],
                    'qty': loc_row['amount'],
                    'supply_location_id': loc_row['id'],
                })
        
        # Get teams
        cur.execute("""
            SELECT team_name FROM supplies_teams WHERE supply_id = %s ORDER BY team_name
        """, (supply_id,))
        teams = [t['team_name'].lower() for t in cur.fetchall()]
        
        # Get categories
        cur.execute("""
            SELECT category_id FROM supplies_categories WHERE supply_id = %s ORDER BY category_id
        """, (supply_id,))
        category_ids = [c['category_id'] for c in cur.fetchall()]
        
        supply['totalQty'] = int(total_qty)
        supply['locations'] = locations
        supply['teams'] = teams
        supply['categories'] = category_ids
        
        # Get member name for last_modified_by if available
        if row['last_modified_by']:
            cur.execute("""
                SELECT first_name, last_name, uf_email
                FROM members
                WHERE uf_id = %s
            """, (row['last_modified_by'],))
            member = cur.fetchone()
            if member:
                supply['last_modified_by_name'] = f"{member['first_name']} {member['last_name']}"
                supply['last_modified_by_email'] = member['uf_email']
        
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
        cur = conn.cursor(dictionary=True)
        
        # Check if supply exists (with conflict detection)
        cur.execute("SELECT id, name FROM supplies WHERE id = %s", (supply_id,))
        supply_check = cur.fetchone()
        if not supply_check:
            cur.close()
            conn.close()
            return jsonify({
                'error': 'Supply not found',
                'error_type': 'SUPPLY_DELETED',
                'supply_id': supply_id,
                'message': 'This item was already deleted by another user. Please refresh the page to see the latest data.'
            }), 404
        
        # Get current state before delete for history
        current_state = get_supply_current_state(conn, supply_id)
        old_values = {
            'name': current_state['name'],
            'description': current_state['description'],
            'image': current_state['image'],
            'last_order_date': current_state['last_order_date']
        }
        old_teams = current_state['teams']
        old_categories = current_state['categories']
        
        # Log history for DELETE action (before actual delete)
        history_id = log_supply_history(
            conn, supply_id, 'DELETE', old_values, {}, current_user_id
        )
        
        # Log all teams and categories as REMOVED
        log_team_changes(conn, history_id, old_teams, [])
        log_category_changes(conn, history_id, old_categories, [])
        
        # Snapshot all location data BEFORE delete (CASCADE will remove supplies_location rows)
        snapshot_supply_locations_before_delete(
            conn, supply_id, supply_check['name'], current_user_id
        )
        
        # Now delete the supply (CASCADE will handle related tables)
        cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        return '', 204
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/history', methods=['GET'])
@require_auth
def get_supply_history(current_user_id=None):
    """
    GET /api/supplies/history
    Get history of all supply changes.
    
    Query Parameters:
        supply_id (optional): Filter by specific supply
        action_type (optional): Filter by action type (CREATE, UPDATE, DELETE)
        limit (optional): Limit results (default: 100)
        offset (optional): Pagination offset
    
    Returns:
        JSON object with history array and total count
        
    NOTE: Undone entries are DELETED entirely from the database (not just marked as undone).
          See undo_supply_history endpoint which handles supply history undo.
    """
    try:
        supply_id_filter = request.args.get('supply_id', type=int)
        action_type_filter = request.args.get('action_type')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Build query
        query = """
            SELECT 
                h.id,
                h.supply_id,
                h.action_type,
                h.old_name,
                h.new_name,
                h.old_description,
                h.new_description,
                h.old_image,
                h.new_image,
                h.old_last_order_date,
                h.new_last_order_date,
                h.changed_by,
                h.changed_at,
                COALESCE(s.name, h.old_name, h.new_name) as supply_name
            FROM supplies_history h
            LEFT JOIN supplies s ON h.supply_id = s.id
            WHERE 1=1
        """
        params = []
        
        if supply_id_filter:
            query += " AND h.supply_id = %s"
            params.append(supply_id_filter)
        
        if action_type_filter:
            query += " AND h.action_type = %s"
            params.append(action_type_filter)
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM ({query}) as filtered"
        cur.execute(count_query, params)
        total = cur.fetchone()['total']
        
        # Get paginated results
        query += " ORDER BY h.changed_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        cur.execute(query, params)
        
        history_entries = []
        for row in cur.fetchall():
            # Get user info
            cur.execute("""
                SELECT first_name, last_name, uf_email
                FROM members WHERE uf_id = %s
            """, (row['changed_by'],))
            user = cur.fetchone()
            
            # Get team changes
            cur.execute("""
                SELECT team_name, action
                FROM supplies_history_teams
                WHERE history_id = %s
            """, (row['id'],))
            team_changes = [{'team_name': t['team_name'], 'action': t['action']} 
                           for t in cur.fetchall()]
            
            # Get category changes
            cur.execute("""
                SELECT category_id, action
                FROM supplies_history_categories
                WHERE history_id = %s
            """, (row['id'],))
            category_changes = [{'category_id': c['category_id'], 'action': c['action']} 
                               for c in cur.fetchall()]
            
            # Check if can be undone
            can_undo = False
            undo_removes_log_only = False
            if row['action_type'] == 'DELETE':
                # DELETE can always be undone (recreate)
                can_undo = True
            elif row['action_type'] == 'CREATE':
                # CREATE: delete supply if it exists, else drop history row only
                can_undo = True
                undo_removes_log_only = row['supply_id'] is None
            elif row['action_type'] == 'UPDATE':
                # UPDATE: restore supply if linked; else drop history row only
                can_undo = True
                undo_removes_log_only = row['supply_id'] is None
            
            history_entry = {
                'id': row['id'],
                'supply_id': row['supply_id'],
                'supply_name': row['supply_name'],
                'action_type': row['action_type'],
                'old_name': row['old_name'],
                'new_name': row['new_name'],
                'old_description': row['old_description'],
                'new_description': row['new_description'],
                'old_image': row['old_image'],
                'new_image': row['new_image'],
                'old_last_order_date': db_datetime_to_utc_iso(row['old_last_order_date']),
                'new_last_order_date': db_datetime_to_utc_iso(row['new_last_order_date']),
                'changed_by': row['changed_by'],
                'changed_by_name': f"{user['first_name']} {user['last_name']}" if user else None,
                'changed_by_email': user['uf_email'] if user else None,
                'changed_at': db_datetime_to_utc_iso(row['changed_at']),
                'can_undo': can_undo,
                'undo_removes_log_only': undo_removes_log_only,
                'team_changes': team_changes,
                'category_changes': category_changes
            }
            history_entries.append(history_entry)
        
        cur.close()
        conn.close()
        
        return jsonify({
            'history': history_entries,
            'total': total
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/history/<int:history_id>/undo', methods=['POST'])
@require_auth
def undo_supply_history(history_id, current_user_id=None):
    """
    POST /api/supplies/history/<id>/undo
    Undo a specific history entry.
    
    Args:
        history_id: History entry ID to undo
    
    Returns:
        JSON object with success message and updated history entry
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Get history entry
        cur.execute("""
            SELECT * FROM supplies_history WHERE id = %s
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
        
        # For DELETE actions, supply_id might be NULL due to ON DELETE SET NULL
        # We need to find the original supply_id by looking at the old_name and matching
        # with any existing supplies, or we can try to extract it from the history entry
        # before it was set to NULL. Actually, we can't - but we can use the old_name
        # to find if a supply with that name exists, or we need to store the ID elsewhere.
        # For now, let's try to get it from the history entry's old data or find by name.
        original_supply_id = history['supply_id']
        
        # If supply_id is NULL (for DELETE), try to find the supply by name
        if not original_supply_id and history['action_type'] == 'DELETE':
            if history['old_name']:
                cur.execute("SELECT id FROM supplies WHERE name = %s", (history['old_name'],))
                existing = cur.fetchone()
                if existing:
                    original_supply_id = existing['id']
                else:
                    # Supply doesn't exist, we'll need to create it with a new ID
                    # But we don't know the original ID, so we can't restore it exactly
                    # For now, we'll create it without specifying the ID (auto-increment)
                    original_supply_id = None
        
        # Get team and category changes
        cur.execute("""
            SELECT team_name, action FROM supplies_history_teams WHERE history_id = %s
        """, (history_id,))
        team_changes = cur.fetchall()
        
        cur.execute("""
            SELECT category_id, action FROM supplies_history_categories WHERE history_id = %s
        """, (history_id,))
        category_changes = cur.fetchall()
        
        # Perform undo based on action type
        if history['action_type'] == 'CREATE':
            # Undo CREATE: Delete the supply
            if history['supply_id']:
                cur.execute("DELETE FROM supplies WHERE id = %s", (history['supply_id'],))
        
        elif history['action_type'] == 'UPDATE':
            # Undo UPDATE: restore catalog row, or only remove this log row if supply_id is NULL
            if history['supply_id']:
                cur.execute("SELECT id FROM supplies WHERE id = %s", (history['supply_id'],))
                if not cur.fetchone():
                    cur.close()
                    conn.close()
                    return jsonify({
                        'error': 'Cannot undo: supply no longer exists',
                        'error_type': 'UNDO_IMPOSSIBLE',
                    }), 400
                
                # Restore old values
                updates = []
                values = []
                
                if history['old_name']:
                    updates.append("name = %s")
                    values.append(history['old_name'])
                if history['old_description'] is not None:
                    updates.append("description = %s")
                    values.append(history['old_description'])
                if history['old_image'] is not None:
                    updates.append("image = %s")
                    values.append(history['old_image'])
                if history['old_last_order_date'] is not None:
                    updates.append("last_order_date = %s")
                    values.append(history['old_last_order_date'])
                
                updates.append("last_modified_by = %s")
                values.append(current_user_id)
                values.append(history['supply_id'])
                
                if updates:
                    query = f"UPDATE supplies SET {', '.join(updates)} WHERE id = %s"
                    cur.execute(query, values)
                
                # Restore teams: Remove current, add back old teams
                cur.execute("DELETE FROM supplies_teams WHERE supply_id = %s", (history['supply_id'],))
                for team_change in team_changes:
                    if team_change['action'] == 'REMOVED':
                        cur.execute("""
                            INSERT IGNORE INTO supplies_teams (supply_id, team_name)
                            VALUES (%s, %s)
                        """, (history['supply_id'], team_change['team_name']))
                
                # Restore categories: Remove current, add back old categories
                cur.execute("DELETE FROM supplies_categories WHERE supply_id = %s", (history['supply_id'],))
                for cat_change in category_changes:
                    if cat_change['action'] == 'REMOVED':
                        cur.execute("""
                            INSERT IGNORE INTO supplies_categories (supply_id, category_id)
                            VALUES (%s, %s)
                        """, (history['supply_id'], cat_change['category_id']))
        
        elif history['action_type'] == 'DELETE':
            # Undo DELETE: Recreate the supply
            # If original_supply_id is None, we'll create with auto-increment
            if original_supply_id:
                # Recreate supply with original ID
                cur.execute("""
                    INSERT INTO supplies (id, name, description, image, last_order_date, last_modified_by)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    original_supply_id,
                    history['old_name'],
                    history['old_description'],
                    history['old_image'],
                    history['old_last_order_date'],
                    current_user_id
                ))
                restored_supply_id = original_supply_id
            else:
                # Recreate supply without ID (auto-increment)
                cur.execute("""
                    INSERT INTO supplies (name, description, image, last_order_date, last_modified_by)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    history['old_name'],
                    history['old_description'],
                    history['old_image'],
                    history['old_last_order_date'],
                    current_user_id
                ))
                restored_supply_id = cur.lastrowid
            
            # Recreate teams (all that were REMOVED in delete)
            for team_change in team_changes:
                if team_change['action'] == 'REMOVED':
                    cur.execute("""
                        INSERT IGNORE INTO supplies_teams (supply_id, team_name)
                        VALUES (%s, %s)
                    """, (restored_supply_id, team_change['team_name']))
            
            # Recreate categories (all that were REMOVED in delete)
            for cat_change in category_changes:
                if cat_change['action'] == 'REMOVED':
                    cur.execute("""
                        INSERT IGNORE INTO supplies_categories (supply_id, category_id)
                        VALUES (%s, %s)
                    """, (restored_supply_id, cat_change['category_id']))
            
            # Restore locations from CASCADED_SUBTRACT entries
            # Find the most recent snapshot batch for this supply_name
            # The snapshot was created right before the DELETE, so match by supply_name and timestamp
            # NOTE: No need to check undone=FALSE since undone entries are deleted entirely
            cur.execute("""
                SELECT batch_id, MAX(changed_at) as max_changed_at
                FROM supplies_location_history
                WHERE supply_name = %s
                  AND action_type = 'CASCADED_SUBTRACT'
                  AND changed_at >= DATE_SUB(%s, INTERVAL 10 SECOND)
                  AND changed_at <= DATE_ADD(%s, INTERVAL 10 SECOND)
                GROUP BY batch_id
                ORDER BY max_changed_at DESC
                LIMIT 1
            """, (history['old_name'], history['changed_at'], history['changed_at']))
            
            snapshot_batch = cur.fetchone()
            if snapshot_batch and snapshot_batch['batch_id']:
                batch_id = snapshot_batch['batch_id']
                
                # Get all snapshot entries for this batch
                cur.execute("""
                    SELECT location_name, shelf, old_amount
                    FROM supplies_location_history
                    WHERE batch_id = %s
                      AND action_type = 'CASCADED_SUBTRACT'
                """, (batch_id,))
                
                snapshot_entries = cur.fetchall()
                
                # Re-insert all location rows from the snapshot
                for entry in snapshot_entries:
                    cur.execute("""
                        INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        restored_supply_id,
                        entry['location_name'],
                        entry['shelf'],
                        entry['old_amount'],
                        current_user_id
                    ))
                
                # Delete all snapshot entries (not just mark as undone)
                cur.execute("""
                    DELETE FROM supplies_location_history
                    WHERE batch_id = %s
                      AND action_type = 'CASCADED_SUBTRACT'
                """, (batch_id,))
        
        # Delete the history entry and all related data (CASCADE will handle teams/categories)
        cur.execute("DELETE FROM supplies_history WHERE id = %s", (history_id,))
        
        conn.commit()
        
        # Return the restored supply_id if it was a DELETE undo
        response_data = {
            'success': True,
            'message': f'Successfully undid {history["action_type"]} action'
        }
        if history['action_type'] == 'DELETE' and 'restored_supply_id' in locals():
            response_data['restored_supply_id'] = restored_supply_id
        
        cur.close()
        conn.close()
        
        return jsonify(response_data), 200
    except mysql.connector.IntegrityError as e:
        conn.rollback()
        return jsonify({'error': str(e), 'error_type': 'UNDO_IMPOSSIBLE'}), 400
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500


@supplies_bp.route('/history/<int:history_id>/discard', methods=['POST'])
@require_auth
def discard_supply_history(history_id, current_user_id=None):
    """
    POST /api/supplies/history/<id>/discard
    Delete a supply history row (and CASCADE team/category rows) without changing supplies data.
    Same permission rules as undo for non-leaders.
    """
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)

        cur.execute("""
            SELECT id, changed_at FROM supplies_history WHERE id = %s
        """, (history_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({'error': 'History entry not found'}), 404

        if not session.get('is_leader', False):
            if not is_latest_global_history_timestamp(cur, row['changed_at']):
                cur.close()
                conn.close()
                return jsonify({
                    'error': 'Only the most recent action can be undone.',
                    'error_type': 'UNDO_NOT_LATEST',
                }), 403

        cur = conn.cursor()
        cur.execute("DELETE FROM supplies_history WHERE id = %s", (history_id,))
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'success': True, 'discarded_id': history_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
