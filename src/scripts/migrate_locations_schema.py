"""
Migration script to add x, y, width, height columns to locations table.
Run this once to update existing database schema.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url, get_sql_base_path, execute_sql_file


def check_column_exists(cur, table_name, column_name):
    """Check if a column exists in a table."""
    cur.execute("""
        SELECT COUNT(*) 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = %s 
        AND COLUMN_NAME = %s
    """, (table_name, column_name))
    return cur.fetchone()[0] > 0


def migrate_locations_schema():
    """Add coordinate columns to locations table if they don't exist."""
    try:
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)
        
        print("🔄 Migrating locations table schema...")
        
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()
        
        # Check if table exists
        cur.execute("""
            SELECT COUNT(*) 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'locations'
        """)
        if cur.fetchone()[0] == 0:
            print("⚠ Locations table does not exist. Creating it...")
            sql_base_path = get_sql_base_path(__file__)
            locations_file = sql_base_path / "location" / "table_locations.sql"
            if locations_file.exists():
                execute_sql_file(cur, locations_file, "locations table")
                conn.commit()
                print("✓ Locations table created with new schema")
                cur.close()
                conn.close()
                return
            else:
                print(f"✗ Locations table SQL file not found at {locations_file}")
                cur.close()
                conn.close()
                return
        
        # Check which columns need to be added
        columns_to_add = []
        if not check_column_exists(cur, 'locations', 'x'):
            columns_to_add.append(('x', 'INT NOT NULL DEFAULT 0', 'type'))
        if not check_column_exists(cur, 'locations', 'y'):
            columns_to_add.append(('y', 'INT NOT NULL DEFAULT 0', 'x'))
        if not check_column_exists(cur, 'locations', 'width'):
            columns_to_add.append(('width', 'INT NOT NULL DEFAULT 150', 'y'))
        if not check_column_exists(cur, 'locations', 'height'):
            columns_to_add.append(('height', 'INT NOT NULL DEFAULT 150', 'width'))
        
        if not columns_to_add:
            print("✓ All columns already exist, migration not needed")
            cur.close()
            conn.close()
            return
        
        # Add missing columns
        print(f"📋 Adding {len(columns_to_add)} column(s)...")
        for col_name, col_def, after_col in columns_to_add:
            try:
                # Check if column exists first (in case it was added between checks)
                if check_column_exists(cur, 'locations', col_name):
                    print(f"  ⊘ Column {col_name} already exists, skipping")
                    continue
                
                query = f"ALTER TABLE locations ADD COLUMN {col_name} {col_def} AFTER {after_col}"
                cur.execute(query)
                print(f"  ✓ Added column: {col_name}")
            except mysql.connector.Error as e:
                # If error is about duplicate column, that's okay
                if 'Duplicate column name' in str(e) or '1060' in str(e):
                    print(f"  ⊘ Column {col_name} already exists, skipping")
                else:
                    print(f"  ✗ Failed to add column {col_name}: {e}")
        
        conn.commit()
        print("✓ Migration complete")
        
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
    migrate_locations_schema()

