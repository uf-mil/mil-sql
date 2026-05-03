"""SQL access for supplies catalog, junction tables, and related history rows."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple


def _in_clause(ids: Sequence[int]) -> str:
    return ",".join(["%s"] * len(ids))


def list_supplies_aggregate_rows(cur) -> List[dict]:
    cur.execute(
        """
            SELECT
                s.id,
                s.public_id,
                s.name,
                s.description,
                s.image,
                s.custom_fields,
                s.supply_type_id,
                st.name AS type_name,
                st.image AS type_image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) AS totalQty
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            GROUP BY s.id, s.public_id, s.name, s.description, s.image, s.custom_fields, s.supply_type_id,
                     st.name, st.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
            ORDER BY s.name
        """
    )
    return cur.fetchall()


def fetch_locations_by_supply_ids(cur, supply_ids: List[int]) -> Dict[int, List[dict]]:
    if not supply_ids:
        return {}
    ph = _in_clause(supply_ids)
    cur.execute(
        f"""
            SELECT supply_id, id, location_name, coord_x, coord_y, shelf, amount
            FROM supplies_location
            WHERE supply_id IN ({ph})
            ORDER BY supply_id, COALESCE(location_name, ''), shelf
        """,
        tuple(supply_ids),
    )
    out: Dict[int, List[dict]] = {sid: [] for sid in supply_ids}
    for row in cur.fetchall():
        sid = row["supply_id"]
        if sid in out:
            out[sid].append(row)
    return out


def fetch_teams_by_supply_ids(cur, supply_ids: List[int]) -> Dict[int, List[str]]:
    if not supply_ids:
        return {}
    ph = _in_clause(supply_ids)
    cur.execute(
        f"""
            SELECT supply_id, team_name
            FROM supplies_teams
            WHERE supply_id IN ({ph})
            ORDER BY supply_id, team_name
        """,
        tuple(supply_ids),
    )
    out: Dict[int, List[str]] = {sid: [] for sid in supply_ids}
    for row in cur.fetchall():
        sid = row["supply_id"]
        if sid in out:
            out[sid].append(row["team_name"].lower())
    return out


def fetch_categories_by_supply_ids(cur, supply_ids: List[int]) -> Dict[int, List[int]]:
    if not supply_ids:
        return {}
    ph = _in_clause(supply_ids)
    cur.execute(
        f"""
            SELECT supply_id, category_id
            FROM supplies_categories
            WHERE supply_id IN ({ph})
            ORDER BY supply_id, category_id
        """,
        tuple(supply_ids),
    )
    out: Dict[int, List[int]] = {sid: [] for sid in supply_ids}
    for row in cur.fetchall():
        sid = row["supply_id"]
        if sid in out:
            out[sid].append(row["category_id"])
    return out


def fetch_members_by_uf_ids(cur, uf_ids: List[str]) -> Dict[str, dict]:
    if not uf_ids:
        return {}
    ph = _in_clause(uf_ids)  # uf_id may be string - use %s still works
    cur.execute(
        f"""
            SELECT uf_id, first_name, last_name, uf_email
            FROM members
            WHERE uf_id IN ({ph})
        """,
        tuple(uf_ids),
    )
    return {str(r["uf_id"]): r for r in cur.fetchall()}


def fetch_supply_detail_aggregate_row(cur, supply_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT
                s.id,
                s.public_id,
                s.name,
                s.description,
                s.image,
                s.custom_fields,
                s.supply_type_id,
                st.name AS type_name,
                st.image AS type_image,
                s.last_order_date,
                s.last_modified,
                s.last_modified_by,
                s.created_at,
                COALESCE(SUM(sl.amount), 0) AS totalQty
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            LEFT JOIN supplies_location sl ON s.id = sl.supply_id
            WHERE s.id = %s
            GROUP BY s.id, s.public_id, s.name, s.description, s.image, s.custom_fields, s.supply_type_id,
                     st.name, st.image, s.last_order_date, s.last_modified, s.last_modified_by, s.created_at
        """,
        (supply_id,),
    )
    return cur.fetchone()


