"""SQL for locations (map boxes)."""
from typing import List, Optional, Tuple


_SELECT_COLS = "name, x, y, width, height, type, shelf_count, protected"


def list_all_tuple_ordered(cur) -> List[Tuple]:
    cur.execute(f"SELECT {_SELECT_COLS} FROM locations ORDER BY name")
    return cur.fetchall()


def fetch_by_name_tuple(cur, name: str) -> Optional[Tuple]:
    cur.execute(
        f"SELECT {_SELECT_COLS} FROM locations WHERE name = %s",
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


def max_used_shelf(cur, name: str) -> Optional[int]:
    """
    Return the highest `shelf` value currently in use for placements at this location,
    or None if no placements exist with a non-NULL shelf.
    Used to validate shelf_count reductions.
    """
    cur.execute(
        "SELECT MAX(shelf) FROM supplies_location WHERE location_name = %s AND shelf IS NOT NULL",
        (name,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return row[0] if row[0] is not None else None


def count_orphans_if_shelf_count(cur, name: str, new_shelf_count: int) -> int:
    """
    Count how many supplies_location rows would become orphaned if the location's
    shelf_count were set to `new_shelf_count`.

    - If new_shelf_count == 0, every row with shelf IS NOT NULL is an orphan.
    - Otherwise, rows with shelf >= new_shelf_count are orphans.
    """
    if new_shelf_count <= 0:
        cur.execute(
            "SELECT COUNT(*) FROM supplies_location WHERE location_name = %s AND shelf IS NOT NULL",
            (name,),
        )
    else:
        cur.execute(
            "SELECT COUNT(*) FROM supplies_location WHERE location_name = %s AND shelf >= %s",
            (name, new_shelf_count),
        )
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 0
