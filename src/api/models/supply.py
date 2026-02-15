"""
Supply data model (catalog/reference table).
"""
from dataclasses import dataclass
from typing import Optional
from datetime import date, datetime


@dataclass
class Supply:
    """Supply catalog/reference model."""
    id: Optional[int] = None
    name: str = ""
    description: Optional[str] = None
    image: Optional[str] = None  # Base64 data URI (LONGTEXT)
    last_order_date: Optional[date] = None
    last_modified: Optional[datetime] = None
    last_modified_by: Optional[str] = None  # UF ID
    created_at: Optional[datetime] = None
    
    @classmethod
    def from_db_row(cls, row):
        """Create Supply from database row tuple.
        
        Args:
            row: Tuple from database query (id, name, description, image, last_order_date, last_modified, last_modified_by, created_at)
        """
        return cls(
            id=row[0],
            name=row[1],
            description=row[2],
            image=row[3],
            last_order_date=row[4],
            last_modified=row[5],
            last_modified_by=row[6],
            created_at=row[7]
        )
    
    @classmethod
    def from_dict(cls, data: dict):
        """Create Supply from dictionary.
        
        Args:
            data: Dictionary with supply fields
        """
        return cls(
            id=data.get('id'),
            name=data.get('name', ''),
            description=data.get('description'),
            image=data.get('image'),
            last_order_date=data.get('last_order_date'),
            last_modified=data.get('last_modified'),
            last_modified_by=data.get('last_modified_by'),
            created_at=data.get('created_at')
        )
    
    def to_dict(self):
        """Convert Supply to dictionary."""
        result = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'image': self.image,
        }
        if self.last_order_date:
            if isinstance(self.last_order_date, date):
                result['last_order_date'] = self.last_order_date.isoformat()
            else:
                result['last_order_date'] = str(self.last_order_date)
        if self.last_modified:
            if isinstance(self.last_modified, datetime):
                result['lastModified'] = self.last_modified.isoformat()
            else:
                result['lastModified'] = str(self.last_modified)
        if self.last_modified_by:
            result['last_modified_by'] = self.last_modified_by
        if self.created_at:
            if isinstance(self.created_at, datetime):
                result['created_at'] = self.created_at.isoformat()
            else:
                result['created_at'] = str(self.created_at)
        return result

