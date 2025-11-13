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
from helpers import parse_database_url, get_sql_base_path, execute_sql_file, table_exists

# Default locations from milventory frontend (InventoryContext.js)
DEFAULT_LOCATIONS = [
    {'name': 'Workbench', 'x': 140, 'y': 300, 'width': 150, 'height': 170, 'type': 'workbench'},
    {'name': 'File Cabinet A', 'x': 140, 'y': 700, 'width': 200, 'height': 260, 'type': 'cabinet'},
    {'name': 'File Cabinet B', 'x': 140, 'y': 1000, 'width': 200, 'height': 260, 'type': 'cabinet'},
    {'name': 'Drawer T1', 'x': 200, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer T2', 'x': 410, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer T3', 'x': 620, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer T4', 'x': 830, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer T5', 'x': 1040, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer T6', 'x': 1250, 'y': 120, 'width': 190, 'height': 120, 'type': 'drawer'},
    {'name': 'Drawer R1', 'x': 1340, 'y': 320, 'width': 170, 'height': 170, 'type': 'drawer'},
    {'name': 'Drawer R2', 'x': 1340, 'y': 520, 'width': 170, 'height': 170, 'type': 'drawer'},
    {'name': 'Drawer R3', 'x': 1340, 'y': 720, 'width': 170, 'height': 170, 'type': 'drawer'},
    {'name': 'Drawer R4', 'x': 1340, 'y': 920, 'width': 170, 'height': 170, 'type': 'drawer'},
    {'name': 'Drawer R5', 'x': 1340, 'y': 1120, 'width': 170, 'height': 170, 'type': 'drawer'},
    {'name': 'Table A', 'x': 420, 'y': 520, 'width': 300, 'height': 200, 'type': 'table'},
    {'name': 'Table B', 'x': 880, 'y': 520, 'width': 300, 'height': 200, 'type': 'table'},
    {'name': 'Table C', 'x': 420, 'y': 940, 'width': 300, 'height': 200, 'type': 'table'},
    {'name': 'Table D', 'x': 880, 'y': 940, 'width': 300, 'height': 200, 'type': 'table'},
]


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


if __name__ == "__main__":
    seed_locations()

