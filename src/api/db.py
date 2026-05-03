"""
Database connection pool for the API.
"""
import mysql.connector
from mysql.connector import pooling
import os
import time

# Database configuration from environment variables
config = {
    'host': os.getenv('DB_HOST', 'db'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'mysqluser'),
    'password': os.getenv('DB_PASSWORD', 'mysqlpassword'),
    'database': os.getenv('DB_NAME', 'mydb'),
    'pool_name': 'mil_sql_pool',
    'pool_size': int(os.getenv('DB_POOL_SIZE', 10)),  # Increased default to 10, configurable via env
    'pool_reset_session': True
}

# Create connection pool with retry logic
connection_pool = None
max_retries = 10
retry_delay = 2  # seconds

for attempt in range(max_retries):
    try:
        connection_pool = pooling.MySQLConnectionPool(**config)
        print(f"✓ Database connection pool initialized successfully")
        break
    except Exception as e:
        if attempt < max_retries - 1:
            print(f"⚠ Database connection attempt {attempt + 1}/{max_retries} failed: {e}")
            print(f"  Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
        else:
            print(f"❌ Error creating connection pool after {max_retries} attempts: {e}")
            connection_pool = None


def get_db():
    """
    Get a database connection from the pool.
    
    Returns:
        mysql.connector.connection.MySQLConnection: Database connection
        
    Raises:
        Exception: If connection pool is not initialized
    """
    if connection_pool is None:
        raise Exception("Database connection pool not initialized")
    return connection_pool.get_connection()

