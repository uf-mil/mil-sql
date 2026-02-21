"""
Database connection pool for the API.
"""
import mysql.connector
from mysql.connector import pooling
import os

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

# Create connection pool
try:
    connection_pool = pooling.MySQLConnectionPool(**config)
except Exception as e:
    print(f"Error creating connection pool: {e}")
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

