"""
Add supplies.public_id (UUID per row), unique index, and drop legacy UNIQUE on name.
Idempotent: safe to run on every API startup.

Requires MySQL 8+ for UUID() in UPDATE (per-row values).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url


def _db_params():
    url = os.getenv("DATABASE_URL")
    if url:
        return parse_database_url(url)
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", 3306)),
        "user": os.getenv("DB_USER", "mysqluser"),
        "password": os.getenv("DB_PASSWORD", "mysqlpassword"),
        "database": os.getenv("DB_NAME", "mydb"),
    }


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


def index_named_exists(cur, table_name, index_name):
    cur.execute(
        """
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND INDEX_NAME = %s
        """,
        (table_name, index_name),
    )
    return cur.fetchone()[0] > 0


def unique_single_column_indexes(cur, table_name):
    """Return (index_name,) for unique indexes that are exactly one column."""
    cur.execute(
        """
        SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
        """,
        (table_name,),
    )
    out = []
    for row in cur.fetchall():
        idx = row[0]
        cols = row[1]
        if idx == "PRIMARY":
            continue
        if cols and "," not in cols:
            out.append((idx, cols))
    return out


def migrate_supplies_public_id():
    print("Migrating supplies.public_id (duplicate names allowed)...")
    params = _db_params()
    conn = mysql.connector.connect(**params)
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT COUNT(*) FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplies'
            """
        )
        if cur.fetchone()[0] == 0:
            print("  (no supplies table - skip)")
            return

        if not check_column_exists(cur, "supplies", "public_id"):
            cur.execute("ALTER TABLE supplies ADD COLUMN public_id CHAR(36) NULL")
            conn.commit()
            print("  ✓ Added supplies.public_id")

        cur.execute(
            "UPDATE supplies SET public_id = UUID() WHERE public_id IS NULL OR public_id = ''"
        )
        n_backfill = cur.rowcount
        conn.commit()
        if n_backfill:
            print(f"  OK Backfilled public_id on {n_backfill} row(s)")

        cur.execute("ALTER TABLE supplies MODIFY COLUMN public_id CHAR(36) NOT NULL")
        conn.commit()
        print("  OK supplies.public_id NOT NULL")

        if not index_named_exists(cur, "supplies", "uq_supplies_public_id"):
            cur.execute(
                "ALTER TABLE supplies ADD UNIQUE INDEX uq_supplies_public_id (public_id)"
            )
            conn.commit()
            print("  OK Added UNIQUE uq_supplies_public_id")

        for idx_name, col in unique_single_column_indexes(cur, "supplies"):
            if col == "name":
                try:
                    cur.execute(f"ALTER TABLE supplies DROP INDEX `{idx_name}`")
                    conn.commit()
                    print(f"  OK Dropped legacy unique index on name ({idx_name})")
                except mysql.connector.Error as e:
                    print(f"  WARN Could not DROP INDEX {idx_name}: {e}")

        print("DONE migrate_supplies_public_id complete")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    try:
        migrate_supplies_public_id()
    except mysql.connector.Error as e:
        print(f"ERROR migrate_supplies_public_id: {e}")
        sys.exit(1)
