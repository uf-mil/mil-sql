"""
Supply API routes (catalog/reference table).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import mysql.connector
from flask import Blueprint, jsonify, request

from src.api.middleware.auth import require_auth
from src.api.services import supply_catalog_service as svc

supplies_bp = Blueprint("supplies", __name__)


@supplies_bp.route("", methods=["GET"])
@require_auth
def get_supplies(current_user_id=None):
    try:
        return jsonify(svc.list_supplies()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/<int:supply_id>", methods=["GET"])
@require_auth
def get_supply(supply_id, current_user_id=None):
    try:
        return jsonify(svc.get_supply(supply_id)), 200
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("", methods=["POST"])
@require_auth
def create_supply(current_user_id=None):
    try:
        return jsonify(svc.create_supply(request.json, current_user_id)), 201
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except mysql.connector.IntegrityError as e:
        if "Duplicate entry" in str(e) or "unique" in str(e).lower():
            return jsonify({"error": "Supply with this name already exists"}), 400
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/<int:supply_id>", methods=["PUT"])
@require_auth
def update_supply(supply_id, current_user_id=None):
    try:
        return jsonify(svc.update_supply(supply_id, request.json, current_user_id)), 200
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except mysql.connector.IntegrityError as e:
        if "Duplicate entry" in str(e) or "unique" in str(e).lower():
            return jsonify({"error": "Supply with this name already exists"}), 400
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/<int:supply_id>", methods=["DELETE"])
@require_auth
def delete_supply(supply_id, current_user_id=None):
    try:
        svc.delete_supply(supply_id, current_user_id)
        return "", 204
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/history", methods=["GET"])
@require_auth
def get_supply_history(current_user_id=None):
    try:
        supply_id_filter = request.args.get("supply_id", type=int)
        action_type_filter = request.args.get("action_type")
        limit = request.args.get("limit", 100, type=int)
        offset = request.args.get("offset", 0, type=int)
        return jsonify(svc.get_supply_history(supply_id_filter, action_type_filter, limit, offset)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/history/<int:history_id>/undo", methods=["POST"])
@require_auth
def undo_supply_history(history_id, current_user_id=None):
    try:
        return jsonify(svc.undo_supply_history(history_id, current_user_id)), 200
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@supplies_bp.route("/history/<int:history_id>/discard", methods=["POST"])
@require_auth
def discard_supply_history(history_id, current_user_id=None):
    try:
        return jsonify(svc.discard_supply_history(history_id)), 200
    except svc.CatalogError as e:
        return jsonify(e.body), e.status
    except Exception as e:
        return jsonify({"error": str(e)}), 500
