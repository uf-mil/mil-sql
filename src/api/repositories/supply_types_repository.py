"""SQL for supply_types and linked supplies rows during prefix cascade."""
from typing import List, Optional

_SUPPLY_TYPE_SELECT = """
    id, name, template_description, item_name_prefix, item_description_prefix,
    image, default_custom_fields, locked_custom_field_keys, is_unique,
    created_at, updated_at
"""


def list_all_dict(cur) -> List[dict]:
    cur.execute(
        f"SELECT {_SUPPLY_TYPE_SELECT.strip()} FROM supply_types ORDER BY name"
    )
    return cur.fetchall()


def fetch_by_id_dict(cur, type_id: int) -> Optional[dict]:
    cur.execute(
        f"SELECT {_SUPPLY_TYPE_SELECT.strip()} FROM supply_types WHERE id = %s",
        (type_id,),
    )
    return cur.fetchone()


def insert_supply_type(
    cur,
    name: str,
    template_description,
    item_name_prefix: str,
    item_description_prefix,
    image,
    default_custom_fields_json,
    locked_keys_json,
    is_unique: int,
) -> int:
    cur.execute(
        """
            INSERT INTO supply_types (
                name, template_description, item_name_prefix, item_description_prefix,
                image, default_custom_fields, locked_custom_field_keys, is_unique
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            name,
            template_description,
            item_name_prefix,
            item_description_prefix,
            image,
            default_custom_fields_json,
            locked_keys_json,
            is_unique,
        ),
    )
    return cur.lastrowid


def fetch_prefixes_row(cur, type_id: int) -> Optional[dict]:
    cur.execute(
        """
            SELECT id, item_name_prefix, item_description_prefix
            FROM supply_types WHERE id = %s
        """,
        (type_id,),
    )
    return cur.fetchone()


def update_supply_type_columns(cur, set_fields: List[str], values: List) -> None:
    """values end with type_id for WHERE id = %s."""
    cur.execute(f"UPDATE supply_types SET {', '.join(set_fields)} WHERE id = %s", tuple(values))


def select_supplies_id_name_desc_for_type(cur, type_id: int) -> List[dict]:
    cur.execute(
        "SELECT id, name, description FROM supplies WHERE supply_type_id = %s",
        (type_id,),
    )
    return cur.fetchall()


def select_supply_id_by_name_excluding(cur, name: str, exclude_id: int) -> Optional[int]:
    cur.execute("SELECT id FROM supplies WHERE name = %s AND id != %s", (name, exclude_id))
    row = cur.fetchone()
    if not row:
        return None
    return row["id"] if isinstance(row, dict) else row[0]


def update_supply_name_description(cur, supply_id: int, name: str, description) -> None:
    cur.execute(
        "UPDATE supplies SET name = %s, description = %s WHERE id = %s",
        (name, description, supply_id),
    )


def delete_supply_type_by_id(cur, type_id: int) -> int:
    cur.execute("DELETE FROM supply_types WHERE id = %s", (type_id,))
    return cur.rowcount
