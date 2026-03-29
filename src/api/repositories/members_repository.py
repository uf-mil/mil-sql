"""SQL for members (auth)."""
from typing import Optional


def fetch_by_email_dict(cur, email: str) -> Optional[dict]:
    cur.execute(
        """
            SELECT uf_id, uf_email, first_name, last_name, password_hash, is_leader
            FROM members WHERE uf_email = %s
        """,
        (email,),
    )
    return cur.fetchone()


def fetch_by_uf_id_dict(cur, uf_id) -> Optional[dict]:
    cur.execute(
        """
            SELECT uf_id, uf_email, first_name, last_name, is_leader
            FROM members WHERE uf_id = %s
        """,
        (uf_id,),
    )
    return cur.fetchone()
