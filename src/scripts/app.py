"""
Database initialization script.

This script initializes the database schema (idempotent - safe to run multiple times).
It only creates tables if they don't already exist, making it safe for production use.

Note: Seed data and database reset functionality are handled by separate scripts.

Usage:
    python src/scripts/app.py

Environment variables:
    DATABASE_URL: MySQL connection string (default: mysql://mysqluser:mysqlpassword@db:3306/mydb)
"""
import os
import sys
import mysql.connector
from helpers import (
    get_sql_base_path,
    discover_table_files,
    topological_sort_tables,
    table_exists,
    execute_sql_file,
    parse_database_url
)

DATABASE_URL = os.getenv("DATABASE_URL", "mysql://mysqluser:mysqlpassword@db:3306/mydb")

# Base path for SQL files (works in Docker and locally)
SQL_BASE_PATH = get_sql_base_path(__file__)


def initialize_schema(cur):
    """Initialize database schema in correct dependency order."""
    print("\n📋 Discovering table files...")
    
    # Discover all table_*.sql files recursively
    table_files = discover_table_files(SQL_BASE_PATH)
    
    if not table_files:
        print(f"⚠ No table_*.sql files found in {SQL_BASE_PATH}")
        return False
    
    print(f"✓ Found {len(table_files)} table file(s)")
    
    # Sort tables by dependency order
    print("📊 Analyzing dependencies...")
    sorted_tables = topological_sort_tables(table_files)
    
    print("\n📋 Initializing database schema...")
    
    success_count = 0
    for table_name, sql_file in sorted_tables:
        description = f"{table_name} table"
        # Check if table already exists (for idempotency)
        if table_exists(cur, table_name):
            print(f"⊘ {description} already exists, skipping")
            continue
        
        if execute_sql_file(cur, sql_file, description):
            success_count += 1
    
    print(f"\n✓ Schema initialization complete ({success_count}/{len(sorted_tables)} tables created)")
    return success_count > 0


def main():
    """Main initialization function."""
    try:
        print("🔌 Connecting to database...")
        db_params = parse_database_url(DATABASE_URL)
        conn = mysql.connector.connect(**db_params)
        cur = conn.cursor()
        
        # Verify connection
        cur.execute("SELECT VERSION();")
        version = cur.fetchone()[0]
        print(f"✓ Connected to MySQL: {version}")
        
        # Initialize schema
        initialize_schema(cur)
        conn.commit()
        
        print("\n✅ Database initialization complete!")
        
        cur.close()
        conn.close()
        
    except mysql.connector.Error as e:
        print(f"✗ Database connection failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

