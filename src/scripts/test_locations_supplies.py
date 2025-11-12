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
import mysql.connector
import mysql.connector.errors
import tkinter.messagebox
from helpers import parse_database_url, table_exists

# Try to import tkinter, but don't fail if not available (e.g., in Docker)
try:
    import tkinter as tk
    from tkinter import ttk
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False

# Get database URL
DATABASE_URL = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")


def get_connection():
    """Get database connection."""
    db_params = parse_database_url(DATABASE_URL)
    return mysql.connector.connect(**db_params)


def ensure_tables_exist(cur):
    """Ensure locations and supplies tables exist, create if needed."""
    from helpers import get_sql_base_path, discover_table_files, topological_sort_tables, execute_sql_file
    
    SQL_BASE_PATH = get_sql_base_path(__file__)
    table_files = discover_table_files(SQL_BASE_PATH)
    
    # Find locations and supplies tables
    locations_file = None
    supplies_file = None
    
    for table_name, sql_file in table_files:
        if table_name.lower() == 'locations':
            locations_file = sql_file
        elif table_name.lower() == 'supplies':
            supplies_file = sql_file
    
    # Create tables if they don't exist
    if not table_exists(cur, 'locations'):
        if locations_file:
            print("📋 Creating locations table...")
            execute_sql_file(cur, locations_file, "locations table")
        else:
            print("✗ locations table not found and cannot be created")
            return False
    
    if not table_exists(cur, 'supplies'):
        if supplies_file:
            print("📋 Creating supplies table...")
            execute_sql_file(cur, supplies_file, "supplies table")
        else:
            print("✗ supplies table not found and cannot be created")
            return False
    
    return True


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
    """Insert sample supplies data - distributed across 3 containers."""
    print("\n📦 Inserting sample supplies...")
    
    sample_supplies = [
        # Container A
        ('Resistors 1kΩ', 50, '2024-01-15', 'Container A'),
        ('Capacitors 100µF', 30, '2024-01-20', 'Container A'),
        ('Arduino Uno', 5, '2024-02-01', 'Container A'),
        ('Breadboards', 10, '2024-02-10', 'Container A'),
        # Container B
        ('Screws M3', 200, '2024-01-10', 'Container B'),
        ('Bolts M3', 150, '2024-01-10', 'Container B'),
        ('Nuts M3', 300, '2024-01-10', 'Container B'),
        ('Wires Red', 100, '2024-01-05', 'Container B'),
        # Container C
        ('LEDs Red', 50, '2024-01-12', 'Container C'),
        ('LEDs Green', 50, '2024-01-12', 'Container C'),
        ('LEDs Blue', 50, '2024-01-12', 'Container C'),
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


def create_table_viewer(locations_data, supplies_data):
    """Create an interactive tkinter window to display and move supplies between containers."""
    root = tk.Tk()
    root.title("Container Supplies - Move Supplies Between Containers")
    root.geometry("1000x700")
    
    # Get container names
    container_names = [row[0] for row in locations_data if 'Container' in row[0]]
    if len(container_names) < 3:
        container_names = ['Container A', 'Container B', 'Container C']
    
    # Database connection for refreshing data
    # When running locally (not in Docker), use localhost instead of 'db'
    def get_db_connection():
        db_params = parse_database_url(DATABASE_URL)
        # If host is 'db' and we're not in Docker, use localhost
        if db_params.get('host') == 'db' and not os.path.exists("/app"):
            db_params['host'] = 'localhost'
        # Try to connect - if auth plugin fails, try without specifying it
        try:
            return mysql.connector.connect(**db_params)
        except mysql.connector.errors.DatabaseError as e:
            if 'auth' in str(e).lower() or 'plugin' in str(e).lower():
                # Try with different auth plugin
                db_params['auth_plugin'] = 'caching_sha2_password'
                try:
                    return mysql.connector.connect(**db_params)
                except:
                    # Last resort: try mysql_native_password
                    db_params['auth_plugin'] = 'mysql_native_password'
                    return mysql.connector.connect(**db_params)
            raise
    
    def refresh_supplies():
        """Refresh supplies data from database - only for our 3 containers."""
        conn = get_db_connection()
        cur = conn.cursor()
        placeholders = ','.join(['%s'] * len(container_names))
        cur.execute(
            f"SELECT id, name, amount, last_order_date, location FROM supplies WHERE location IN ({placeholders}) ORDER BY location, name",
            container_names
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    
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
        """Move all supplies from one container to another."""
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get all supplies in source container
        cur.execute(
            "SELECT id, name, amount FROM supplies WHERE location = %s",
            (from_container,)
        )
        supplies_to_move = cur.fetchall()
        
        if not supplies_to_move:
            tk.messagebox.showinfo("Info", f"No supplies in {from_container} to move.")
            cur.close()
            conn.close()
            return
        
        # Move each supply
        moved_count = 0
        for supply_id, name, amount in supplies_to_move:
            try:
                # Check if supply exists at destination
                cur.execute(
                    "SELECT id, amount FROM supplies WHERE name = %s AND location = %s",
                    (name, to_container)
                )
                dest_entry = cur.fetchone()
                
                if dest_entry:
                    # Update destination
                    new_amount = dest_entry[1] + amount
                    cur.execute(
                        "UPDATE supplies SET amount = %s WHERE id = %s",
                        (new_amount, dest_entry[0])
                    )
                else:
                    # Create at destination
                    cur.execute(
                        "INSERT INTO supplies (name, amount, location) VALUES (%s, %s, %s)",
                        (name, amount, to_container)
                    )
                
                # Delete from source
                cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))
                moved_count += 1
            except Exception as e:
                print(f"Error moving {name}: {e}")
        
        conn.commit()
        cur.close()
        conn.close()
        
        update_display()
        tk.messagebox.showinfo("Success", f"Moved {moved_count} supply type(s) from {from_container} to {to_container}.")
    
    # Main container
    main_frame = tk.Frame(root, padx=20, pady=20)
    main_frame.pack(fill=tk.BOTH, expand=True)
    
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
                    bg="#4CAF50",
                    fg="white"
                )
                btn.pack(pady=5, fill=tk.X)
    
    # Refresh button
    refresh_btn = tk.Button(
        main_frame,
        text="Refresh",
        command=update_display,
        width=15,
        height=2
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
    """Main test function."""
    try:
        print("🧪 Starting Locations & Supplies Data Test")
        print("=" * 60)
        
        # Connect to database
        print("\n🔌 Connecting to database...")
        conn = get_connection()
        cur = conn.cursor()
        
        # Verify connection
        cur.execute("SELECT VERSION();")
        version = cur.fetchone()[0]
        print(f"✓ Connected to MySQL: {version}")
        
        # Ensure tables exist
        print("\n🔍 Checking tables...")
        if not ensure_tables_exist(cur):
            print("✗ Required tables not available")
            conn.rollback()
            cur.close()
            conn.close()
            sys.exit(1)
        conn.commit()
        
        # Insert sample locations
        loc_inserted, loc_skipped = insert_sample_locations(cur)
        conn.commit()
        
        # Clear old supplies for our containers to start fresh
        container_names = ['Container A', 'Container B', 'Container C']
        print("\n🗑️  Clearing old supplies for test containers...")
        placeholders = ','.join(['%s'] * len(container_names))
        cur.execute(
            f"DELETE FROM supplies WHERE location IN ({placeholders})",
            container_names
        )
        cleared_count = cur.rowcount
        conn.commit()
        print(f"  ✓ Cleared {cleared_count} old supply entry/entries")
        
        # Insert sample supplies
        sup_inserted, sup_failed = insert_sample_supplies(cur)
        conn.commit()
        
        # Get table contents for GUI display - only our 3 containers
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
        
        cur.close()
        conn.close()
        
        # Convert data for JSON output (for test_gui.py to display locally)
        # Convert tuples to lists for JSON serialization
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
        
        # Try to open GUI window locally if tkinter is available and we're not in Docker
        if HAS_TKINTER and not os.path.exists("/app"):
            print("\n🪟 Opening table viewer window...")
            try:
                create_table_viewer(locations_data, supplies_data)
            except Exception as e:
                print(f"⚠ Could not open GUI window: {e}")
                print("  Table contents displayed above in console output.")
        
        # Exit with appropriate code
        if sup_failed > 0:
            print("\n⚠ Some supplies failed to insert (may be due to missing locations)")
            sys.exit(1)
        else:
            print("\n✅ All data inserted successfully!")
            sys.exit(0)
        
    except mysql.connector.Error as e:
        print(f"\n✗ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