def fetch_allowed_custom_field_names(cur) -> set:
    try:
        cur.execute("SELECT name FROM custom_field_definitions")
        return {r["name"] for r in cur.fetchall()}
    except Exception:
        return set()


def fetch_supply_type_row(cur, type_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, name, item_name_prefix, item_description_prefix, image,
                   default_custom_fields, locked_custom_field_keys,
                   locked_category_ids, locked_team_names, is_unique
            FROM supply_types WHERE id = %s
        """,
        (int(type_id),),
    )
    return cur.fetchone()


def select_supply_id_by_name(cur, name: str) -> Optional[int]:
    """First matching id when multiple supplies share a name (avoid for new code)."""
    cur.execute("SELECT id FROM supplies WHERE name = %s ORDER BY id LIMIT 1", (name,))
    row = cur.fetchone()
    if not row:
        return None
    return row["id"] if isinstance(row, dict) else row[0]


def select_supply_ids_by_name(cur, name: str) -> List[int]:
    cur.execute("SELECT id FROM supplies WHERE name = %s ORDER BY id", (name,))
    rows = cur.fetchall()
    out: List[int] = []
    for row in rows:
        out.append(row["id"] if isinstance(row, dict) else row[0])
    return out


def name_exists_excluding(cur, name: str, exclude_id: Optional[int]) -> bool:
    if exclude_id is None:
        cur.execute("SELECT id FROM supplies WHERE name = %s", (name,))
    else:
        cur.execute("SELECT id FROM supplies WHERE name = %s AND id != %s", (name, exclude_id))
    return cur.fetchone() is not None


def fetch_supply_id_type(cur, supply_id: int) -> Optional[dict]:
    cur.execute(
        "SELECT id, name, supply_type_id FROM supplies WHERE id = %s",
        (supply_id,),
    )
    return cur.fetchone()


def insert_supply(
    cur,
    public_id: str,
    name: str,
    description: Optional[str],
    image: Optional[str],
    custom_fields_json: Optional[str],
    last_order_date: Any,
    last_modified_by: str,
    supply_type_id: Optional[int],
) -> int:
    cur.execute(
        """
            INSERT INTO supplies (public_id, name, description, image, custom_fields, last_order_date, last_modified_by, supply_type_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (public_id, name, description, image, custom_fields_json, last_order_date, last_modified_by, supply_type_id),
    )
    return cur.lastrowid


def insert_supply_team_ignore(cur, supply_id: int, team_name: str) -> None:
    cur.execute(
        "INSERT IGNORE INTO supplies_teams (supply_id, team_name) VALUES (%s, %s)",
        (supply_id, team_name),
    )


def insert_supply_category_ignore(cur, supply_id: int, category_id: int) -> None:
    cur.execute(
        "INSERT IGNORE INTO supplies_categories (supply_id, category_id) VALUES (%s, %s)",
        (supply_id, category_id),
    )


def fetch_supply_with_type_join(cur, supply_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT s.id, s.public_id, s.name, s.description, s.image, s.custom_fields, s.last_order_date,
                   s.last_modified, s.last_modified_by, s.created_at,
                   s.supply_type_id, st.name AS type_name, st.image AS type_image
            FROM supplies s
            LEFT JOIN supply_types st ON s.supply_type_id = st.id
            WHERE s.id = %s
        """,
        (supply_id,),
    )
    return cur.fetchone()


def fetch_teams_for_supply_ordered(cur, supply_id: int) -> List[str]:
    cur.execute(
        "SELECT team_name FROM supplies_teams WHERE supply_id = %s ORDER BY team_name",
        (supply_id,),
    )
    return [r["team_name"].lower() for r in cur.fetchall()]


def fetch_categories_for_supply_ordered(cur, supply_id: int) -> List[int]:
    cur.execute(
        "SELECT category_id FROM supplies_categories WHERE supply_id = %s ORDER BY category_id",
        (supply_id,),
    )
    return [r["category_id"] for r in cur.fetchall()]


def update_supply_columns(cur, set_clauses: List[str], values: List[Any]) -> None:
    """set_clauses e.g. ['name = %s', 'description = %s']; values end with supply_id for WHERE id = %s."""
    if not set_clauses:
        return
    query = f"UPDATE supplies SET {', '.join(set_clauses)} WHERE id = %s"
    cur.execute(query, tuple(values))


def delete_teams_for_supply(cur, supply_id: int) -> None:
    cur.execute("DELETE FROM supplies_teams WHERE supply_id = %s", (supply_id,))


def insert_supply_team(cur, supply_id: int, team_name: str) -> None:
    cur.execute(
        "INSERT INTO supplies_teams (supply_id, team_name) VALUES (%s, %s)",
        (supply_id, team_name),
    )


def delete_categories_for_supply(cur, supply_id: int) -> None:
    cur.execute("DELETE FROM supplies_categories WHERE supply_id = %s", (supply_id,))


def insert_supply_category(cur, supply_id: int, category_id: int) -> None:
    cur.execute(
        "INSERT INTO supplies_categories (supply_id, category_id) VALUES (%s, %s)",
        (supply_id, category_id),
    )


def sum_location_qty(cur, supply_id: int) -> int:
    cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS totalQty FROM supplies_location WHERE supply_id = %s",
        (supply_id,),
    )
    row = cur.fetchone()
    return int(row["totalQty"]) if row else 0


def fetch_locations_ordered_for_supply(cur, supply_id: int) -> List[dict]:
    cur.execute(
        """
            SELECT id, location_name, coord_x, coord_y, shelf, amount
            FROM supplies_location
            WHERE supply_id = %s
            ORDER BY COALESCE(location_name, ''), shelf
        """,
        (supply_id,),
    )
    return cur.fetchall()


def fetch_supply_id_name(cur, supply_id: int) -> Optional[dict]:
    cur.execute("SELECT id, name FROM supplies WHERE id = %s", (supply_id,))
    return cur.fetchone()


def delete_supply_by_id(cur, supply_id: int) -> None:
    cur.execute("DELETE FROM supplies WHERE id = %s", (supply_id,))


def fetch_member_by_uf_id(cur, uf_id: str) -> Optional[dict]:
    cur.execute(
        "SELECT first_name, last_name, uf_email FROM members WHERE uf_id = %s",
        (uf_id,),
    )
    return cur.fetchone()


def fetch_supply_history_count_and_rows(
    cur,
    supply_id_filter: Optional[int],
    action_type_filter: Optional[str],
    limit: int,
    offset: int,
) -> Tuple[int, List[dict]]:
    query = """
            SELECT
                h.id,
                h.supply_id,
                h.action_type,
                h.old_name,
                h.new_name,
                h.old_description,
                h.new_description,
                h.old_image,
                h.new_image,
                h.old_last_order_date,
                h.new_last_order_date,
                h.changed_by,
                h.changed_at,
                COALESCE(s.name, h.old_name, h.new_name) AS supply_name
            FROM supplies_history h
            LEFT JOIN supplies s ON h.supply_id = s.id
            WHERE 1=1
        """
    params: List[Any] = []
    if supply_id_filter is not None:
        query += " AND h.supply_id = %s"
        params.append(supply_id_filter)
    if action_type_filter:
        query += " AND h.action_type = %s"
        params.append(action_type_filter)
    count_query = f"SELECT COUNT(*) AS total FROM ({query}) AS filtered"
    cur.execute(count_query, tuple(params))
    total = cur.fetchone()["total"]
    query += " ORDER BY h.changed_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    cur.execute(query, tuple(params))
    return total, cur.fetchall()


def fetch_history_teams(cur, history_id: int) -> List[dict]:
    cur.execute(
        """
            SELECT team_name, action
            FROM supplies_history_teams
            WHERE history_id = %s
        """,
        (history_id,),
    )
    return cur.fetchall()


def fetch_history_categories(cur, history_id: int) -> List[dict]:
    cur.execute(
        """
            SELECT category_id, action
            FROM supplies_history_categories
            WHERE history_id = %s
        """,
        (history_id,),
    )
    return cur.fetchall()


def fetch_history_row(cur, history_id: int) -> Optional[dict]:
    cur.execute("SELECT * FROM supplies_history WHERE id = %s", (history_id,))
    return cur.fetchone()


def fetch_history_id_and_changed_at(cur, history_id: int) -> Optional[dict]:
    cur.execute(
        "SELECT id, changed_at FROM supplies_history WHERE id = %s",
        (history_id,),
    )
    return cur.fetchone()


def supply_exists_by_id(cur, supply_id: int) -> bool:
    cur.execute("SELECT id FROM supplies WHERE id = %s", (supply_id,))
    return cur.fetchone() is not None


def delete_history_by_id(cur, history_id: int) -> None:
    cur.execute("DELETE FROM supplies_history WHERE id = %s", (history_id,))


def insert_supply_with_id(
    cur,
    supply_id: int,
    public_id: str,
    name: Any,
    description: Any,
    image: Any,
    last_order_date: Any,
    last_modified_by: str,
) -> None:
    cur.execute(
        """
            INSERT INTO supplies (id, public_id, name, description, image, last_order_date, last_modified_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (supply_id, public_id, name, description, image, last_order_date, last_modified_by),
    )


def insert_supply_without_id(
    cur,
    public_id: str,
    name: Any,
    description: Any,
    image: Any,
    last_order_date: Any,
    last_modified_by: str,
) -> int:
    cur.execute(
        """
            INSERT INTO supplies (public_id, name, description, image, last_order_date, last_modified_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (public_id, name, description, image, last_order_date, last_modified_by),
    )
    return cur.lastrowid


def fetch_undo_snapshot_batch(cur, old_name: str, changed_at: Any) -> Optional[dict]:
    cur.execute(
        """
            SELECT batch_id, MAX(changed_at) AS max_changed_at
            FROM supplies_location_history
            WHERE supply_name = %s
              AND action_type = 'CASCADED_SUBTRACT'
              AND changed_at >= DATE_SUB(%s, INTERVAL 10 SECOND)
              AND changed_at <= DATE_ADD(%s, INTERVAL 10 SECOND)
            GROUP BY batch_id
            ORDER BY max_changed_at DESC
            LIMIT 1
        """,
        (old_name, changed_at, changed_at),
    )
    return cur.fetchone()


def fetch_undo_snapshot_entries(cur, batch_id: Any) -> List[dict]:
    cur.execute(
        """
            SELECT location_name, shelf, old_amount
            FROM supplies_location_history
            WHERE batch_id = %s
              AND action_type = 'CASCADED_SUBTRACT'
        """,
        (batch_id,),
    )
    return cur.fetchall()


def insert_supplies_location_row(
    cur, supply_id: int, location_name: Any, shelf: Any, amount: Any, last_modified_by: str
) -> None:
    cur.execute(
        """
            INSERT INTO supplies_location (supply_id, location_name, shelf, amount, last_modified_by)
            VALUES (%s, %s, %s, %s, %s)
        """,
        (supply_id, location_name, shelf, amount, last_modified_by),
    )


def delete_location_history_cascaded_batch(cur, batch_id: Any) -> None:
    cur.execute(
        """
            DELETE FROM supplies_location_history
            WHERE batch_id = %s
              AND action_type = 'CASCADED_SUBTRACT'
        """,
        (batch_id,),
    )
