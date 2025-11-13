"""
Test script for locations and supplies data insertion and verification.

This script:
1. Inserts sample location data
2. Inserts sample supplies data (linked to locations)
3. Verifies the data was inserted correctly
4. Displays table contents in a GUI window

Usage:
    python src/scripts/test_locations_supplies.py
"""
import os
import sys
import json
import time
import mysql.connector
import mysql.connector.errors
import tkinter.messagebox
import requests
from helpers import (
    parse_database_url, 
    table_exists, 
    get_sql_base_path,
    discover_table_files,
    topological_sort_tables,
    execute_sql_file
)

# Try to import tkinter, but don't fail if not available (e.g., in Docker)
try:
    import tkinter as tk
    from tkinter import ttk
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False

# Get base database URL - test will use a separate test database
BASE_DATABASE_URL = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")

# Base path for SQL files (works in Docker and locally)
SQL_BASE_PATH = get_sql_base_path(__file__)


def drop_all_tables(cur, database_name):
    """Drop all tables from the test database."""
    print(f"\n🗑️  Dropping all existing tables from '{database_name}'...")
    
    # Get all table names from the database
    cur.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = %s",
        (database_name,)
    )
    tables = cur.fetchall()
    
    if not tables:
        print("  ⊘ No tables to drop")
        return
    
    table_names = [table[0] for table in tables]
    print(f"  Found {len(table_names)} table(s) to drop")
    
    # Disable foreign key checks to avoid constraint issues
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    
    dropped_count = 0
    for table_name in table_names:
        try:
            cur.execute(f"DROP TABLE IF EXISTS `{table_name}`")
            dropped_count += 1
        except Exception as e:
            print(f"  ⚠ Warning: Failed to drop table '{table_name}': {e}")
    
    # Re-enable foreign key checks
    cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    
    print(f"  ✓ Dropped {dropped_count}/{len(table_names)} table(s)")


def initialize_schema(cur, database_name=None):
    """Initialize database schema in correct dependency order."""
    print("\n📋 Discovering table files...")
    
    # Discover all table_*.sql files recursively
    table_files = discover_table_files(SQL_BASE_PATH)
    
    if not table_files:
        print(f"⚠ No table_*.sql files found in {SQL_BASE_PATH}")
        return 0, 0
    
    print(f"✓ Found {len(table_files)} table file(s)")
    
    # Sort tables by dependency order
    print("📊 Analyzing dependencies...")
    sorted_tables = topological_sort_tables(table_files)
    
    print("\n📋 Initializing database schema...")
    
    success_count = 0
    for table_name, sql_file in sorted_tables:
        description = f"{table_name} table"
        # Check if table already exists (for idempotency)
        if table_exists(cur, table_name, database_name):
            print(f"⊘ {description} already exists, skipping")
            continue
        
        if execute_sql_file(cur, sql_file, description):
            success_count += 1
    
    print(f"\n✓ Schema initialization complete ({success_count}/{len(sorted_tables)} tables created)")
    return success_count, len(sorted_tables)


def insert_sample_locations(cur):
    """Insert sample location data - just 3 containers."""
    print("\n📦 Inserting sample locations...")
    
    sample_locations = [
        ('Container A', 100, 100, 200, 200, 'container'),
        ('Container B', 400, 100, 200, 200, 'container'),
        ('Container C', 700, 100, 200, 200, 'container'),
    ]
    
    inserted = 0
    skipped = 0
    
    for name, x, y, width, height, loc_type in sample_locations:
        try:
            cur.execute(
                "INSERT INTO locations (name, x, y, width, height, type) VALUES (%s, %s, %s, %s, %s, %s)",
                (name, x, y, width, height, loc_type)
            )
            inserted += 1
        except mysql.connector.IntegrityError:
            # Location already exists, skip
            skipped += 1
        except Exception as e:
            print(f"  ✗ Failed to insert {name}: {e}")
    
    print(f"  ✓ Inserted {inserted} location(s), skipped {skipped} existing")
    return inserted, skipped


