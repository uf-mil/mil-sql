"""
Location model for API responses.
"""
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class Location:
    """Location model representing a storage location."""
    name: str
    x: int
    y: int
    width: int
    height: int
    type: str
    protected: bool = False
    
    @classmethod
    def from_db_row(cls, row: tuple) -> 'Location':
        """
        Create Location from database row.
        
        Args:
            row: Tuple from database query (name, x, y, width, height, type, protected)
            
        Returns:
            Location instance
        """
        return cls(
            name=row[0],
            x=row[1],
            y=row[2],
            width=row[3],
            height=row[4],
            type=row[5],
            protected=bool(row[6]) if len(row) > 6 else False
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert Location to dictionary for JSON serialization.
        
        Returns:
            Dictionary representation of the location
        """
        return {
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'width': self.width,
            'height': self.height,
            'type': self.type,
            'protected': self.protected
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Location':
        """
        Create Location from dictionary.
        
        Args:
            data: Dictionary with location data
            
        Returns:
            Location instance
        """
        return cls(
            name=data['name'],
            x=int(data['x']),
            y=int(data['y']),
            width=int(data['width']),
            height=int(data['height']),
            type=data['type'],
            protected=bool(data.get('protected', False))
        )

