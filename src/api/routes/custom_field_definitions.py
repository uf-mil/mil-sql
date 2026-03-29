"""
Custom field definitions API. Public GET for dropdown; admin CRUD for create/update/delete.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import mysql.connector
from flask import Blueprint, jsonify, request

from src.api.db import get_db
from src.api.middleware.auth import require_auth, require_leader
from src.api.models.custom_field_definition import CustomFieldDefinition
from src.api.repositories import custom_field_definitions_repository as repo

custom_field_definitions_bp = Blueprint("custom_field_definitions", __name__)

VALID_TYPES = ("text", "number", "date")


@custom_field_definitions_bp.route("", methods=["GET"])
@require_auth
def get_custom_field_definitions(current_user_id=None):
    """GET /api/custom-field-definitions"""
    try:
        conn = get_db()
        cur = conn.cursor()
        rows = repo.list_id_name_type_ordered(cur)
        definitions = [CustomFieldDefinition.from_db_row(row).to_dict() for row in rows]
        cur.close()
        conn.close()
        return jsonify(definitions), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@custom_field_definitions_bp.route("", methods=["POST"])
@require_leader
def create_custom_field_definition(current_user_id=None):
    """POST /api/custom-field-definitions"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        name = (data.get("name") or "").strip()
        type_val = (data.get("type") or "text").strip().lower()
        if not name:
            return jsonify({"error": "Name is required"}), 400
        if type_val not in VALID_TYPES:
            return jsonify({"error": f'Type must be one of: {", ".join(VALID_TYPES)}'}), 400

        conn = get_db()
        cur = conn.cursor()
        repo.insert_name_type(cur, name, type_val)
        conn.commit()
        definition_id = cur.lastrowid
        row = repo.fetch_by_id_tuple(cur, definition_id)
        cur.close()
        conn.close()
        return jsonify(CustomFieldDefinition.from_db_row(row).to_dict()), 201
    except mysql.connector.IntegrityError as e:
        if "Duplicate entry" in str(e) or "unique" in str(e).lower():
            return jsonify({"error": "A custom field with this name already exists"}), 400
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@custom_field_definitions_bp.route("/<int:definition_id>", methods=["PUT"])
@require_leader
def update_custom_field_definition(definition_id, current_user_id=None):
    """PUT /api/custom-field-definitions/<id>"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        name = (data.get("name") or "").strip() if "name" in data else None
        type_val = (data.get("type") or "").strip().lower() if "type" in data else None
        if type_val is not None and type_val not in VALID_TYPES:
            return jsonify({"error": f'Type must be one of: {", ".join(VALID_TYPES)}'}), 400

        conn = get_db()
        cur = conn.cursor()
        if not repo.exists_id_tuple(cur, definition_id):
            cur.close()
            conn.close()
            return jsonify({"error": "Custom field definition not found"}), 404

        updates = []
        values = []
        if "name" in data and name:
            updates.append("name = %s")
            values.append(name)
        if "type" in data and type_val:
            updates.append("type = %s")
            values.append(type_val)
        if updates:
            values.append(definition_id)
            repo.update_columns(cur, updates, values)
            conn.commit()

        row = repo.fetch_by_id_tuple(cur, definition_id)
        cur.close()
        conn.close()
        return jsonify(CustomFieldDefinition.from_db_row(row).to_dict()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@custom_field_definitions_bp.route("/<int:definition_id>", methods=["DELETE"])
@require_leader
def delete_custom_field_definition(definition_id, current_user_id=None):
    """DELETE /api/custom-field-definitions/<id>"""
    try:
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        row = repo.fetch_name_by_id_dict(cur, definition_id)
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Custom field definition not found"}), 404
        field_name = row["name"]

        repo.delete_by_id(cur, definition_id)

        for srow in repo.iter_supplies_custom_fields_rows(cur):
            cf = srow["custom_fields"]
            if isinstance(cf, str):
                try:
                    cf = json.loads(cf)
                except (TypeError, ValueError):
                    continue
            if not isinstance(cf, dict) or field_name not in cf:
                continue
            del cf[field_name]
            new_json = json.dumps(cf) if cf else None
            repo.update_supply_custom_fields_json(cur, srow["id"], new_json)

        conn.commit()
        cur.close()
        conn.close()
        return "", 204
    except Exception as e:
        return jsonify({"error": str(e)}), 500
