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


def load_default_locations():
    """Load default locations from inventory_locations.json."""
    script_dir = Path(__file__).parent
    json_path = script_dir / "inventory_locations.json"
    
    if not json_path.exists():
        print(f"⚠ Warning: {json_path} not found, using empty locations list")
        return []
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            locations = json.load(f)
        return locations
    except json.JSONDecodeError as e:
        print(f"✗ Error parsing {json_path}: {e}")
        return []
    except Exception as e:
        print(f"✗ Error reading {json_path}: {e}")
        return []


def seed_locations():
    """Seed default locations if none exist."""
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
                import time
                time.sleep(0.5)
            else:
                raise
        
        print("🌱 Checking for existing locations...")
        
        # Connect to database
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()
        
        # Check if locations table exists, create it if needed
        if not table_exists(cur, 'locations'):
            print("⚠ Locations table does not exist. Creating it...")
            # Get SQL base path and find locations table file
            sql_base_path = get_sql_base_path(__file__)
            # Try both possible filenames
            locations_file = sql_base_path / "location" / "table_locations.sql"
            if not locations_file.exists():
                locations_file = sql_base_path / "location" / "table_location.sql"
            
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
        
        # Check if any locations exist
        cur.execute("SELECT COUNT(*) FROM locations")
        count = cur.fetchone()[0]
        
        if count > 0:
            print(f"✓ Found {count} existing location(s), skipping seed")
            cur.close()
            conn.close()
            return
        
        # Load default locations from JSON
        DEFAULT_LOCATIONS = load_default_locations()
        
        if not DEFAULT_LOCATIONS:
            print("⚠ No default locations to seed")
            cur.close()
            conn.close()
            return
        
        # Insert default locations
        print(f"📦 Seeding {len(DEFAULT_LOCATIONS)} default locations...")
        
        insert_count = 0
        for loc in DEFAULT_LOCATIONS:
            try:
                cur.execute(
                    "INSERT INTO locations (name, x, y, width, height, type) VALUES (%s, %s, %s, %s, %s, %s)",
                    (loc['name'], loc['x'], loc['y'], loc['width'], loc['height'], loc['type'])
                )
                insert_count += 1
            except mysql.connector.IntegrityError:
                # Skip if already exists (shouldn't happen, but be safe)
                print(f"  ⚠ {loc['name']} already exists, skipping")
        
        conn.commit()
        print(f"✓ Successfully seeded {insert_count} location(s)")
        
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

