"""SQL for members (auth)."""
import secrets
from typing import Optional


def allocate_uf_id(cur) -> str:
    """Generate an unused 8-digit UF ID (matches members.uf_id CHECK)."""
    for _ in range(100):
        uid = f"{secrets.randbelow(100000000):08d}"
        cur.execute("SELECT 1 FROM members WHERE uf_id = %s LIMIT 1", (uid,))
        if cur.fetchone() is None:
            return uid
    raise RuntimeError("Could not allocate uf_id")


def insert_signup_member(
    cur,
    *,
    first_name: str,
    last_name: str,
    uf_id: str,
    uf_email: str,
    password_hash: str,
    discord: str,
    github: str,
) -> None:
    cur.execute(
        """
        INSERT INTO members (first_name, last_name, uf_id, uf_email, password_hash, is_leader, discord, github)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (first_name, last_name, uf_id, uf_email, password_hash, False, discord, github),
    )


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
