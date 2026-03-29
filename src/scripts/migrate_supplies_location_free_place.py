"""
Migration: supplies_location free-coordinate rows (nullable location_name, coord_x/coord_y, CHECK).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url


def check_column_exists(cur, table_name, column_name):
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = %s
        AND COLUMN_NAME = %s
        """,
        (table_name, column_name),
    )
    return cur.fetchone()[0] > 0


def get_location_fk_name(cur):
    cur.execute(
        """
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'supplies_location'
          AND REFERENCED_TABLE_NAME = 'locations'
        LIMIT 1
        """
    )
    row = cur.fetchone()
    return row[0] if row else None


def migrate_supplies_location_free_place():
    try:
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)

        print("🔄 Migrating supplies_location for free place (coords)...")

        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()

        if not check_column_exists(cur, "supplies_location", "coord_x"):
            fk = get_location_fk_name(cur)
            if fk:
                cur.execute(f"ALTER TABLE supplies_location DROP FOREIGN KEY `{fk}`")
                print(f"  ✓ Dropped FK {fk}")

            cur.execute(
                """
                ALTER TABLE supplies_location
                MODIFY COLUMN location_name VARCHAR(100) NULL,
                ADD COLUMN coord_x INT NULL AFTER location_name,
                ADD COLUMN coord_y INT NULL AFTER coord_x
                """
            )
            print("  ✓ Nullable location_name; added coord_x, coord_y")

            cur.execute(
                """
                ALTER TABLE supplies_location
                ADD CONSTRAINT fk_supply_location_location
                FOREIGN KEY (location_name) REFERENCES locations(name)
                ON UPDATE CASCADE ON DELETE CASCADE
                """
            )
            print("  ✓ Re-added FK location_name -> locations(name)")

            cur.execute(
                """
                ALTER TABLE supplies_location
                ADD CONSTRAINT chk_supply_location_placement
                CHECK (
                    (location_name IS NOT NULL AND coord_x IS NULL AND coord_y IS NULL)
                    OR
                    (location_name IS NULL AND coord_x IS NOT NULL AND coord_y IS NOT NULL)
                )
                """
            )
            print("  ✓ Added CHECK chk_supply_location_placement")
        else:
            print("  ✓ supplies_location.coord_x already exists")

        conn.commit()
        cur.close()
        conn.close()
    except mysql.connector.Error as e:
        print(f"❌ migrate_supplies_location_free_place: {e}")
        raise


if __name__ == "__main__":
    migrate_supplies_location_free_place()
