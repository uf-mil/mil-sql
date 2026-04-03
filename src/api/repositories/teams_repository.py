"""SQL for teams reference table."""


def list_team_names_ordered(cur) -> list:
    cur.execute("SELECT name FROM teams ORDER BY name")
    rows = cur.fetchall()
    out = []
    for row in rows:
        if isinstance(row, dict):
            out.append(row["name"])
        else:
            out.append(row[0])
    return out