def insert_sample_supplies(cur):
    """Insert sample supplies data - DISTRIBUTED SUPPLY in all containers plus 9 different supplies."""
    print("\n📦 Inserting sample supplies...")
    
    # Same supply name in all containers, different amounts
    supply_name = "DISTRIBUTED SUPPLY"
    sample_supplies = [
        # DISTRIBUTED SUPPLY in all 3 containers
        (supply_name, 10, '2024-01-15', 'Container A'),
        (supply_name, 25, '2024-01-20', 'Container B'),
        (supply_name, 5, '2024-02-01', 'Container C'),
        # Container A - 3 additional supplies
        ('Resistors 1K', 50, '2024-01-15', 'Container A'),
        ('Capacitors 100UF', 30, '2024-01-20', 'Container A'),
        ('Arduino Uno', 5, '2024-02-01', 'Container A'),
        # Container B - 3 additional supplies
        ('Screws M3', 200, '2024-01-10', 'Container B'),
        ('Bolts M3', 150, '2024-01-10', 'Container B'),
        ('Nuts M3', 300, '2024-01-10', 'Container B'),
        # Container C - 3 additional supplies
        ('LEDs Red', 50, '2024-01-12', 'Container C'),
        ('LEDs Green', 50, '2024-01-12', 'Container C'),
        ('Multimeter', 2, '2024-01-08', 'Container C'),
    ]
    
    inserted = 0
    failed = 0
    
    for name, amount, last_order_date, location in sample_supplies:
        try:
            cur.execute(
                "INSERT INTO supplies (name, amount, last_order_date, location) VALUES (%s, %s, %s, %s)",
                (name, amount, last_order_date, location)
            )
            inserted += 1
        except Exception as e:
            print(f"  ✗ Failed to insert {name}: {e}")
            failed += 1
    
    print(f"  ✓ Inserted {inserted} supply item(s), {failed} failed")
    return inserted, failed


def display_table_contents(table_name, columns, rows):
    """Display formatted table contents (console output)."""
    print(f"\n📊 {table_name.upper()} Table Contents:")
    print("=" * 80)
    
    if not rows:
        print(f"  (empty)")
        return
    
    # Calculate column widths
    col_widths = [len(col) for col in columns]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)) if val else 0)
    
    # Print header
    header = " | ".join(col.ljust(col_widths[i]) for i, col in enumerate(columns))
    print(f"  {header}")
    print("  " + "-" * len(header))
    
    # Print rows
    for row in rows:
        row_str = " | ".join(str(val).ljust(col_widths[i]) if val is not None else "NULL".ljust(col_widths[i]) 
                            for i, val in enumerate(row))
        print(f"  {row_str}")
    
    print(f"\n  Total rows: {len(rows)}")


