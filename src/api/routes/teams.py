"""Teams API routes."""
from flask import Blueprint, jsonify
import mysql.connector
import os
from src.scripts.helpers import parse_database_url

teams_bp = Blueprint('teams', __name__)


def get_db_connection():
    """Get database connection."""
    database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
    db_params = parse_database_url(database_url)
    return mysql.connector.connect(**db_params)


@teams_bp.route('/teams', methods=['GET'])
def get_teams():
    """Get all teams."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT name FROM teams ORDER BY name")
        teams = [row[0] for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return jsonify({'teams': teams}), 200
    except mysql.connector.Error as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

