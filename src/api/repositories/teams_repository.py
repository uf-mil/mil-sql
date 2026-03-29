"""SQL for teams reference table."""


def list_team_names_ordered(cur) -> list:
    cur.execute("SELECT name FROM teams ORDER BY name")
    return [row[0] for row in cur.fetchall()]
