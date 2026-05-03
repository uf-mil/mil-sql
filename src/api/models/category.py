"""Category model for database operations."""

from src.api.helpers.datetime_json import db_datetime_to_utc_iso


class Category:
    def __init__(self, id, name, created_at):
        self.id = id
        self.name = name
        self.created_at = created_at
    
    @staticmethod
    def from_db_row(row):
        """Create Category from database row tuple."""
        return Category(id=row[0], name=row[1], created_at=row[2])
    
    def to_dict(self):
        """Convert Category to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'created_at': db_datetime_to_utc_iso(self.created_at)
        }



