"""
Migration: one unit per free coordinate; unique (supply_id + coords); CHECK amount = 1.

Run after migrate_supplies_location_free_place (coord_x/coord_y exist).
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


def check_constraint_exists(cur, name):
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'supplies_location'
          AND CONSTRAINT_NAME = %s
        """,
        (name,),
    )
    return cur.fetchone()[0] > 0


def migrate_free_coord_one_per():
    database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
    db_params = parse_database_url(database_url)

    print("🔄 Migrating supplies_location: 1 qty per free coordinate + unique coords...")

    conn = mysql.connector.connect(**db_params)
    cur = conn.cursor()

    if not check_column_exists(cur, "supplies_location", "coord_x"):
        print("  ⚠ coord_x missing — run migrate_supplies_location_free_place first")
        cur.close()
        conn.close()
        return

    if check_column_exists(cur, "supplies_location", "free_coord_uid"):
        print("  ✓ free_coord_uid already exists — skipping")
        cur.close()
        conn.close()
        return

    # Remove duplicate free-coordinate rows (keep lowest id)
    cur.execute(
        """
        DELETE sl1 FROM supplies_location sl1
        INNER JOIN supplies_location sl2
          ON sl1.supply_id = sl2.supply_id
          AND sl1.coord_x = sl2.coord_x
          AND sl1.coord_y = sl2.coord_y
          AND sl1.location_name IS NULL
          AND sl2.location_name IS NULL
          AND sl1.id > sl2.id
        """
    )
    print(f"  ✓ Removed duplicate free-coordinate rows ({cur.rowcount} deleted)")

    cur.execute(
        """
        UPDATE supplies_location
        SET amount = 1
        WHERE location_name IS NULL
          AND coord_x IS NOT NULL
          AND coord_y IS NOT NULL
          AND amount <> 1
        """
    )
    if cur.rowcount:
        print(f"  ✓ Normalized free-coordinate amount to 1 ({cur.rowcount} rows)")

    if check_constraint_exists(cur, "chk_supply_location_placement"):
        cur.execute(
            "ALTER TABLE supplies_location DROP CHECK chk_supply_location_placement"
        )
        print("  ✓ Dropped chk_supply_location_placement")

    cur.execute(
        """
        ALTER TABLE supplies_location
        ADD CONSTRAINT chk_supply_location_placement
        CHECK (
            (location_name IS NOT NULL AND coord_x IS NULL AND coord_y IS NULL)
            OR
            (location_name IS NULL AND coord_x IS NOT NULL AND coord_y IS NOT NULL AND amount = 1)
        )
        """
    )
    print("  ✓ Added CHECK (free rows must have amount = 1)")

    cur.execute(
        """
        ALTER TABLE supplies_location
        ADD COLUMN free_coord_uid VARCHAR(160)
            GENERATED ALWAYS AS (
                CASE
                    WHEN location_name IS NULL
                         AND coord_x IS NOT NULL
                         AND coord_y IS NOT NULL
                    THEN CONCAT('F', supply_id, ':', coord_x, ':', coord_y)
                    ELSE NULL
                END
            ) STORED,
        ADD UNIQUE KEY uniq_free_coord_uid (free_coord_uid)
        """
    )
    print("  ✓ Added free_coord_uid + UNIQUE uniq_free_coord_uid")

    conn.commit()
    cur.close()
    conn.close()
    print("✅ migrate_free_coord_one_per complete")


if __name__ == "__main__":
    try:
        migrate_free_coord_one_per()
    except mysql.connector.Error as e:
        print(f"❌ migrate_free_coord_one_per: {e}")
        raise
