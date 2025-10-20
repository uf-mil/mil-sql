from pathlib import Path
import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@db:5432/mydb")

# Create Table SQL strings
table_members = Path("/app/src/sql/members/table_members.sql").read_text()
table_weekly_reports = Path("/app/src/sql/weekly_reports/table_weekly_reports.sql").read_text()
table_teams = Path("/app/src/sql/teams/table_teams.sql").read_text()
table_supplies = Path("/app/src/sql/supplies/table_supplies.sql").read_text()
table_orders = Path("/app/src/sql/orders/table_orders.sql").read_text()
# Insert SQL strings
insert_member = Path("/app/src/sql/members/insert_member.sql").read_text()

# Make table, log if success or failure
def make_table(cur, table_sql, table_name):
    try:
        cur.execute(table_sql)
    except Exception as e:
        print(f"Make {table_name} table failed.", e)
    else:
        print(f"Make {table_name} table succeeded.")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Postgres version:", cur.fetchone())

    # Drop old tables for testing purposes
    cur.execute("DROP TABLE IF EXISTS members CASCADE;")
    cur.execute("DROP TABLE IF EXISTS weekly_reports;")
    cur.execute("DROP TABLE IF EXISTS teams;")
    cur.execute("DROP TABLE IF EXISTS supplies;")
    cur.execute("DROP TABLE IF EXISTS orders;")
    conn.commit()

    # Make SQL Tables
    make_table(cur, table_members, "members")
    make_table(cur, table_weekly_reports, "weekly_reports")
    make_table(cur, table_teams, "teams")
    make_table(cur, table_supplies, "supplies")
    make_table(cur, table_orders, "orders")

    # Insert a test member
    try:
        cur.execute(insert_member, {
            "first":  "Albert",
            "last":   "Gator",
            "ufid":   "12345678",
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

