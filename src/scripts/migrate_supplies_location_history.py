"""
Migration script to create the supplies_location_history table.
"""
import sys
import os
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

import mysql.connector
from src.scripts.helpers import parse_database_url, get_sql_base_path, execute_sql_file, table_exists

def migrate_supplies_location_history():
    """Create the supplies_location_history table if it doesn't exist."""
    try:
        # Use environment variables or defaults (same as app.py)
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            # Build from individual env vars (same pattern as src/api/db.py)
            db_host = os.getenv('DB_HOST', 'localhost')
            db_port = int(os.getenv('DB_PORT', 3306))
            db_user = os.getenv('DB_USER', 'mysqluser')
            db_password = os.getenv('DB_PASSWORD', 'mysqlpassword')
            db_name = os.getenv('DB_NAME', 'mydb')
            database_url = f"mysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        
        db_params = parse_database_url(database_url)
        # Use Pure Python connector to avoid auth plugin issues
        db_params['use_pure'] = True
        db_params['auth_plugin'] = 'mysql_native_password'
        
        print("Migrating supplies_location_history table...")
        
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()
        
        # Check if table already exists
        if table_exists(cur, 'supplies_location_history'):
            print("[OK] supplies_location_history table already exists, skipping migration")
            cur.close()
            conn.close()
            return True
        
        # Get the SQL file path
        sql_base_path = get_sql_base_path(__file__)
        sql_file = sql_base_path / 'supplies_location' / 'table_supplies_location_history.sql'
        
        if not sql_file.exists():
            print(f"[ERROR] SQL file not found: {sql_file}")
            cur.close()
            conn.close()
            return False
        
        print(f"Creating supplies_location_history table from {sql_file.name}...")
        
        # Execute the SQL file
        if execute_sql_file(cur, sql_file, "supplies_location_history table"):
            conn.commit()
            print("[OK] Migration completed successfully")
            cur.close()
            conn.close()
            return True
        else:
            conn.rollback()
            print("[ERROR] Migration failed")
            cur.close()
            conn.close()
            return False
            
    except Exception as e:
        print(f"[ERROR] Migration error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = migrate_supplies_location_history()
    sys.exit(0 if success else 1)

