"""Team model for database operations."""


class Team:
    def __init__(self, name):
        self.name = name
    
    @staticmethod
    def from_db_row(row):
        """Create Team from database row tuple."""
        return Team(name=row[0])
    
    def to_dict(self):
        """Convert Team to dictionary."""
        return {
            'name': self.name
        }



