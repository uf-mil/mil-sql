"""
Unified seed script for all database seed data.
This script is idempotent - it only inserts if data doesn't exist.
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
from helpers import (
    parse_database_url, get_sql_base_path, execute_sql_file, table_exists,
    discover_table_files, topological_sort_tables
)


def get_seed_data_path(filename):
    """Get path to seed data file in src/seed_data/."""
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    return project_root / "src" / "seed_data" / filename


def load_categories_from_json():
    """Load categories from src/seed_data/categories.json."""
    json_path = get_seed_data_path("categories.json")
    
    if not json_path.exists():
        print(f"⚠ Warning: {json_path} not found, using empty categories list")
        return []
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('categories', [])
    except json.JSONDecodeError as e:
        print(f"✗ Error parsing {json_path}: {e}")
        return []
    except Exception as e:
        print(f"✗ Error reading {json_path}: {e}")
        return []


def load_locations_from_json():
    """Load locations from src/seed_data/inventory-locations.json."""
    json_path = get_seed_data_path("inventory-locations.json")
    
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
        return 'unknown'


def ensure_all_tables_exist(conn, cur):
    """Ensure all tables exist by creating missing ones.
    
    Returns:
        tuple: (success_count, failed_tables_list) where failed_tables_list is a list of table names that failed to create
    """
    failed_tables = []
    try:
        sql_base_path = get_sql_base_path(__file__)
        table_files = discover_table_files(sql_base_path)
        
        if not table_files:
            print("⚠ No table_*.sql files found")
            return 0, []
        
        sorted_tables = topological_sort_tables(table_files)
        missing_tables = []
        
        for table_name, sql_file in sorted_tables:
            if not table_exists(cur, table_name):
                missing_tables.append((table_name, sql_file))
        
        if missing_tables:
            print(f"📋 Creating {len(missing_tables)} missing table(s)...")
            success_count = 0
            for table_name, sql_file in missing_tables:
                description = f"{table_name} table"
                print(f"  🔨 Creating {table_name} from {sql_file.name}...")
                if execute_sql_file(cur, sql_file, description):
                    print(f"  ✓ {table_name} created")
                    success_count += 1
                else:
                    print(f"  ✗ Failed to create {table_name}")
                    failed_tables.append(table_name)
            conn.commit()
            
            if failed_tables:
                print(f"\n❌ TABLE CREATION FAILED: {success_count}/{len(missing_tables)} tables created successfully")
                print(f"❌ FAILED TABLES ({len(failed_tables)}): {', '.join(failed_tables)}")
            else:
                print(f"✓ All {success_count} missing table(s) created successfully")
            
            return success_count, failed_tables
        else:
            return 0, []
    except Exception as e:
        print(f"⚠ Warning while ensuring tables exist: {e}")
        import traceback
        traceback.print_exc()
        return 0, failed_tables


def get_db_connection():
    """Get database connection with automatic database creation."""
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
        return conn, db_params
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
            # Retry connection
            conn = mysql.connector.connect(**db_params)
            return conn, db_params
        else:
            raise


def seed_categories():
    """Seed categories from src/seed_data/categories.json."""
    try:
        print("🌱 Seeding categories...")
        
        conn, db_params = get_db_connection()
        cur = conn.cursor()
        
        # Ensure all tables exist (including categories)
        success_count, failed_tables = ensure_all_tables_exist(conn, cur)
        
        # Verify categories table exists
        if not table_exists(cur, 'categories'):
            if 'categories' in failed_tables:
                print("✗ Categories table failed to be created (see errors above)")
            else:
                print("✗ Categories table still does not exist after creation attempt")
            cur.close()
            conn.close()
            return
        
        # Load categories from JSON
        categories = load_categories_from_json()
        
        if not categories:
            print("⚠ No categories found in JSON, skipping category seed")
            cur.close()
            conn.close()
            return
        
        # Get existing categories from database
        cur.execute("SELECT name FROM categories")
        existing_names = {row[0] for row in cur.fetchall()}
        
        # Insert new categories
        insert_count = 0
        for category_name in categories:
            if category_name not in existing_names:
                try:
                    cur.execute(
                        "INSERT INTO categories (name) VALUES (%s)",
                        (category_name,)
                    )
                    insert_count += 1
                except mysql.connector.IntegrityError:
                    # Skip if already exists (race condition)
                    pass
        
        conn.commit()
        print(f"✓ Categories seed complete: {insert_count} inserted, {len(existing_names)} already existed")
        
        cur.close()
        conn.close()
        
    except mysql.connector.Error as e:
        print(f"✗ Database error seeding categories: {e}")
    except Exception as e:
        print(f"✗ Unexpected error seeding categories: {e}")
        import traceback
        traceback.print_exc()


def seed_locations():
    """Sync locations from src/seed_data/inventory-locations.json with database."""
    try:
        print("🌱 Syncing locations from JSON...")
        
        conn, db_params = get_db_connection()
        cur = conn.cursor()
        
        # Ensure all tables exist (including locations)
        success_count, failed_tables = ensure_all_tables_exist(conn, cur)
        
        # Verify locations table exists
        if not table_exists(cur, 'locations'):
            if 'locations' in failed_tables:
                print("✗ Locations table failed to be created (see errors above)")
            else:
                print("✗ Locations table still does not exist after creation attempt")
            cur.close()
            conn.close()
            return
        
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
            # shelf_count is authoritative from JSON (0 means "no shelves").
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
                # Check if columns exist first
                try:
                    cur.execute(
                        "UPDATE locations SET type = %s, shelf_count = %s, x = %s, y = %s, width = %s, height = %s, protected = %s WHERE name = %s",
                        (location_type, shelf_count, x, y, width, height, True, name)
                    )
                    if cur.rowcount > 0:
                        update_count += 1
                except mysql.connector.Error as e:
                    # If columns don't exist, try without them
                    if 'Unknown column' in str(e):
                        # Try without protected column
                        try:
                            cur.execute(
                                "UPDATE locations SET type = %s, shelf_count = %s, x = %s, y = %s, width = %s, height = %s WHERE name = %s",
                                (location_type, shelf_count, x, y, width, height, name)
                            )
                            if cur.rowcount > 0:
                                update_count += 1
                        except mysql.connector.Error as e2:
                            if 'Unknown column' in str(e2):
                                cur.execute(
                                    "UPDATE locations SET type = %s, shelf_count = %s WHERE name = %s",
                                    (location_type, shelf_count, name)
                                )
                                if cur.rowcount > 0:
                                    update_count += 1
                            else:
                                raise
                    else:
                        raise
            else:
                # Insert new location with coordinates - set protected=True for locations from JSON
                try:
                    # Try with coordinates and protected first
                    try:
                        cur.execute(
                            "INSERT INTO locations (name, type, shelf_count, x, y, width, height, protected) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                            (name, location_type, shelf_count, x, y, width, height, True)
                        )
                    except mysql.connector.Error as e:
                        # If protected column doesn't exist, try without it
                        if 'Unknown column' in str(e) and 'protected' in str(e):
                            try:
                                cur.execute(
                                    "INSERT INTO locations (name, type, shelf_count, x, y, width, height) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                                    (name, location_type, shelf_count, x, y, width, height)
                                )
                            except mysql.connector.Error as e2:
                                # If coordinate columns don't exist, insert without them
                                if 'Unknown column' in str(e2):
                                    cur.execute(
                                        "INSERT INTO locations (name, type, shelf_count) VALUES (%s, %s, %s)",
                                        (name, location_type, shelf_count)
                                    )
                                else:
                                    raise
                        else:
                            raise
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
        print(f"✗ Database error seeding locations: {e}")
    except Exception as e:
        print(f"✗ Unexpected error seeding locations: {e}")
        import traceback
        traceback.print_exc()


def seed_teams():
    """Ensure teams are seeded in the database."""
    try:
        print("👥 Checking for teams...")
        
        conn, _ = get_db_connection()
        cur = conn.cursor()
        
        # Ensure all tables exist (including teams)
        success_count, failed_tables = ensure_all_tables_exist(conn, cur)
        
        # Check if teams exist
        cur.execute("SELECT COUNT(*) FROM teams")
        count = cur.fetchone()[0]
        
        if count >= 3:
            print(f"✓ Teams already exist ({count} teams)")
            cur.close()
            conn.close()
            return
        
        # Insert teams if they don't exist
        teams = ['Software', 'Electrical', 'Mechanical']
        insert_count = 0
        for team_name in teams:
            try:
                cur.execute("INSERT IGNORE INTO teams (name) VALUES (%s)", (team_name,))
                if cur.rowcount > 0:
                    insert_count += 1
            except mysql.connector.IntegrityError:
                pass
        
        conn.commit()
        print(f"✓ Teams seed complete: {insert_count} inserted, {count} already existed")
        
        cur.close()
        conn.close()
        
    except mysql.connector.Error as e:
        print(f"✗ Database error seeding teams: {e}")
    except Exception as e:
        print(f"✗ Unexpected error seeding teams: {e}")
        import traceback
        traceback.print_exc()


def seed_test_user():
    """Seed test user if it doesn't exist."""
    try:
        print("👤 Checking for test user...")
        
        conn, _ = get_db_connection()
        cur = conn.cursor(dictionary=True)
        
        # Ensure all tables exist (including members)
        success_count, failed_tables = ensure_all_tables_exist(conn, cur)
        
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
    seed_teams()
    seed_categories()
    seed_locations()

