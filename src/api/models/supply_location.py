"""
SupplyLocation data model (items placed in locations).
"""
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

from src.api.helpers.datetime_json import db_datetime_to_utc_iso


@dataclass
class SupplyLocation:
    """Supply location model (inventory entries)."""
    id: Optional[int] = None
    supply_id: int = 0
    location_name: Optional[str] = ""
    shelf: Optional[int] = None  # NULL for non-shelf locations; 0-5 for Tall Cabinet shelves
    amount: int = 0  # Backend uses "amount", frontend uses "qty"
    coord_x: Optional[int] = None
    coord_y: Optional[int] = None
    last_modified: Optional[datetime] = None
    last_modified_by: Optional[str] = None  # UF ID
    created_at: Optional[datetime] = None
    
    @classmethod
    def from_db_row(cls, row):
        """Create SupplyLocation from database row tuple.
        
        Legacy 8-tuple: id, supply_id, location_name, shelf, amount, last_modified, last_modified_by, created_at
        With free place: id, supply_id, location_name, coord_x, coord_y, shelf, amount, last_modified, last_modified_by, created_at
        """
        n = len(row)
        if n >= 10:
            loc = row[2] if row[2] is not None else ""
            return cls(
                id=row[0],
                supply_id=row[1],
                location_name=loc,
                coord_x=row[3],
                coord_y=row[4],
                shelf=row[5],
                amount=row[6],
                last_modified=row[7],
                last_modified_by=row[8],
                created_at=row[9],
            )
        loc = row[2] if row[2] is not None else ""
        return cls(
            id=row[0],
            supply_id=row[1],
            location_name=loc,
            shelf=row[3],
            amount=row[4],
            last_modified=row[5],
            last_modified_by=row[6],
            created_at=row[7],
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
            coord_x=data.get('coord_x'),
            coord_y=data.get('coord_y'),
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
            'location': self.location_name if self.location_name else None,
            'shelf': self.shelf,
            'qty': self.amount,  # Frontend uses "qty"
        }
        if self.coord_x is not None and self.coord_y is not None:
            result['coord_x'] = self.coord_x
            result['coord_y'] = self.coord_y
            result['free_place'] = True
        if self.last_modified:
            serialized = db_datetime_to_utc_iso(self.last_modified)
            result['lastModified'] = serialized if serialized is not None else str(self.last_modified)
        if self.last_modified_by:
            result['last_modified_by'] = self.last_modified_by
        if self.created_at:
            serialized = db_datetime_to_utc_iso(self.created_at)
            result['created_at'] = serialized if serialized is not None else str(self.created_at)
        return result

