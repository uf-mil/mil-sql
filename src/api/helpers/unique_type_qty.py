"""
is_unique on supply_types: multiple catalog rows may share a type, but for each supply
linked to such a type, total quantity across supplies_location must be at most 1.
"""


def map_total_qty_for_supply(cur, supply_id):
    cur.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM supplies_location
        WHERE supply_id = %s
        """,
        (int(supply_id),),
    )
    row = cur.fetchone()
    if not row:
        return 0
    if isinstance(row, dict):
        return int(row["total"] or 0)
    return int(row[0] or 0)


def supply_has_unique_type(cur, supply_id):
    cur.execute(
        """
        SELECT COALESCE(st.is_unique, 0) AS u
        FROM supplies s
        LEFT JOIN supply_types st ON s.supply_type_id = st.id
        WHERE s.id = %s
        """,
        (int(supply_id),),
    )
    row = cur.fetchone()
    if not row:
        return False
    if isinstance(row, dict):
        return bool(row.get("u"))
    return bool(row[0])


def check_unique_type_map_qty(cur, supply_id, proposed_total):
    """
    If supply is linked to a type with is_unique, proposed_total must be <= 1.
    Returns (True, None) or (False, error_message).
    """
    if not supply_has_unique_type(cur, supply_id):
        return True, None
    if int(proposed_total) > 1:
        return (
            False,
            "This item uses a type that allows at most 1 total quantity on the map.",
        )
    return True, None


def type_has_supply_with_map_qty_over_one(cur, type_id):
    """True if any supply with this type has total map quantity > 1."""
    cur.execute(
        """
        SELECT s.id
        FROM supplies s
        LEFT JOIN supplies_location sl ON sl.supply_id = s.id
        WHERE s.supply_type_id = %s
        GROUP BY s.id
        HAVING COALESCE(SUM(sl.amount), 0) > 1
        LIMIT 1
        """,
        (int(type_id),),
    )
    return cur.fetchone() is not None
