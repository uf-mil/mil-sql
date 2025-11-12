"""
Shared helper functions for database schema management.

This module contains common utilities used by app.py and test_tables.py
for discovering, parsing, and managing database tables.
"""
from pathlib import Path
import re
from urllib.parse import urlparse
from collections import defaultdict, deque


def get_sql_base_path(script_file):
    """
    Get the SQL base path, works in both Docker and local environments.
    
    Args:
        script_file: The __file__ from the calling script
        
    Returns:
        Path object pointing to the SQL directory
    """
    if Path("/app/src/sql").exists():
        return Path("/app/src/sql")  # Docker path
    else:
        # Local development path (relative to script location)
        return Path(script_file).parent.parent / "sql"


def discover_table_files(sql_base_path):
    """
    Recursively discover all table_*.sql files in the SQL directory.
    Returns a list of (table_name, file_path) tuples.
    """
    table_files = []
    if not sql_base_path.exists():
        return table_files
    
    # Recursively find all table_*.sql files
    for sql_file in sql_base_path.rglob("table_*.sql"):
        # Extract table name from filename: table_<name>.sql -> <name>
        match = re.match(r"table_(.+)\.sql$", sql_file.name, re.IGNORECASE)
        if match:
            table_name = match.group(1)
            table_files.append((table_name, sql_file))
    
    return table_files


def extract_table_dependencies(sql_content, table_name):
    """
    Extract foreign key dependencies from SQL content.
    Returns a set of table names that this table depends on.
    """
    dependencies = set()
    # Look for REFERENCES table_name patterns (case insensitive)
    # Matches: REFERENCES table_name, REFERENCES `table_name`, REFERENCES schema.table_name
    pattern = r'REFERENCES\s+(?:`?(\w+)`?\.)?`?(\w+)`?'
    matches = re.finditer(pattern, sql_content, re.IGNORECASE)
    for match in matches:
        ref_table = match.group(2)
        if ref_table and ref_table.lower() != table_name.lower():
            dependencies.add(ref_table.lower())
    return dependencies


def topological_sort_tables(table_files):
    """
    Sort tables in dependency order using topological sort.
    Tables with no dependencies come first.
    """
    # Build dependency graph
    table_names = [name for name, _ in table_files]
    dependencies = {}
    table_file_map = {}
    
    for table_name, sql_file in table_files:
        table_file_map[table_name.lower()] = (table_name, sql_file)
        sql_content = sql_file.read_text()
        deps = extract_table_dependencies(sql_content, table_name)
        dependencies[table_name.lower()] = deps
    
    # Topological sort
    in_degree = defaultdict(int)
    graph = defaultdict(list)
    
    for table in table_names:
        table_lower = table.lower()
        in_degree[table_lower] = 0
    
    for table in table_names:
        table_lower = table.lower()
        for dep in dependencies[table_lower]:
            if dep in [t.lower() for t in table_names]:
                graph[dep].append(table_lower)
                in_degree[table_lower] += 1
    
    # Kahn's algorithm
    queue = deque([t for t in [tn.lower() for tn in table_names] if in_degree[t] == 0])
    sorted_tables = []
    
    while queue:
        current = queue.popleft()
        if current in table_file_map:
            sorted_tables.append(table_file_map[current])
        for neighbor in graph[current]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    
    # Add any remaining tables (shouldn't happen if no cycles, but handle gracefully)
    for table_name, sql_file in table_files:
        table_lower = table_name.lower()
        if (table_name, sql_file) not in sorted_tables:
            sorted_tables.append((table_name, sql_file))
    
    return sorted_tables


def parse_database_url(url):
    """Parse MySQL connection URL and return connection parameters."""
    parsed = urlparse(url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 3306,
        'user': parsed.username,
        'password': parsed.password,
        'database': parsed.path.lstrip('/')
    }


def table_exists(cur, table_name, database_name=None):
    """
    Check if a table exists in the database.
    
    Args:
        cur: Database cursor
        table_name: Name of the table to check
        database_name: Optional database name (if None, uses current database)
    """
    if database_name:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s AND table_name = %s",
            (database_name, table_name)
        )
    else:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s",
            (table_name,)
        )
    return cur.fetchone()[0] > 0


def get_table_columns(cur, table_name, database_name=None):
    """
    Get column information for a table.
    
    Args:
        cur: Database cursor
        table_name: Name of the table
        database_name: Optional database name (if None, uses current database)
        
    Returns:
        List of tuples with column information
    """
    if database_name:
        cur.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.columns WHERE table_schema = %s AND table_name = %s ORDER BY ORDINAL_POSITION",
            (database_name, table_name)
        )
    else:
        cur.execute(
            "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = %s ORDER BY ORDINAL_POSITION",
            (table_name,)
        )
    return cur.fetchall()


def execute_sql_file(cur, sql_file_path, description):
    """Execute a SQL file and handle errors gracefully."""
    try:
        sql_content = sql_file_path.read_text()
        # Split by semicolons to handle multiple statements
        statements = [s.strip() for s in sql_content.split(';') if s.strip()]
        for statement in statements:
            if statement:
                cur.execute(statement)
        print(f"✓ {description} succeeded")
        return True
    except Exception as e:
        print(f"✗ {description} failed: {e}")
        return False

