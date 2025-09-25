import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@db:5432/mydb")

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Postgres version:", cur.fetchone())
    cur.close()
    conn.close()
except Exception as e:
    print("Database connection failed:", e)

