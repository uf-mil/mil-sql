import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@db:5432/mydb")

# Function to execute SQL from a file
def execute_sql_file(file_path: str):
    try:        
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        with open(file_path, 'r') as file:
            sql = file.read()
        with cur:
            cur.execute(sql)
        conn.commit()            
    except Exception as e:
        print(f"Unable to execute SQL file at {file_path}: ", e)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT version();")
    print("Postgres version:", cur.fetchone())
    
    # Execute SQL files
    execute_sql_file('/app/src/sql/students.sql')
    execute_sql_file('/app/src/sql/student_progress.sql')

    # Finish up
    print("Creation of all SQL Tables succeeded or attempted.")
    cur.close()
    conn.close()

except Exception as e:
    print("Database connection failed:", e)

