import os
import psycopg2

DATABASE_URL = "postgres://postgres:admin@localhost:5432/postgres"

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Postgres version:", cur.fetchone())

    # Execute SQL from file
    with open("../sql/table.sql", "r") as f:
        sql = f.read()
    print("Executing SQL from file...")
    print(sql)
    cur.execute(sql)
    conn.commit()
    print("SQL executed successfully.")
    cur.close()
    conn.close()
except Exception as e:
    print("Database connection failed:", e)