def create_table_viewer(locations_data, supplies_data, test_db_name=None, base_params=None, cleanup_callback=None):
    """Create an interactive tkinter window to display and move supplies between containers."""
    root = tk.Tk()
    root.title("Container Supplies - Move Supplies Between Containers")
    root.geometry("1000x700")
    
    # Set up cleanup when window closes
    cleanup_called = {'value': False}
    
    def on_closing():
        if cleanup_callback and not cleanup_called['value']:
            cleanup_called['value'] = True
            cleanup_callback()
        root.destroy()
    
    root.protocol("WM_DELETE_WINDOW", on_closing)
    
    # Get container names
    container_names = [row[0] for row in locations_data if 'Container' in row[0]]
    if len(container_names) < 3:
        container_names = ['Container A', 'Container B', 'Container C']
    
    # Test database connection at startup
    db_connection_available = False
    try:
        # Try to connect to test if connection is available
        if test_db_name is None or base_params is None:
            base_params_test = parse_database_url(BASE_DATABASE_URL)
            test_db_name_test = f"{base_params_test['database']}_test"
        else:
            base_params_test = base_params
            test_db_name_test = test_db_name
        
        db_params_test = {
            'host': base_params_test['host'] if base_params_test['host'] != 'db' else 'localhost',
            'port': base_params_test['port'],
            'user': base_params_test['user'],
            'password': base_params_test['password'],
            'database': test_db_name_test
        }
        
        # Try to connect with different auth plugins
        auth_plugins = [None, 'caching_sha2_password', 'mysql_native_password']
        for auth_plugin in auth_plugins:
            try:
                test_params = db_params_test.copy()
                if auth_plugin:
                    test_params['auth_plugin'] = auth_plugin
                test_conn = mysql.connector.connect(**test_params)
                test_conn.close()
                db_connection_available = True
                break
            except:
                continue
    except:
        db_connection_available = False
    
    # Database connection for refreshing data
    # Use test database only (passed from main function)
    def get_db_connection():
        if not db_connection_available:
            raise Exception("Database connection not available")
        
        # Use parameters passed from main function
        if test_db_name is None or base_params is None:
            # Fallback to parsing from environment
            base_params_fallback = parse_database_url(BASE_DATABASE_URL)
            test_db_name_fallback = f"{base_params_fallback['database']}_test"
        else:
            base_params_fallback = base_params
            test_db_name_fallback = test_db_name
        
        db_params = {
            'host': base_params_fallback['host'],
            'port': base_params_fallback['port'],
            'user': base_params_fallback['user'],
            'password': base_params_fallback['password'],
            'database': test_db_name_fallback
        }
        # If host is 'db' and we're not in Docker, use localhost
        if db_params.get('host') == 'db' and not os.path.exists("/app"):
            db_params['host'] = 'localhost'
        
        # Try different authentication plugins in order
        auth_plugins = [None, 'caching_sha2_password', 'mysql_native_password']
        last_error = None
        
        for auth_plugin in auth_plugins:
            try:
                test_params = db_params.copy()
                if auth_plugin:
                    test_params['auth_plugin'] = auth_plugin
                return mysql.connector.connect(**test_params)
            except mysql.connector.errors.DatabaseError as e:
                last_error = e
                error_str = str(e).lower()
                # If it's an auth/plugin error, try next plugin
                if 'auth' in error_str or 'plugin' in error_str:
                    continue
                # If it's a different error, raise it immediately
                raise
            except Exception as e:
                last_error = e
                # For non-auth errors, try next plugin anyway
                continue
        
        # If all plugins failed, raise the last error
        if last_error:
            raise last_error
        raise Exception("Failed to connect to database with any authentication plugin")
    
    def refresh_supplies():
        """Refresh supplies data from test database - only for our 3 containers."""
        if not db_connection_available:
            return []  # Return empty if connection not available
        
        try:
            # Read directly from test database, not API
            conn = get_db_connection()
            cur = conn.cursor()
            
            # Get supplies from test database for our containers
            placeholders = ','.join(['%s'] * len(container_names))
            cur.execute(
                f"SELECT id, name, amount, last_order_date, location FROM supplies WHERE location IN ({placeholders}) ORDER BY location, name",
                container_names
            )
            supplies = cur.fetchall()
            
            cur.close()
            conn.close()
            
            return list(supplies)
        except Exception as e:
            print(f"Warning: Error fetching supplies from test database: {e}")
            return []
    
    def update_display(supplies_rows=None):
        """Update the display with current supplies.
        
        Args:
            supplies_rows: Optional list of supply rows. If None, fetches from database.
        """
        # Get fresh data if not provided
        if supplies_rows is None:
            try:
                supplies = refresh_supplies()
            except Exception as e:
                # If refresh fails, show error but don't crash
                print(f"Warning: Could not refresh from database: {e}")
                return
        else:
            supplies = supplies_rows
        
        # Group supplies by location
        supplies_by_location = {}
        for row in supplies:
            location = row[4]  # location is last column
            if location not in supplies_by_location:
                supplies_by_location[location] = []
            supplies_by_location[location].append(row)
        
        # Update each container display
        for container_name in container_names:
            if container_name in container_frames:
                listbox = container_frames[container_name]
                listbox.delete(0, tk.END)
                
                if container_name in supplies_by_location:
                    total_items = 0
                    for supply in supplies_by_location[container_name]:
                        name = supply[1]  # name
                        amount = supply[2]  # amount
                        total_items += amount
                        listbox.insert(tk.END, f"{name}: {amount}")
                    
                    # Update container label
                    if container_name in container_labels:
                        container_labels[container_name].config(
                            text=f"{container_name} ({len(supplies_by_location[container_name])} types, {total_items} total items)"
                        )
                else:
                    listbox.insert(0, "(empty)")
                    if container_name in container_labels:
                        container_labels[container_name].config(text=f"{container_name} (empty)")
    
    def move_supply(from_container, to_container):
        """Move all supplies from one container to another in test database."""
        if not db_connection_available:
            tk.messagebox.showwarning(
                "Database Unavailable",
                "Cannot move supplies: Database connection is not available.\n\n"
                "This may be due to MySQL authentication issues when connecting from Windows to Docker.\n"
                "The data is displayed in read-only mode."
            )
            return
        
        conn = None
        try:
            # Get all supplies in source container from test database
            # Create a fresh connection to avoid any auth issues
            conn = get_db_connection()
            cur = conn.cursor()
            
            cur.execute(
                "SELECT id, name, amount, last_order_date, location FROM supplies WHERE location = %s",
                (from_container,)
            )
            supplies_to_move = cur.fetchall()
            
            if not supplies_to_move:
                tk.messagebox.showinfo("Info", f"No supplies in {from_container} to move.")
                cur.close()
                if conn:
                    conn.close()
                return
            
            # Move each supply in the test database
            moved_count = 0
            failed_count = 0
            
            for supply in supplies_to_move:
                supply_id, name, amount, last_order_date, location = supply
                try:
                    # Check if supply already exists in target location
                    cur.execute(
                        "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
                        (name, to_container)
                    )
                    existing = cur.fetchone()
                    
                    if existing:
                        # Merge: add amounts
                        existing_id, existing_amount = existing
                        new_amount = existing_amount + amount
                        cur.execute(
                            "UPDATE supplies SET amount = %s WHERE id = %s",
                            (new_amount, existing_id)
                        )
                        # Delete from source
                        cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))
                    else:
                        # Move: update location
                        cur.execute(
                            "UPDATE supplies SET location = %s WHERE id = %s",
                            (to_container, supply_id)
                        )
                    
                    moved_count += 1
                except mysql.connector.errors.DatabaseError as e:
                    failed_count += 1
                    error_str = str(e).lower()
                    # If it's an auth/packet error, try to reconnect
                    if 'malformed packet' in error_str or 'auth' in error_str or 'plugin' in error_str:
                        print(f"Connection error moving {name}, will retry with fresh connection: {e}")
                        # Close current connection and try again with fresh one
                        try:
                            cur.close()
                            if conn:
                                conn.close()
                        except:
                            pass
                        # Retry with fresh connection
                        try:
                            conn = get_db_connection()
                            cur = conn.cursor()
                            # Re-check if supply exists in target (need to re-query)
                            cur.execute(
                                "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
                                (name, to_container)
                            )
                            existing_retry = cur.fetchone()
                            # Retry the operation
                            if existing_retry:
                                existing_id, existing_amount = existing_retry
                                new_amount = existing_amount + amount
                                cur.execute("UPDATE supplies SET amount = %s WHERE id = %s", (new_amount, existing_id))
                                cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))
                            else:
                                cur.execute("UPDATE supplies SET location = %s WHERE id = %s", (to_container, supply_id))
                            moved_count += 1
                            failed_count -= 1  # Adjust count since retry succeeded
                        except Exception as retry_e:
                            print(f"Retry also failed for {name}: {retry_e}")
                    else:
                        print(f"Error moving {name}: {e}")
                except Exception as e:
                    failed_count += 1
                    print(f"Error moving {name}: {e}")
            
            if conn:
                conn.commit()
                cur.close()
                conn.close()
            
            # Refresh display
            update_display()
            
            # Only show error messages, not success messages
            if failed_count > 0:
                tk.messagebox.showerror("Error", f"Failed to move {failed_count} supply type(s). {moved_count} succeeded.")
                
        except mysql.connector.errors.DatabaseError as e:
            error_str = str(e).lower()
            if 'malformed packet' in error_str or 'auth' in error_str:
                # Try one more time with a completely fresh connection
                try:
                    if conn:
                        try:
                            conn.close()
                        except:
                            pass
                    conn = get_db_connection()
                    # If we can get a connection, show a more helpful message
                    conn.close()
                    tk.messagebox.showerror("Error", f"Database connection issue. Please try again. Error: {str(e)}")
                except Exception as cleanup_e:
                    tk.messagebox.showerror("Error", f"Failed to connect to database. Make sure MySQL is running. Original error: {str(e)}, Cleanup error: {str(cleanup_e)}")
            else:
                tk.messagebox.showerror("Error", f"Failed to move supplies: {str(e)}")
        except Exception as e:
            tk.messagebox.showerror("Error", f"Failed to move supplies: {str(e)}")
        finally:
            # Ensure connection is closed
            if conn:
                try:
                    conn.close()
                except:
                    pass
    
    # Main container
    main_frame = tk.Frame(root, padx=20, pady=20)
    main_frame.pack(fill=tk.BOTH, expand=True)
    
    # Show warning if database connection unavailable
    if not db_connection_available:
        warning_label = tk.Label(
            main_frame,
            text="⚠ Database connection unavailable - Move operations disabled\n(Data is read-only)",
            font=("Arial", 10),
            fg="orange",
            bg="yellow"
        )
        warning_label.pack(pady=10)
    
    # Title
    title_label = tk.Label(main_frame, text="Container Supplies", font=("Arial", 16, "bold"))
    title_label.pack(pady=(0, 20))
    
    # Container frames (3 columns)
    containers_frame = tk.Frame(main_frame)
    containers_frame.pack(fill=tk.BOTH, expand=True)
    
    container_frames = {}
    container_labels = {}
    
    for i, container_name in enumerate(container_names[:3]):
        # Container column
        col_frame = tk.Frame(containers_frame)
        col_frame.grid(row=0, column=i, padx=20, sticky="nsew")
        containers_frame.columnconfigure(i, weight=1)
        
        # Container label
        label = tk.Label(col_frame, text=f"{container_name}", font=("Arial", 12, "bold"))
        label.pack(pady=(0, 10))
        container_labels[container_name] = label
        
        # Supplies listbox
        listbox = tk.Listbox(col_frame, width=30, height=15, font=("Consolas", 10))
        listbox.pack(fill=tk.BOTH, expand=True)
        container_frames[container_name] = listbox
        
        # Move buttons for this container
        buttons_frame = tk.Frame(col_frame)
        buttons_frame.pack(pady=10)
        
        for other_container in container_names[:3]:
            if other_container != container_name:
                btn_text = f"Move to {other_container}"
                btn = tk.Button(
                    buttons_frame,
                    text=btn_text,
                    command=lambda f=container_name, t=other_container: move_supply(f, t),
                    width=20,
                    height=2,
                    font=("Arial", 10, "bold"),
                    bg="#4CAF50" if db_connection_available else "#cccccc",
                    fg="white",
                    state=tk.NORMAL if db_connection_available else tk.DISABLED
                )
                btn.pack(pady=5, fill=tk.X)
    
    # Refresh button (only enabled if DB connection available)
    refresh_btn = tk.Button(
        main_frame,
        text="Refresh",
        command=update_display,
        width=15,
        height=2,
        state=tk.NORMAL if db_connection_available else tk.DISABLED
    )
    refresh_btn.pack(pady=10)
    
    # Close button
    close_btn = tk.Button(
        main_frame,
        text="Close",
        command=root.destroy,
        width=15,
        height=2
    )
    close_btn.pack()
    
    # Initial display - use passed data, convert to same format as database rows
    # supplies_data format: (id, name, amount, last_order_date, location)
    initial_supplies = []
    for row in supplies_data:
        # Convert tuple to list format matching database query result
        initial_supplies.append(row)
    
    update_display(initial_supplies)
    
    root.mainloop()


