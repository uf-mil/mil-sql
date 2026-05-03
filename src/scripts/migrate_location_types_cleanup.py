"""
One-time cleanup: remove external type, fix unknown, set system SVG locations to special.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url


def migrate_location_types_cleanup():
    try:
        database_url = os.getenv(
            "DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb"
        )
        db_params = parse_database_url(database_url)

        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_NAME = 'locations'")
        if cur.fetchone()[0] == 0:
            cur.close()
            conn.close()
            return

        print("🔄 Migrating location types (external → other, unknown → other, SVG names → special)...")

        cur.execute("UPDATE locations SET type = %s WHERE type = %s", ("other", "external"))
        ext_n = cur.rowcount
        cur.execute("UPDATE locations SET type = %s WHERE type = %s", ("other", "unknown"))
        unk_n = cur.rowcount

        names = ("To Be Delivered", "Lost Items", "Unsorted Items")
        placeholders = ",".join(["%s"] * len(names))
        cur.execute(
            f"UPDATE locations SET type = %s WHERE name IN ({placeholders})",
            ("special",) + names,
        )
        spec_n = cur.rowcount

        conn.commit()
        cur.close()
        conn.close()
        print(f"✓ Location types cleanup: external→other rows={ext_n}, unknown→other rows={unk_n}, SVG names→special rows={spec_n}")
    except Exception as e:
        print(f"⚠ Warning: location types cleanup migration: {e}")
