"""
Seed default locations into the database.
This script is idempotent - it only inserts if no locations exist.
"""
import os
import sys
from pathlib import Path

# Add src/scripts to path for imports (so we can import helpers directly)
sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
import time
import json
import bcrypt
from helpers import parse_database_url, get_sql_base_path, execute_sql_file, table_exists


def load_locations_from_json():
    """Load locations from src/seed_data/inventory-locations.json."""
    # Get project root (go up from src/scripts to project root)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    json_path = project_root / "src" / "seed_data" / "inventory-locations.json"
    
    if not json_path.exists():
        print(f"⚠ Warning: {json_path} not found, using empty locations list")
        return []
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('boxes', [])
    except json.JSONDecodeError as e:
        print(f"✗ Error parsing {json_path}: {e}")
        return []
    except Exception as e:
        print(f"✗ Error reading {json_path}: {e}")
        return []


def derive_location_type(title):
    """Derive location type from box title."""
    title_lower = title.lower()
    if title_lower.startswith('drawer'):
        return 'drawer'
    elif title_lower.startswith('cabinet') and not title_lower.startswith('tall cabinet'):
        return 'cabinet'
    elif title_lower.startswith('tall cabinet'):
        return 'tall_cabinet'
    elif title_lower.startswith('table'):
        return 'table'
    elif 'workbench' in title_lower or title_lower == 'workbench':
        return 'other'
    else:
        return 'other'  # Default to 'other' instead of 'unknown'