def main():
    """Main test function - uses test database only, deletes and recreates it."""
    root_conn = None
    conn = None
    try:
        # Parse base database URL
        base_params = parse_database_url(BASE_DATABASE_URL)
        test_db_name = f"{base_params['database']}_test"
        
        print("🧪 Starting Locations & Supplies Data Test")
        print(f"📊 Test database: {test_db_name}")
        print("=" * 60)
        print(f"🔌 Connecting to MySQL server...")
        
        # Use root credentials for database operations
        root_password = os.getenv("MYSQL_ROOT_PASSWORD", "rootpassword")
        
        # Connect as root
        root_conn_params = {
            'host': base_params['host'],
            'port': base_params['port'],
            'user': 'root',
            'password': root_password
        }
        
        root_conn = mysql.connector.connect(**root_conn_params)
        root_cur = root_conn.cursor()
        
        # Verify connection
        root_cur.execute("SELECT VERSION();")
        version = root_cur.fetchone()[0]
        print(f"✓ Connected to MySQL: {version}")
        
        # STEP 1: Drop test database if it exists (clean start)
        print(f"\n🗑️  Dropping test database '{test_db_name}' if it exists...")
        root_cur.execute(f"DROP DATABASE IF EXISTS `{test_db_name}`")
        root_conn.commit()
        print(f"✓ Test database dropped (if it existed)")
        
        # Small delay to ensure database is fully dropped
        time.sleep(0.5)
        
        # STEP 2: Create fresh test database
        print(f"\n📦 Creating fresh test database '{test_db_name}'...")
        root_cur.execute(f"CREATE DATABASE `{test_db_name}`")
        
        # Grant permissions to mysqluser on the test database
        username = base_params['user']
        root_cur.execute(f"GRANT ALL PRIVILEGES ON `{test_db_name}`.* TO '{username}'@'%'")
        root_cur.execute("FLUSH PRIVILEGES")
        root_conn.commit()
        print(f"✓ Test database created and permissions granted")
        
        root_cur.close()
        root_conn.close()
        root_conn = None
        
        # Small delay to ensure privileges are propagated
        time.sleep(0.5)
        
        # STEP 3: Connect as mysqluser to test database
        print(f"\n🔌 Connecting as '{base_params['user']}' to test database...")
        conn_params = {
            'host': base_params['host'],
            'port': base_params['port'],
            'user': base_params['user'],
            'password': base_params['password'],
            'database': test_db_name
        }
        
        try:
            conn = mysql.connector.connect(**conn_params)
            cur = conn.cursor()
            print(f"✓ Connected successfully to test database")
        except mysql.connector.Error as e:
            print(f"✗ Failed to connect as {base_params['user']}: {e}")
            print(f"  Attempting to verify privileges...")
            # Try to reconnect as root to check if user exists
            root_conn = mysql.connector.connect(**root_conn_params)
            root_cur = root_conn.cursor()
            root_cur.execute(f"SELECT User, Host FROM mysql.user WHERE User = '{username}'")
            users = root_cur.fetchall()
            if not users:
                print(f"  ⚠ User '{username}' does not exist. Creating user...")
                root_cur.execute(f"CREATE USER IF NOT EXISTS '{username}'@'%' IDENTIFIED BY '{base_params['password']}'")
                root_cur.execute(f"GRANT ALL PRIVILEGES ON `{test_db_name}`.* TO '{username}'@'%'")
                root_cur.execute("FLUSH PRIVILEGES")
                root_conn.commit()
                root_cur.close()
                root_conn.close()
                root_conn = None
                time.sleep(0.5)
                # Retry connection
                conn = mysql.connector.connect(**conn_params)
                cur = conn.cursor()
                print(f"✓ Connected successfully after creating user")
            else:
                raise
        
        # STEP 4: Initialize schema in test database
        created_count, total_count = initialize_schema(cur, test_db_name)
        conn.commit()
        
        # STEP 5: Insert sample locations
        loc_inserted, loc_skipped = insert_sample_locations(cur)
        conn.commit()
        
        # STEP 6: Insert sample supplies
        container_names = ['Container A', 'Container B', 'Container C']
        sup_inserted, sup_failed = insert_sample_supplies(cur)
        conn.commit()
        
        # STEP 7: Get table contents for GUI display - only our 3 containers
        print("\n📊 Fetching table contents...")
        placeholders = ','.join(['%s'] * len(container_names))
        cur.execute(
            f"SELECT name, x, y, width, height, type FROM locations WHERE name IN ({placeholders}) ORDER BY name",
            container_names
        )
        locations_data = cur.fetchall()
        
        cur.execute(
            f"SELECT id, name, amount, last_order_date, location FROM supplies WHERE location IN ({placeholders}) ORDER BY location, name",
            container_names
        )
        supplies_data = cur.fetchall()
        
        # Display table contents in console
        print("\n" + "=" * 60)
        display_table_contents('locations', ['name', 'x', 'y', 'width', 'height', 'type'], locations_data)
        display_table_contents('supplies', ['id', 'name', 'amount', 'last_order_date', 'location'], supplies_data)
        
        # Summary
        print("\n" + "=" * 60)
        print("✅ TEST SUMMARY:")
        print(f"   Locations: {loc_inserted} inserted, {loc_skipped} skipped (already existed)")
        print(f"   Supplies: {sup_inserted} inserted, {sup_failed} failed")
        print("=" * 60)
        
        # Close user connection - database stays alive for GUI
        cur.close()
        conn.close()
        conn = None
        # IMPORTANT: Database must remain alive for GUI to use it!
        
        # Convert data for JSON output (for test_gui.py to display locally)
        locations_json = [list(row) for row in locations_data]
        supplies_json = [list(row) for row in supplies_data]
        
        # Convert date objects to strings
        for row in supplies_json:
            if row[3] is not None and hasattr(row[3], 'isoformat'):
                row[3] = row[3].isoformat()
        
        table_data = {
            'locations': {
                'columns': ['name', 'x', 'y', 'width', 'height', 'type'],
                'data': locations_json
            },
            'supplies': {
                'columns': ['id', 'name', 'amount', 'last_order_date', 'location'],
                'data': supplies_json
            }
        }
        
        # Output JSON with special marker for test_gui.py to detect
        print("\n" + "=" * 60)
        print("TABLE_DATA_JSON_START")
        print(json.dumps(table_data, indent=2))
        print("TABLE_DATA_JSON_END")
        print("=" * 60)
        
        # IMPORTANT: Database MUST stay alive - do NOT drop it here!
        # The GUI will be opened by test_gui.py locally, and cleanup will happen when GUI closes
        # If running directly (not through test_gui.py), we'll handle cleanup differently
        
        # Check if we're being run through test_gui.py (which will open GUI locally)
        # test_gui.py will detect the JSON output and open the viewer
        # So we should NOT drop the database here - let test_gui.py handle it
        
        # Exit with appropriate code (but don't drop database - let GUI handle cleanup)
        if sup_failed > 0:
            print("\n⚠ Some supplies failed to insert (may be due to missing locations)")
            # Drop database on failure
            print(f"\n🗑️  Cleaning up: Dropping test database '{test_db_name}'...")
            root_conn = mysql.connector.connect(**root_conn_params)
            root_cur = root_conn.cursor()
            root_cur.execute(f"DROP DATABASE IF EXISTS `{test_db_name}`")
            root_conn.commit()
            root_cur.close()
            root_conn.close()
            print(f"✓ Test database '{test_db_name}' dropped")
            sys.exit(1)
        else:
            print("\n✅ All data inserted successfully!")
            # DO NOT drop database here - test_gui.py will open GUI and handle cleanup
            # The database must stay alive for the GUI to use it
            print(f"   (Test database '{test_db_name}' will be cleaned up when GUI closes)")
            sys.exit(0)
        
    except mysql.connector.Error as e:
        print(f"\n✗ Database error: {e}")
        # Try to clean up test database on error
        try:
            if root_conn is None:
                root_conn = mysql.connector.connect(**root_conn_params)
            root_cur = root_conn.cursor()
            root_cur.execute(f"DROP DATABASE IF EXISTS `{test_db_name}`")
            root_conn.commit()
            root_cur.close()
            root_conn.close()
            print(f"✓ Cleaned up test database '{test_db_name}'")
        except:
            pass
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        # Try to clean up test database on error
        try:
            base_params = parse_database_url(BASE_DATABASE_URL)
            test_db_name = f"{base_params['database']}_test"
            root_password = os.getenv("MYSQL_ROOT_PASSWORD", "rootpassword")
            root_conn_params = {
                'host': base_params['host'],
                'port': base_params['port'],
                'user': 'root',
                'password': root_password
            }
            if root_conn is None:
                root_conn = mysql.connector.connect(**root_conn_params)
            root_cur = root_conn.cursor()
            root_cur.execute(f"DROP DATABASE IF EXISTS `{test_db_name}`")
            root_conn.commit()
            root_cur.close()
            root_conn.close()
            print(f"✓ Cleaned up test database '{test_db_name}'")
        except:
            pass
        sys.exit(1)
    finally:
        # Ensure connections are closed
        if conn:
            try:
                conn.close()
            except:
                pass
        if root_conn:
            try:
                root_conn.close()
            except:
                pass


if __name__ == "__main__":
    main()

