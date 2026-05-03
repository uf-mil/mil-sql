"""SQL for custom_field_definitions and supplies.custom_fields cleanup."""
from typing import List, Optional, Tuple


def list_id_name_type_ordered(cur) -> List[Tuple]:
    cur.execute(
        """
            SELECT id, name, type
            FROM custom_field_definitions
            ORDER BY name
        """
    )
    return cur.fetchall()


def insert_name_type(cur, name: str, type_val: str) -> int:
    cur.execute(
        """
            INSERT INTO custom_field_definitions (name, type)
            VALUES (%s, %s)
        """,
        (name, type_val),
    )
    return cur.lastrowid


def fetch_by_id_tuple(cur, definition_id: int) -> Optional[Tuple]:
    cur.execute(
        "SELECT id, name, type FROM custom_field_definitions WHERE id = %s",
        (definition_id,),
    )
    return cur.fetchone()


def exists_id_tuple(cur, definition_id: int) -> bool:
    cur.execute("SELECT id FROM custom_field_definitions WHERE id = %s", (definition_id,))
    return cur.fetchone() is not None


def update_columns(cur, set_fragments: List[str], values: List) -> None:
    cur.execute(
        "UPDATE custom_field_definitions SET " + ", ".join(set_fragments) + " WHERE id = %s",
        values,
    )


def fetch_name_by_id_dict(cur, definition_id: int) -> Optional[dict]:
    cur.execute("SELECT name FROM custom_field_definitions WHERE id = %s", (definition_id,))
    return cur.fetchone()


def delete_by_id(cur, definition_id: int) -> None:
    cur.execute("DELETE FROM custom_field_definitions WHERE id = %s", (definition_id,))


def iter_supplies_custom_fields_rows(cur):
    cur.execute("SELECT id, custom_fields FROM supplies WHERE custom_fields IS NOT NULL")
    return cur.fetchall()


def update_supply_custom_fields_json(cur, supply_id: int, new_json) -> None:
    cur.execute("UPDATE supplies SET custom_fields = %s WHERE id = %s", (new_json, supply_id))
