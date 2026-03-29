"""SQL for locations (map boxes)."""
from typing import List, Optional, Tuple


def list_all_tuple_ordered(cur) -> List[Tuple]:
    cur.execute(
        "SELECT name, x, y, width, height, type, protected FROM locations ORDER BY name"
    )
    return cur.fetchall()


def fetch_by_name_tuple(cur, name: str) -> Optional[Tuple]:
    cur.execute(
        "SELECT name, x, y, width, height, type, protected FROM locations WHERE name = %s",
        (name,),
    )
    return cur.fetchone()


def insert_location(
    cur, name: str, x, y, width, height, location_type: str, shelf_count: int, protected: bool
) -> None:
    cur.execute(
        """
            INSERT INTO locations (name, x, y, width, height, type, shelf_count, protected)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (name, x, y, width, height, location_type, shelf_count, protected),
    )


def name_exists(cur, name: str) -> bool:
    cur.execute("SELECT name FROM locations WHERE name = %s", (name,))
    return cur.fetchone() is not None


def update_by_name(cur, set_clauses: List[str], values: List) -> None:
    """set_clauses e.g. ['x = %s']; values are bind params ending with the current name for WHERE name = %s."""
    query = f"UPDATE locations SET {', '.join(set_clauses)} WHERE name = %s"
    cur.execute(query, tuple(values))


def rename(cur, new_name: str, old_name: str) -> None:
    cur.execute("UPDATE locations SET name = %s WHERE name = %s", (new_name, old_name))


def delete_by_name(cur, name: str) -> None:
    cur.execute("DELETE FROM locations WHERE name = %s", (name,))
