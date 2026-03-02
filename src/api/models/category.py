"""Category model for database operations."""


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
            'created_at': self.created_at.isoformat() if self.created_at else None
        }



