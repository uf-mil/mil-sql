"""
Authentication API routes.
"""
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from flask import Blueprint, request, jsonify, session
import bcrypt
from src.api.db import get_db

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    POST /api/auth/login
    Login with email and password.
    
    Request body:
        {
            "email": "test@ufl.edu",
            "password": "test"
        }
    
    Returns:
        JSON with user info and success status
    """
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        # Find user by email
        cur.execute(
            "SELECT uf_id, uf_email, first_name, last_name, password_hash, is_leader FROM members WHERE uf_email = %s",
            (email,)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401
        
        if not user['password_hash']:
            return jsonify({'error': 'Invalid email or password'}), 401
        
        if not user['is_leader']:
            return jsonify({'error': 'Access denied. Leader status required.'}), 403
        
        # Verify password
        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'error': 'Invalid email or password'}), 401
        
        # Create session
        session['user_id'] = user['uf_id']
        session['user_email'] = user['uf_email']
        session['is_leader'] = user['is_leader']
        
        return jsonify({
            'success': True,
            'user': {
                'uf_id': user['uf_id'],
                'email': user['uf_email'],
                'first_name': user['first_name'],
                'last_name': user['last_name'],
                'is_leader': user['is_leader']
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    POST /api/auth/logout
    Logout (destroy session).
    
    Returns:
        JSON with success status
    """
    try:
        session.clear()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """
    GET /api/auth/me
    Get current user info from session.
    
    Returns:
        JSON with user info if authenticated, 401 if not
    """
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Not authenticated'}), 401
        
        conn = get_db()
        cur = conn.cursor(dictionary=True)
        
        cur.execute(
            "SELECT uf_id, uf_email, first_name, last_name, is_leader FROM members WHERE uf_id = %s",
            (session['user_id'],)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        
        if not user:
            session.clear()
            return jsonify({'error': 'User not found'}), 401
        
        return jsonify({
            'user': {
                'uf_id': user['uf_id'],
                'email': user['uf_email'],
                'first_name': user['first_name'],
                'last_name': user['last_name'],
                'is_leader': user['is_leader']
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

