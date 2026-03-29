"""SQL for supplies_location_history listing and undo/discard/batch."""
from typing import Any, List, Optional


def fetch_history_page(
    cur,
    supply_id: Optional[int],
    supply_name: Optional[str],
    location_name: Optional[str],
    limit: int,
    offset: int,
) -> List[dict]:
    query = """
            SELECT
                slh.id,
                slh.supply_id,
                slh.supply_name,
                slh.location_name,
                slh.shelf,
                slh.action_type,
                slh.old_amount,
                slh.new_amount,
                slh.related_location,
                slh.related_shelf,
                slh.batch_id,
                slh.undone,
                slh.undone_at,
                slh.undone_by,
                slh.changed_by,
                slh.changed_at,
                m.first_name,
                m.last_name
            FROM supplies_location_history slh
            LEFT JOIN members m ON slh.changed_by = m.uf_id
            WHERE 1=1
        """
    params: List[Any] = []
    if supply_id is not None:
        query += " AND slh.supply_id = %s"
        params.append(supply_id)
    if supply_name:
        query += " AND slh.supply_name LIKE %s"
        params.append(f"%{supply_name}%")
    if location_name:
        query += " AND slh.location_name = %s"
        params.append(location_name)
    query += " ORDER BY slh.changed_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur.execute(query, params)
    return cur.fetchall()


def fetch_history_entry_for_undo_dict(cur, history_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, supply_id, supply_name, location_name, shelf,
                   action_type, old_amount, new_amount,
                   related_location, related_shelf, batch_id, undone, changed_at
            FROM supplies_location_history
            WHERE id = %s
        """,
        (history_id,),
    )
    return cur.fetchone()


def supply_exists_tuple(cur, supply_id: int) -> bool:
    cur.execute("SELECT id FROM supplies WHERE id = %s", (supply_id,))
    return cur.fetchone() is not None


def select_location_entry_tuple(cur, supply_id, location_name, shelf) -> Optional[tuple]:
    cur.execute(
        """
            SELECT id, amount FROM supplies_location
            WHERE supply_id = %s AND location_name = %s
              AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """,
        (supply_id, location_name, shelf, shelf),
    )
    return cur.fetchone()


def delete_supplies_location_by_id(cur, row_id: int) -> None:
    cur.execute("DELETE FROM supplies_location WHERE id = %s", (row_id,))


def update_supplies_location_amount_tuple(cur, new_amount: int, user_id: str, row_id: int) -> None:
    cur.execute(
        """
            UPDATE supplies_location
            SET amount = %s, last_modified_by = %s
            WHERE id = %s
        """,
        (new_amount, user_id, row_id),
    )


def insert_supplies_location_box_tuple(
    cur, supply_id, location_name, shelf, amount, user_id: str
) -> None:
    cur.execute(
        """
            INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
            VALUES (%s, %s, %s, %s, %s)
        """,
        (supply_id, location_name, shelf, amount, user_id),
    )


def update_amount_by_supply_location_shelf_tuple(
    cur, new_amount: int, user_id: str, supply_id, location_name, shelf
) -> None:
    cur.execute(
        """
            UPDATE supplies_location
            SET amount = %s, last_modified_by = %s
            WHERE supply_id = %s AND location_name = %s
              AND (shelf = %s OR (shelf IS NULL AND %s IS NULL))
        """,
        (new_amount, user_id, supply_id, location_name, shelf, shelf),
    )


def fetch_paired_move_row_dict(cur, batch_id, exclude_history_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, location_name, shelf, old_amount, new_amount
            FROM supplies_location_history
            WHERE batch_id = %s AND id != %s
        """,
        (batch_id, exclude_history_id),
    )
    return cur.fetchone()


def delete_history_by_id(cur, history_id: int) -> None:
    cur.execute("DELETE FROM supplies_location_history WHERE id = %s", (history_id,))


def fetch_history_meta_for_discard_dict(cur, history_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, action_type, batch_id, changed_at
            FROM supplies_location_history
            WHERE id = %s
        """,
        (history_id,),
    )
    return cur.fetchone()


def fetch_paired_id_tuple(cur, batch_id, exclude_history_id: int) -> Optional[tuple]:
    cur.execute(
        """
            SELECT id FROM supplies_location_history
            WHERE batch_id = %s AND id != %s
        """,
        (batch_id, exclude_history_id),
    )
    return cur.fetchone()


def fetch_batch_entries_ordered_dict(cur, batch_id: str) -> List[dict]:
    cur.execute(
        """
            SELECT id, supply_id, supply_name, location_name, shelf,
                   action_type, old_amount, new_amount,
                   related_location, related_shelf
            FROM supplies_location_history
            WHERE batch_id = %s
            ORDER BY id
        """,
        (batch_id,),
    )
    return cur.fetchall()
