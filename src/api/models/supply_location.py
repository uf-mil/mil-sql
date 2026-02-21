"""
SupplyLocation data model (items placed in locations).
"""
from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class SupplyLocation:
    """Supply location model (inventory entries)."""
    id: Optional[int] = None
    supply_id: int = 0
    location_name: str = ""
    shelf: Optional[int] = None  # NULL for non-shelf locations; 0-5 for Tall Cabinet shelves
    amount: int = 0  # Backend uses "amount", frontend uses "qty"
    last_modified: Optional[datetime] = None
    last_modified_by: Optional[str] = None  # UF ID
    created_at: Optional[datetime] = None
    
    @classmethod
    def from_db_row(cls, row):
        """Create SupplyLocation from database row tuple.
        
        Args:
            row: Tuple from database query (id, supply_id, location_name, shelf, amount, last_modified, last_modified_by, created_at)
        """
        return cls(
            id=row[0],
            supply_id=row[1],
            location_name=row[2],
            shelf=row[3],
            amount=row[4],
            last_modified=row[5],
            last_modified_by=row[6],
            created_at=row[7]
        )
    
    @classmethod
    def from_dict(cls, data: dict):
        """Create SupplyLocation from dictionary.
        
        Args:
            data: Dictionary with supply_location fields
        """
        return cls(
            id=data.get('id'),
            supply_id=data.get('supply_id', data.get('supplyId', 0)),
            location_name=data.get('location_name', data.get('location', '')),
            shelf=data.get('shelf'),
            amount=data.get('amount', data.get('qty', 0)),  # Accept both "amount" and "qty"
            last_modified=data.get('last_modified', data.get('lastModified')),
            last_modified_by=data.get('last_modified_by'),
            created_at=data.get('created_at', data.get('createdAt'))
        )
    
    def to_dict(self):
        """Convert SupplyLocation to dictionary.
        Maps 'amount' to 'qty' for frontend compatibility.
        """
        result = {
            'id': self.id,
            'supply_id': self.supply_id,
            'location': self.location_name,
            'shelf': self.shelf,
            'qty': self.amount,  # Frontend uses "qty"
        }
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

