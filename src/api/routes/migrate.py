"""
Migration API route to run database migrations.
This can be called to update the database schema.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from flask import Blueprint, jsonify
from src.api.middleware.auth import require_leader
from src.scripts.migrate_locations_schema import migrate_locations_schema

migrate_bp = Blueprint('migrate', __name__)


@migrate_bp.route('/migrate/locations', methods=['POST'])
@require_leader
def migrate_locations():
    """
    POST /api/migrate/locations
    Run migration to add coordinate columns to locations table.
    Requires leader/admin access.
    """
    try:
        # Capture print output
        import io
        import contextlib
        
        f = io.StringIO()
        with contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
            migrate_locations_schema()
        
        output = f.getvalue()
        
        return jsonify({
            'success': True,
            'message': 'Migration completed',
            'output': output
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500



