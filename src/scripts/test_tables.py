"""
Test script to validate table creation in a test database.

This script creates a separate test database, initializes all tables,
and verifies they were created correctly. It does not affect the production database.

Usage:
    python src/scripts/test_tables.py

Environment variables:
    DATABASE_URL: MySQL connection string (default: mysql://mysqluser:mysqlpassword@db:3306/mydb)
                  The test will use a database named '{database_name}_test'
"""
import os
import sys
import mysql.connector
from helpers import (
    get_sql_base_path,
    discover_table_files,
    topological_sort_tables,
    table_exists,
    get_table_columns,
    execute_sql_file,
    parse_database_url
)

# Get base database URL, test will use a separate database
BASE_DATABASE_URL = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")

# Base path for SQL files (works in Docker and locally)
SQL_BASE_PATH = get_sql_base_path(__file__)


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


def verify_tables(cur, database_name):
    """Verify that all expected tables exist and have valid structure."""
    print("\n🔍 Verifying table structure...")
    
    # Discover all table files to get expected table names
    table_files = discover_table_files(SQL_BASE_PATH)
    expected_tables = [name for name, _ in table_files]
    
    if not expected_tables:
        print("⚠ No tables found to verify")
        return False
    
    all_valid = True
    for table_name in expected_tables:
        if table_exists(cur, table_name, database_name):
            columns = get_table_columns(cur, table_name, database_name)
            print(f"✓ {table_name}: {len(columns)} columns")
            if len(columns) == 0:
                print(f"  ⚠ Warning: {table_name} has no columns")
                all_valid = False
        else:
            print(f"✗ {table_name}: NOT FOUND")
            all_valid = False
    
    return all_valid


def main():
    """Main test function."""
    try:
        # Parse base database URL
        base_params = parse_database_url(BASE_DATABASE_URL)
        test_db_name = f"{base_params['database']}_test"
        
        print(f"🧪 Starting table validation test...")
        print(f"📊 Test database: {test_db_name}")
        print(f"🔌 Connecting to MySQL server...")
        
        # Use root credentials to create database (mysqluser may not have CREATE permission)
        # Try to get root password from environment or use default
        root_password = os.getenv("MYSQL_ROOT_PASSWORD", "rootpassword")
        
        # Connect as root to create database
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
        
        # Create test database if it doesn't exist
        print(f"\n📦 Creating test database '{test_db_name}'...")
        root_cur.execute(f"CREATE DATABASE IF NOT EXISTS `{test_db_name}`")
        
        # Grant permissions to mysqluser on the test database
        # Use string formatting for GRANT since it's DDL, not DML
        username = base_params['user']
        root_cur.execute(f"GRANT ALL PRIVILEGES ON `{test_db_name}`.* TO '{username}'@'%'")
        root_cur.execute("FLUSH PRIVILEGES")
        root_conn.commit()
        print(f"✓ Test database created and permissions granted")
        
        root_cur.close()
        root_conn.close()
        
        # Small delay to ensure privileges are propagated
        import time
        time.sleep(0.5)
        
        # Now connect as mysqluser for table operations
        print(f"🔌 Connecting as '{base_params['user']}' to test database...")
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
            print(f"✓ Connected successfully")
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
                time.sleep(0.5)
                # Retry connection
                conn = mysql.connector.connect(**conn_params)
                cur = conn.cursor()
                print(f"✓ Connected successfully after creating user")
            else:
                raise
        
        # Drop all existing tables from test database for a clean start
        drop_all_tables(cur, test_db_name)
        conn.commit()
        
        # Initialize schema in test database
        created_count, total_count = initialize_schema(cur, test_db_name)
        conn.commit()
        
        # Verify tables
        all_valid = verify_tables(cur, test_db_name)
        
        # Summary
        print("\n" + "="*50)
        if all_valid and created_count == total_count:
            print("✅ TEST PASSED: All tables created and verified successfully!")
            print(f"   Created {created_count}/{total_count} tables")
            print(f"   Test database '{test_db_name}' is ready for inspection")
            print(f"   (Database will be kept for manual inspection)")
        elif all_valid:
            print("⚠️  TEST PARTIAL: All tables exist but some were skipped")
            print(f"   Created {created_count}/{total_count} tables")
        else:
            print("❌ TEST FAILED: Some tables are missing or invalid")
            sys.exit(1)
        print("="*50)
        
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
    main()

