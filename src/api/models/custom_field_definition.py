"""
Custom field definition model (admin-defined field types).
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class CustomFieldDefinition:
    """Custom field definition: name (display and key), type (text|number|date)."""
    id: Optional[int] = None
    name: str = ""
    type: str = "text"  # text, number, date

    @classmethod
    def from_db_row(cls, row):
        """Create from database row (id, name, type)."""
        return cls(
            id=row[0],
            name=row[1],
            type=row[2]
        )

    def to_dict(self):
        """Convert to dictionary for JSON response."""
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type
        }
