"""
Migration script to add custom_fields JSON column to supplies table.
Run once to update existing database schema.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url


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


def migrate_supplies_custom_fields():
    """Add custom_fields JSON column to supplies if it doesn't exist."""
    try:
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)

        print("🔄 Migrating supplies table (custom_fields)...")

        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()

        if not check_column_exists(cur, 'supplies', 'custom_fields'):
            cur.execute("ALTER TABLE supplies ADD COLUMN custom_fields JSON DEFAULT NULL AFTER image")
            conn.commit()
            print("✓ Added supplies.custom_fields column")
        else:
            print("✓ supplies.custom_fields already exists")

        # Drop label from custom_field_definitions if present (use name only)
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'custom_field_definitions'
        """)
        if cur.fetchone()[0] > 0 and check_column_exists(cur, 'custom_field_definitions', 'label'):
            cur.execute("ALTER TABLE custom_field_definitions DROP COLUMN label")
            conn.commit()
            print("✓ Dropped custom_field_definitions.label column")

        cur.close()
        conn.close()

    except mysql.connector.Error as e:
        print(f"⚠ Supplies custom_fields migration warning: {e}")
    except Exception as e:
        print(f"⚠ Supplies custom_fields migration warning: {e}")


if __name__ == "__main__":
    migrate_supplies_custom_fields()
