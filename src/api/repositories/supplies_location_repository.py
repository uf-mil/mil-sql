"""SQL for supplies_location and related supply name/timestamp touches."""
from typing import Any, List, Optional, Sequence, Tuple


def fetch_joined_filtered(
    cur, location_filter: Optional[str], supply_id_filter: Optional[int]
) -> List[Tuple]:
    query = """
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   sl.last_modified, sl.last_modified_by, sl.created_at,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE 1=1
        """
    params: List[Any] = []
    if location_filter:
        query += " AND sl.location_name = %s"
        params.append(location_filter)
    if supply_id_filter is not None:
        query += " AND sl.supply_id = %s"
        params.append(int(supply_id_filter))
    query += " ORDER BY COALESCE(sl.location_name, ''), sl.shelf, s.name"
    cur.execute(query, params)
    return cur.fetchall()


def fetch_by_id_tuple(cur, location_id: int) -> Optional[Tuple]:
    cur.execute(
        """
            SELECT id, supply_id, location_name, coord_x, coord_y, shelf, amount,
                   last_modified, last_modified_by, created_at
            FROM supplies_location
            WHERE id = %s
        """,
        (location_id,),
    )
    return cur.fetchone()


def fetch_by_location_name_joined(cur, name: str) -> List[Tuple]:
    cur.execute(
        """
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   sl.last_modified, sl.last_modified_by, sl.created_at,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.location_name = %s
            ORDER BY sl.shelf, s.name
        """,
        (name,),
    )
    return cur.fetchall()


def fetch_supply_id_name_dict(cur, supply_id: int) -> Optional[dict]:
    cur.execute("SELECT id, name FROM supplies WHERE id = %s", (supply_id,))
    return cur.fetchone()


def fetch_supply_name_only_dict(cur, supply_id: int) -> Optional[dict]:
    cur.execute("SELECT name FROM supplies WHERE id = %s", (supply_id,))
    return cur.fetchone()


def select_free_coord_row(cur, supply_id: int, cx: int, cy: int) -> Optional[Tuple]:
    cur.execute(
        """
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name IS NULL
              AND coord_x = %s AND coord_y = %s
        """,
        (supply_id, cx, cy),
    )
    return cur.fetchone()


def update_free_coord_amount_and_user(cur, location_id: int, user_id: str) -> None:
    cur.execute(
        """
            UPDATE supplies_location
            SET amount = 1, last_modified_by = %s
            WHERE id = %s
        """,
        (user_id, location_id),
    )


def touch_supply_last_modified(cur, supply_id: int, user_id: str) -> None:
    cur.execute(
        """
            UPDATE supplies
            SET last_modified = CURRENT_TIMESTAMP, last_modified_by = %s
            WHERE id = %s
        """,
        (user_id, supply_id),
    )


def insert_free_coordinate_row(cur, supply_id: int, cx: int, cy: int, user_id: str) -> int:
    cur.execute(
        """
            INSERT INTO supplies_location
            (supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified_by)
            VALUES (%s, NULL, %s, %s, NULL, 1, %s)
        """,
        (supply_id, cx, cy, user_id),
    )
    return cur.lastrowid


def select_box_row(cur, supply_id: int, location_name: str, shelf) -> Optional[Tuple]:
    cur.execute(
        """
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """,
        (supply_id, location_name, shelf, shelf),
    )
    return cur.fetchone()


def update_location_amount(cur, new_amount: int, user_id: str, location_id: int) -> None:
    cur.execute(
        """
            UPDATE supplies_location
            SET amount = %s, last_modified_by = %s
            WHERE id = %s
        """,
        (new_amount, user_id, location_id),
    )


def insert_box_row(cur, supply_id: int, location_name: str, shelf, amount: int, user_id: str) -> int:
    cur.execute(
        """
            INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
            VALUES (%s, %s, %s, %s, %s)
        """,
        (supply_id, location_name, shelf, amount, user_id),
    )
    return cur.lastrowid


def fetch_location_for_update_join_dict(cur, location_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.id = %s
        """,
        (location_id,),
    )
    return cur.fetchone()


def select_free_coord_conflict(
    cur, supply_id: int, cx: int, cy: int, exclude_location_id: int
) -> Optional[Tuple]:
    cur.execute(
        """
            SELECT id FROM supplies_location
            WHERE supply_id = %s AND location_name IS NULL
              AND coord_x = %s AND coord_y = %s AND id <> %s
            LIMIT 1
        """,
        (supply_id, cx, cy, exclude_location_id),
    )
    return cur.fetchone()


def update_supplies_location_dynamic(cur, set_clauses: Sequence[str], values: List[Any]) -> None:
    """values end with location_id for WHERE id = %s."""
    query = f"UPDATE supplies_location SET {', '.join(set_clauses)} WHERE id = %s"
    cur.execute(query, tuple(values))


def fetch_location_row_tuple(cur, location_id: int) -> Optional[Tuple]:
    cur.execute(
        """
            SELECT id, supply_id, location_name, coord_x, coord_y, shelf, amount,
                   last_modified, last_modified_by, created_at
            FROM supplies_location WHERE id = %s
        """,
        (location_id,),
    )
    return cur.fetchone()


def fetch_location_with_join_for_delete_dict(cur, location_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT sl.id, sl.supply_id, sl.location_name, sl.coord_x, sl.coord_y, sl.shelf, sl.amount,
                   s.name as supply_name
            FROM supplies_location sl
            JOIN supplies s ON sl.supply_id = s.id
            WHERE sl.id = %s
        """,
        (location_id,),
    )
    return cur.fetchone()


def delete_by_id(cur, location_id: int) -> None:
    cur.execute("DELETE FROM supplies_location WHERE id = %s", (location_id,))


def select_box_row_dict(cur, supply_id: int, location_name: str, shelf) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name = %s AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """,
        (supply_id, location_name, shelf, shelf),
    )
    return cur.fetchone()
