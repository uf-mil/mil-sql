"""
Authentication API routes.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import bcrypt
from flask import Blueprint, jsonify, request, session

from src.api.db import get_db
from src.api.repositories import members_repository as repo

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    POST /api/auth/login
    Login with email and password.
    """
    try:
        data = request.get_json()
        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        conn = get_db()
        cur = conn.cursor(dictionary=True)
        user = repo.fetch_by_email_dict(cur, email)
        cur.close()
        conn.close()

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        if not user["password_hash"]:
            return jsonify({"error": "Invalid email or password"}), 401

        if not user["is_leader"]:
            return jsonify({"error": "Access denied. Leader status required."}), 403

        if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            return jsonify({"error": "Invalid email or password"}), 401

        session["user_id"] = user["uf_id"]
        session["user_email"] = user["uf_email"]
        session["is_leader"] = user["is_leader"]

        return jsonify(
            {
                "success": True,
                "user": {
                    "uf_id": user["uf_id"],
                    "email": user["uf_email"],
                    "first_name": user["first_name"],
                    "last_name": user["last_name"],
                    "is_leader": user["is_leader"],
                },
            }
        ), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/logout", methods=["POST"])
def logout():
    """POST /api/auth/logout"""
    try:
        session.clear()
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    """GET /api/auth/me"""
    try:
        if "user_id" not in session:
            return jsonify({"error": "Not authenticated"}), 401

        conn = get_db()
        cur = conn.cursor(dictionary=True)
        user = repo.fetch_by_uf_id_dict(cur, session["user_id"])
        cur.close()
        conn.close()

        if not user:
            session.clear()
            return jsonify({"error": "User not found"}), 401

        return jsonify(
            {
                "user": {
                    "uf_id": user["uf_id"],
                    "email": user["uf_email"],
                    "first_name": user["first_name"],
                    "last_name": user["last_name"],
                    "is_leader": user["is_leader"],
                }
            }
        ), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
