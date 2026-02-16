"""Categories API routes."""
from flask import Blueprint, jsonify
import mysql.connector
import os
from src.scripts.helpers import parse_database_url

categories_bp = Blueprint('categories', __name__)


def get_db_connection():
    """Get database connection."""
    database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
    db_params = parse_database_url(database_url)
    return mysql.connector.connect(**db_params)


@categories_bp.route('/categories', methods=['GET'])
def get_categories():
    """Get all categories."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT name FROM categories ORDER BY name")
        categories = [row[0] for row in cur.fetchall()]
        
        cur.close()
        conn.close()
        
        return jsonify({'categories': categories}), 200
    except mysql.connector.Error as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500


@categories_bp.route('/categories/<int:category_id>', methods=['GET'])
def get_category(category_id):
    """Get a single category by ID."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT id, name, created_at FROM categories WHERE id = %s", (category_id,))
        row = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if not row:
            return jsonify({'error': 'Category not found'}), 404
        
        from src.api.models.category import Category
        category = Category.from_db_row(row)
        return jsonify(category.to_dict()), 200
    except mysql.connector.Error as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

