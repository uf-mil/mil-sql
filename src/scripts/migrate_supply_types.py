"""
Migration: supply_types table and supplies.supply_type_id FK.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import mysql.connector
from helpers import parse_database_url


def check_table_exists(cur, table_name):
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
    """, (table_name,))
    return cur.fetchone()[0] > 0


def check_column_exists(cur, table_name, column_name):
    cur.execute("""
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = %s
        AND COLUMN_NAME = %s
    """, (table_name, column_name))
    return cur.fetchone()[0] > 0


def migrate_supply_types():
    try:
        database_url = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")
        db_params = parse_database_url(database_url)

        print("🔄 Migrating supply_types / supplies.supply_type_id...")

        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()

        if not check_table_exists(cur, 'supply_types'):
            cur.execute("""
                CREATE TABLE supply_types (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(200) NOT NULL,
                    template_description TEXT NULL,
                    item_name_prefix VARCHAR(200) NOT NULL DEFAULT '',
                    item_description_prefix TEXT NULL,
                    image LONGTEXT NULL,
                    default_custom_fields JSON NULL,
                    locked_custom_field_keys JSON NULL,
                    locked_category_ids JSON NULL,
                    locked_team_names JSON NULL,
                    is_unique TINYINT(1) NOT NULL DEFAULT 0,
                    prevent_user_edit TINYINT(1) NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_supply_types_name (name)
                )
            """)
            conn.commit()
            print("✓ Created supply_types table")
        else:
            print("✓ supply_types already exists")

        if not check_column_exists(cur, 'supplies', 'supply_type_id'):
            cur.execute("""
                ALTER TABLE supplies
                ADD COLUMN supply_type_id BIGINT NULL AFTER custom_fields,
                ADD CONSTRAINT fk_supplies_supply_type
                    FOREIGN KEY (supply_type_id) REFERENCES supply_types(id)
                    ON DELETE SET NULL ON UPDATE CASCADE
            """)
            conn.commit()
            print("✓ Added supplies.supply_type_id")
        else:
            print("✓ supplies.supply_type_id already exists")

        if check_table_exists(cur, 'supply_types') and not check_column_exists(
            cur, 'supply_types', 'prevent_user_edit'
        ):
            cur.execute("""
                ALTER TABLE supply_types
                ADD COLUMN prevent_user_edit TINYINT(1) NOT NULL DEFAULT 0
                AFTER is_unique
            """)
            conn.commit()
            print("✓ Added supply_types.prevent_user_edit")
        elif check_table_exists(cur, 'supply_types'):
            print("✓ supply_types.prevent_user_edit already exists")

        if check_table_exists(cur, 'supply_types') and not check_column_exists(
            cur, 'supply_types', 'locked_category_ids'
        ):
            cur.execute(
                "ALTER TABLE supply_types ADD COLUMN locked_category_ids JSON NULL AFTER locked_custom_field_keys"
            )
            conn.commit()
            print("✓ Added supply_types.locked_category_ids")
        elif check_table_exists(cur, 'supply_types'):
            print("✓ supply_types.locked_category_ids already exists")

        if check_table_exists(cur, 'supply_types') and not check_column_exists(
            cur, 'supply_types', 'locked_team_names'
        ):
            cur.execute(
                "ALTER TABLE supply_types ADD COLUMN locked_team_names JSON NULL AFTER locked_category_ids"
            )
            conn.commit()
            print("✓ Added supply_types.locked_team_names")
        elif check_table_exists(cur, 'supply_types'):
            print("✓ supply_types.locked_team_names already exists")

        cur.close()
        conn.close()

    except mysql.connector.Error as e:
        print(f"⚠ supply_types migration warning: {e}")
    except Exception as e:
        print(f"⚠ supply_types migration warning: {e}")


if __name__ == "__main__":
    migrate_supply_types()
