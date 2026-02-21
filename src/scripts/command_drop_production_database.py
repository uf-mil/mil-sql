"""
Command script to drop the production database.

⚠️  WARNING: This will permanently delete all data in the production database!
This action cannot be undone.

Usage:
    python src/scripts/command_drop_production_database.py
"""
import os
import sys
import mysql.connector
from helpers import parse_database_url

# Get database URL
DATABASE_URL = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")


def drop_production_database():
    """Drop the production database."""
    try:
        # Parse database URL
        db_params = parse_database_url(DATABASE_URL)
        database_name = db_params['database']
        
        print("⚠️  WARNING: You are about to drop the production database!")
        print(f"   Database: {database_name}")
        print(f"   Host: {db_params['host']}:{db_params['port']}")
        print()
        
        # Get root password for database operations
        root_password = os.getenv("MYSQL_ROOT_PASSWORD", "rootpassword")
        
        # Connect as root to drop database
        root_conn_params = {
            'host': db_params['host'],
            'port': db_params['port'],
            'user': 'root',
            'password': root_password
        }
        
        print("🔌 Connecting to MySQL server as root...")
        root_conn = mysql.connector.connect(**root_conn_params)
        root_cur = root_conn.cursor()
        
        # Verify connection
        root_cur.execute("SELECT VERSION();")
        version = root_cur.fetchone()[0]
        print(f"✓ Connected to MySQL: {version}")
        
        # Check if database exists
        root_cur.execute(
            "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
            (database_name,)
        )
        db_exists = root_cur.fetchone() is not None
        
        if not db_exists:
            print(f"\n⚠️  Database '{database_name}' does not exist. Nothing to drop.")
            root_cur.close()
            root_conn.close()
            return
        
        # Get list of tables before dropping
        root_cur.execute(f"USE `{database_name}`")
        root_cur.execute("SHOW TABLES")
        tables = root_cur.fetchall()
        table_count = len(tables)
        
        print(f"\n📊 Database '{database_name}' contains {table_count} table(s):")
        if tables:
            for table in tables[:10]:  # Show first 10
                print(f"   - {table[0]}")
            if table_count > 10:
                print(f"   ... and {table_count - 10} more")
        
        print(f"\n🗑️  Dropping database '{database_name}'...")
        root_cur.execute(f"DROP DATABASE IF EXISTS `{database_name}`")
        root_conn.commit()
        
        print(f"✓ Database '{database_name}' has been dropped successfully!")
        print(f"   All {table_count} table(s) and all data have been permanently deleted.")
        
        root_cur.close()
        root_conn.close()
        
    except mysql.connector.Error as e:
        print(f"\n✗ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    drop_production_database()

