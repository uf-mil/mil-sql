from pathlib import Path
import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@db:5432/mydb")

# Global SQL strings
insert_member = Path("/app/src/sql/insert_member.sql").read_text()
members_table = Path("/app/src/sql/tables/members.sql").read_text()
member_progress_table = Path("/app/src/sql/tables/member_progress.sql").read_text()

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Postgres version:", cur.fetchone())

    # Drop old tables for testing purposes
    cur.execute("DROP TABLE IF EXISTS member_progress;")
    cur.execute("DROP TABLE IF EXISTS members;")
    conn.commit()

    # Make SQL Tables
    try:
        cur.execute(members_table)
    except Exception as e:
        print("Make member table failed.", e)
    else:
        print("Make member table succeeded.")
    try:
        cur.execute(member_progress_table)
    except Exception as e:
        print("Make progress table failed.", e)
    else:
        print("Make progress table succeeded.")

    # Insert a test member
    try:
        cur.execute(insert_member, {
            "first":  "Albert",
            "last":   "Gator",
            "email":  "albert.gator@ufl.edu",
            "phone":  "352-201-0001",
            "team":   "Mechanical",
            "discord":"AlbertDiscord",
            "github": "AlbertGithub",
            "grad":   "2026-05-01",
            "join":   "2024-09-01",
            "leader": False,
        })
    except Exception as e:
        print("Insert member failed:", e)
    else:
        print("Insert member succeeded.")

    # Finish up
    print("Connection committing and then closing.")
    conn.commit()
    cur.close()
    conn.close()

except Exception as e:
    print("Database connection failed:", e)

