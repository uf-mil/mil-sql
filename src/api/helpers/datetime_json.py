"""
JSON serialization for MySQL date/time columns.

DATETIME and TIMESTAMP values from mysql-connector are naive ``datetime`` (or
``date`` for DATE columns). Our DB runs in UTC, so wall-clock values are UTC.
JavaScript parses ISO strings *without* a timezone offset as **local** time
(ECMA-262), which shifts Eastern users by several hours. Append ``Z`` so
``new Date()`` gets the correct instant; the frontend can still format in
America/New_York.
"""
from __future__ import annotations

from datetime import date, datetime, timezone


def db_datetime_to_utc_iso(value):
    """
    Serialize a MySQL date/datetime for JSON.

    - ``datetime`` (naive): treated as UTC, returns ``...Z``.
    - ``datetime`` (aware): converted to UTC, then ``...Z``.
    - ``date`` (not datetime): calendar date only ``YYYY-MM-DD`` (no Z).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        text = value.isoformat(sep="T")
        return f"{text}Z"
    if isinstance(value, date):
        return value.isoformat()
    return None
