"""
Flask API application for mil-sql.
"""
import os
import sys
from pathlib import Path

# Add src to path for imports (must be before other imports)
sys.path.insert(0, str(Path(__file__).parent.parent))

from flask import Flask
from flask_cors import CORS
from src.api.routes.locations import locations_bp
from src.api.routes.supplies import supplies_bp
from src.api.routes.supplies_location import supplies_location_bp
from src.api.routes.auth import auth_bp
from src.api.routes.categories import categories_bp
from src.api.routes.teams import teams_bp

# Import helpers for schema initialization
from src.scripts.helpers import (
    get_sql_base_path,
    discover_table_files,
    topological_sort_tables,
    table_exists,
    execute_sql_file
)
from src.api.db import get_db

app = Flask(__name__)
# Set secret key for sessions
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
# Configure CORS to allow credentials (cookies)
CORS(app, supports_credentials=True, origins=['http://localhost:3000', 'http://localhost:5000'])

# Register blueprints
app.register_blueprint(locations_bp, url_prefix='/api/locations')
app.register_blueprint(supplies_bp, url_prefix='/api/supplies')
app.register_blueprint(supplies_location_bp, url_prefix='/api/supplies-location')
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(categories_bp, url_prefix='/api')
app.register_blueprint(teams_bp, url_prefix='/api')


def initialize_schema():
    """Initialize database schema if tables are missing."""
    try:
        print("🔍 Checking database schema...")
        conn = get_db()
        cur = conn.cursor()
        
        # Get SQL base path
        SQL_BASE_PATH = get_sql_base_path(__file__)
        print(f"📁 SQL base path: {SQL_BASE_PATH}")
        
        # Discover all table files
        table_files = discover_table_files(SQL_BASE_PATH)
        print(f"📋 Discovered {len(table_files)} table file(s): {[name for name, _ in table_files]}")
        
        if not table_files:
            print("⚠ No table_*.sql files found, skipping initialization")
            cur.close()
            conn.close()
            return
        
        # Sort tables by dependency order
        sorted_tables = topological_sort_tables(table_files)
        print(f"📊 Sorted tables in dependency order: {[name for name, _ in sorted_tables]}")
        
        # Check which tables are missing
        missing_tables = []
        for table_name, sql_file in sorted_tables:
            exists = table_exists(cur, table_name)
            if not exists:
                missing_tables.append((table_name, sql_file))
                print(f"  ⚠ Missing: {table_name}")
            else:
                print(f"  ✓ Exists: {table_name}")
        
        if not missing_tables:
            print("✓ All tables exist, schema is up to date")
            cur.close()
            conn.close()
            return
        
        # Create missing tables
        print(f"📋 Creating {len(missing_tables)} missing table(s)...")
        success_count = 0
        failed_tables = []
        for table_name, sql_file in missing_tables:
            description = f"{table_name} table"
            print(f"  🔨 Creating {table_name} from {sql_file.name}...")
            if execute_sql_file(cur, sql_file, description):
                success_count += 1
            else:
                failed_tables.append(table_name)
        
        conn.commit()
        if failed_tables:
            print(f"⚠ Schema initialization incomplete: {success_count}/{len(missing_tables)} tables created")
            print(f"  Failed tables: {', '.join(failed_tables)}")
        else:
            print(f"✓ Schema initialization complete ({success_count}/{len(missing_tables)} tables created)")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"⚠ Schema initialization warning: {e}")
        import traceback
        traceback.print_exc()
        print("  API will continue, but some endpoints may not work until tables are created")


# Initialize schema on startup
initialize_schema()

# Seed test user, teams, categories, and locations
try:
    from src.scripts.seed_data import seed_test_user, seed_teams, seed_categories, seed_locations
    seed_test_user()
    seed_teams()  # Ensure teams are seeded
    seed_categories()  # Seed categories from JSON
    seed_locations()  # Sync locations from JSON
except Exception as e:
    print(f"⚠ Warning: Could not seed data: {e}")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return {'status': 'healthy'}, 200


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

