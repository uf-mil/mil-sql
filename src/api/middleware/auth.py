"""
Authentication middleware for protecting routes.
"""
from functools import wraps
from flask import session, jsonify


def require_auth(f):
    """
    Decorator to require authentication for a route.
    
    Returns 401 if user is not authenticated.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        
        # Add current user info to kwargs for convenience
        kwargs['current_user_id'] = session.get('user_id')
        return f(*args, **kwargs)
    
    return decorated_function