def seed_locations():
    """Sync locations from src/seed_data/inventory-locations.json with database."""
    try:
        # Get database connection parameters
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)
        database_name = db_params['database']
        
        # Get root password for database creation
        root_password = os.getenv("MYSQL_ROOT_PASSWORD", "rootpassword")
        
        # First, ensure the database exists (connect as root to create it if needed)
        root_conn_params = {
            'host': db_params['host'],
            'port': db_params['port'],
            'user': 'root',
            'password': root_password
        }
        
        try:
            # Try to connect to the database first
            conn = mysql.connector.connect(**db_params)
            cur = conn.cursor()
            cur.close()
            conn.close()
        except mysql.connector.Error as e:
            # If database doesn't exist, create it
            if 'Unknown database' in str(e) or '1049' in str(e):
                print(f"📦 Database '{database_name}' does not exist, creating it...")
                root_conn = mysql.connector.connect(**root_conn_params)
                root_cur = root_conn.cursor()
                root_cur.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}`")
                root_cur.execute(f"GRANT ALL PRIVILEGES ON `{database_name}`.* TO '{db_params['user']}'@'%'")
                root_cur.execute("FLUSH PRIVILEGES")
                root_conn.commit()
                root_cur.close()
                root_conn.close()
                print(f"✓ Database '{database_name}' created")
                # Small delay to ensure privileges are propagated
                time.sleep(0.5)
            else:
                raise
        
        print("🌱 Syncing locations from JSON...")
        
        # Connect to database
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()
        
        # Check if locations table exists, create it if needed
        if not table_exists(cur, 'locations'):
            print("⚠ Locations table does not exist. Creating it...")
            # Get SQL base path and find locations table file
            sql_base_path = get_sql_base_path(__file__)
            locations_file = sql_base_path / "location" / "table_locations.sql"
            
            if locations_file.exists():
                if execute_sql_file(cur, locations_file, "locations table"):
                    conn.commit()
                    print("✓ Locations table created")
                else:
                    print("✗ Failed to create locations table")
                    cur.close()
                    conn.close()
                    sys.exit(1)
            else:
                print(f"✗ Locations table SQL file not found at {locations_file}")
                print("  Waiting for API to create it...")
                # Wait and retry a few times
                cur.close()
                conn.close()
                for attempt in range(5):
                    time.sleep(2)
                    try:
                        conn = mysql.connector.connect(**db_params)
                        cur = conn.cursor()
                        if table_exists(cur, 'locations'):
                            print("✓ Locations table now exists (created by API)")
                            break
                        cur.close()
                        conn.close()
                    except:
                        pass
                else:
                    # Final check
                    conn = mysql.connector.connect(**db_params)
                    cur = conn.cursor()
                    if not table_exists(cur, 'locations'):
                        print("✗ Locations table still does not exist after waiting.")
                        cur.close()
                        conn.close()
                        sys.exit(1)
        
        # Load locations from JSON
        boxes = load_locations_from_json()
        
        if not boxes:
            print("⚠ No boxes found in JSON, skipping location sync")
            cur.close()
            conn.close()
            return
        
        # Get existing locations from database
        cur.execute("SELECT name FROM locations")
        existing_names = {row[0] for row in cur.fetchall()}
        
        # Process boxes from JSON
        json_names = set()
        insert_count = 0
        update_count = 0
        
        for box in boxes:
            name = box.get('title', '')
            if not name:
                continue
            
            json_names.add(name)
            location_type = derive_location_type(name)
            # shelf_count is authoritative from JSON. Legacy JSON entries that
            # omit it fall back to 0 (no shelves) — add `"shelf_count": N` in
            # inventory-locations.json to turn shelves on for a location.
            try:
                shelf_count = max(0, int(box.get('shelf_count', 0) or 0))
            except (TypeError, ValueError):
                shelf_count = 0

            # Get coordinates from JSON box
            x = box.get('x', 0)
            y = box.get('y', 0)
            width = box.get('width', 150)
            height = box.get('height', 150)
            
            if name in existing_names:
                # Update existing location (update all fields including coordinates and protected status)
                cur.execute(
                    "UPDATE locations SET type = %s, shelf_count = %s, x = %s, y = %s, width = %s, height = %s, protected = %s WHERE name = %s",
                    (location_type, shelf_count, x, y, width, height, True, name)
                )
                if cur.rowcount > 0:
                    update_count += 1
            else:
                # Insert new location with coordinates - set protected=True for locations from JSON
                try:
                    cur.execute(
                        "INSERT INTO locations (name, type, shelf_count, x, y, width, height, protected) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                        (name, location_type, shelf_count, x, y, width, height, True)
                    )
                    insert_count += 1
                except mysql.connector.IntegrityError:
                    # Skip if already exists (race condition)
                    pass
        
        # Delete locations that don't exist in JSON
        to_delete = existing_names - json_names
        delete_count = 0
        if to_delete:
            placeholders = ','.join(['%s'] * len(to_delete))
            cur.execute(f"DELETE FROM locations WHERE name IN ({placeholders})", list(to_delete))
            delete_count = cur.rowcount
        
        conn.commit()
        print(f"✓ Location sync complete: {insert_count} inserted, {update_count} updated, {delete_count} deleted")
        
        cur.close()
        conn.close()
        
    except mysql.connector.Error as e:
        print(f"✗ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


def seed_test_user():
    """Seed test user if it doesn't exist."""
    try:
        # Get database connection parameters
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)
        
        print("👤 Checking for test user...")
        
        # Connect to database
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor(dictionary=True)
        
        # Check if test user exists
        cur.execute("SELECT uf_id FROM members WHERE uf_email = %s", ("test@ufl.edu",))
        existing_user = cur.fetchone()
        
        if existing_user:
            print("✓ Test user already exists")
            cur.close()
            conn.close()
            return
        
        # Hash password
        password = "test"
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Insert test user
        cur.execute(
            """INSERT INTO members 
               (uf_id, uf_email, first_name, last_name, password_hash, is_leader, discord, github) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                "12345678",
                "test@ufl.edu",
                "Test",
                "User",
                password_hash,
                True,
                "testuser#0000",
                "testuser"
            )
        )
        
        conn.commit()
        print("✓ Test user created (email: test@ufl.edu, password: test)")
        
        cur.close()
        conn.close()
        
    except mysql.connector.IntegrityError:
        # User might have been created between check and insert
        print("✓ Test user already exists (race condition)")
    except Exception as e:
        print(f"⚠ Warning: Could not seed test user: {e}")


if __name__ == "__main__":
    seed_test_user()
    seed_locations()

