"""
Authentication API routes.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import bcrypt
import mysql.connector
import secrets
from flask import Blueprint, jsonify, request, session

from src.api.db import get_db
from src.api.repositories import members_repository as repo

auth_bp = Blueprint("auth", __name__)

_MIN_PASSWORD_LEN = 8


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


@auth_bp.route("/register", methods=["POST"])
def register():
    """
    POST /api/auth/register
    Create an account (non-leader). Logs the user in on success.
    """
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        confirm_password = data.get("confirm_password") or ""
        first_name = (data.get("first_name") or "").strip()
        last_name = (data.get("last_name") or "").strip()

        if not email or not password or not first_name or not last_name:
            return jsonify({"error": "First name, last name, email, and password are required"}), 400
        if password != confirm_password:
            return jsonify({"error": "Passwords do not match"}), 400
        if len(password) < _MIN_PASSWORD_LEN:
            return jsonify({"error": f"Password must be at least {_MIN_PASSWORD_LEN} characters"}), 400

        token = secrets.token_hex(12)
        discord_tag = f"{token[:24]}#0000"
        github_user = f"signup-{secrets.token_hex(16)}"

        conn = get_db()
        cur = conn.cursor(dictionary=True)
        try:
            uf_id = repo.allocate_uf_id(cur)
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            repo.insert_signup_member(
                cur,
                first_name=first_name,
                last_name=last_name,
                uf_id=uf_id,
                uf_email=email,
                password_hash=password_hash,
                discord=discord_tag,
                github=github_user,
            )
            conn.commit()

            session["user_id"] = uf_id
            session["user_email"] = email
            session["is_leader"] = False

            return (
                jsonify(
                    {
                        "success": True,
                        "user": {
                            "uf_id": uf_id,
                            "email": email,
                            "first_name": first_name,
                            "last_name": last_name,
                            "is_leader": False,
                        },
                    }
                ),
                201,
            )
        except mysql.connector.IntegrityError:
            conn.rollback()
            return jsonify({"error": "An account with this email already exists"}), 409
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()

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
