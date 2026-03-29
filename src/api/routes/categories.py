"""Categories API routes."""
from flask import Blueprint, request, jsonify
import mysql.connector

from src.api.db import get_db
from src.api.middleware.auth import require_leader
from src.api.models.category import Category
from src.api.repositories import categories_repository as repo

categories_bp = Blueprint("categories", __name__)


@categories_bp.route("/categories", methods=["GET"])
def get_categories():
    """Get all categories with IDs."""
    try:
        conn = get_db()
        cur = conn.cursor()
        rows = repo.list_id_name_ordered(cur)
        categories = [{"id": row[0], "name": row[1]} for row in rows]
        cur.close()
        conn.close()
        return jsonify({"categories": categories}), 200
    except mysql.connector.Error as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


@categories_bp.route("/categories/<int:category_id>", methods=["GET"])
def get_category(category_id):
    """Get a single category by ID."""
    try:
        conn = get_db()
        cur = conn.cursor()
        row = repo.fetch_by_id(cur, category_id)
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Category not found"}), 404
        category = Category.from_db_row(row)
        return jsonify(category.to_dict()), 200
    except mysql.connector.Error as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


@categories_bp.route("/categories", methods=["POST"])
@require_leader
def create_category(current_user_id=None):
    """Create a new category. Requires leader/admin access."""
    try:
        data = request.json
        if not data or "name" not in data:
            return jsonify({"error": "Category name is required"}), 400
        name = data["name"].strip()
        if not name:
            return jsonify({"error": "Category name cannot be empty"}), 400

        conn = get_db()
        cur = conn.cursor()
        try:
            repo.insert_name(cur, name)
            conn.commit()
            row = repo.fetch_last_insert_row(cur)
            category = Category.from_db_row(row)
            cur.close()
            conn.close()
            return jsonify(category.to_dict()), 201
        except mysql.connector.IntegrityError as e:
            conn.rollback()
            cur.close()
            conn.close()
            if "Duplicate entry" in str(e) or "UNIQUE constraint" in str(e):
                return jsonify({"error": "Category with this name already exists"}), 409
            return jsonify({"error": f"Database error: {str(e)}"}), 400
    except mysql.connector.Error as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
