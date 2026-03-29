"""Teams API routes."""
from flask import Blueprint, jsonify
import mysql.connector

from src.api.db import get_db
from src.api.repositories import teams_repository as repo

teams_bp = Blueprint("teams", __name__)


@teams_bp.route("/teams", methods=["GET"])
def get_teams():
    """Get all teams."""
    try:
        conn = get_db()
        cur = conn.cursor()
        teams = repo.list_team_names_ordered(cur)
        cur.close()
        conn.close()
        return jsonify({"teams": teams}), 200
    except mysql.connector.Error as e:
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
