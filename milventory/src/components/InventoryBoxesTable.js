import React, { useState, useEffect } from 'react';
import { admin } from '../api';

const InventoryBoxesTable = ({ selectedLocation, onLocationSelect }) => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await admin.getLocations();
      setLocations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = locations.filter(loc => 
    !searchQuery.trim() || 
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedLocations = [...filteredLocations].sort((a, b) => 
    a.name.localeCompare(b.name)
  );

  if (loading) {
    return <div className="master-table-empty">Loading inventory boxes...</div>;
  }

  return (
    <>
      {error && (
        <div style={{
          background: '#dc3545',
          color: 'white',
          padding: '0.5rem',
          borderRadius: '4px',
          marginBottom: '0.5rem',
          fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      <div className="master-table-search">
        <input
          type="text"
          placeholder="Search boxes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="master-search-input"
        />
      </div>

      {sortedLocations.length === 0 ? (
        <div className="master-table-empty">
          {searchQuery ? 'No boxes found' : 'No inventory boxes found.'}
        </div>
      ) : (
        <table className="master-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Position</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {sortedLocations.map(location => {
              const isSelected = selectedLocation && selectedLocation.name === location.name;
              return (
                <tr 
                  key={location.name} 
                  className={`master-table-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (onLocationSelect) {
                      onLocationSelect(location);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                <td>{location.name}</td>
                <td style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>
                  {location.type.replace('_', ' ')}
                </td>
                <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  ({location.x}, {location.y})
                </td>
                <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {location.width}×{location.height}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
};

export default InventoryBoxesTable;

