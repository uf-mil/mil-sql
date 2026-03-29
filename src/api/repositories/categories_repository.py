"""SQL for categories."""
from typing import Optional, Tuple


def list_id_name_ordered(cur) -> list:
    cur.execute("SELECT id, name FROM categories ORDER BY name")
    return cur.fetchall()


def fetch_by_id(cur, category_id: int) -> Optional[Tuple]:
    cur.execute("SELECT id, name, created_at FROM categories WHERE id = %s", (category_id,))
    return cur.fetchone()


def insert_name(cur, name: str) -> None:
    cur.execute("INSERT INTO categories (name) VALUES (%s)", (name,))


def fetch_last_insert_row(cur) -> Tuple:
    cur.execute("SELECT id, name, created_at FROM categories WHERE id = LAST_INSERT_ID()")
    return cur.fetchone()
