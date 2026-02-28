import React, { useRef, useState, useEffect } from 'react';
import { admin } from '../api';

const LocationPreview = ({ location, onClose, onDelete, leftPaneWidth, leftPaneCollapsed }) => {
  const previewRef = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [protectedLocations, setProtectedLocations] = useState(new Set());

  // Load protected locations from JSON file
  useEffect(() => {
    const loadProtectedLocations = async () => {
      try {
        const response = await fetch('/inventory-locations.json');
        if (response.ok) {
          const data = await response.json();
          const protectedNames = new Set(
            (data.boxes || []).map(box => box.title)
          );
          setProtectedLocations(protectedNames);
        }
      } catch (err) {
        console.error('Error loading protected locations:', err);
      }
    };
    loadProtectedLocations();
  }, []);

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const isProtected = location && protectedLocations.has(location.name);

  const handleDelete = async () => {
    if (!location) return;
    
    // Check if location is protected
    if (isProtected) {
      alert(
        `This location is protected because it's in the inventory-locations.json file. ` +
        `It is a permanent inventory location. To delete it, edit the code/JSON file directly.`
      );
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${location.name}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      setDeleting(true);
      await admin.deleteLocation(location.name);
      if (onDelete) {
        onDelete(location.name);
      }
      if (onClose) {
        onClose();
      }
      // Reload page to refresh the map
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      alert(`Failed to delete location: ${err.message}`);
      setDeleting(false);
    }
  };

  if (!location) return null;

  const typeDisplay = location.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div
      ref={previewRef}
      className="master-preview-pane-overlay"
      style={{
        position: 'fixed',
        left: `${positionX}px`,
        top: `${positionY}px`,
        zIndex: 1000
      }}
    >
      <div className="master-preview-pane">
        <div className="master-preview-pane-header">
          <h3>{location.name}</h3>
          <button
            className="master-preview-pane-close"
            onClick={onClose}
            title="Close preview"
          >
            ×
          </button>
        </div>
        
        <div className="master-preview-description">
          <strong>Type:</strong>
          <p style={{ margin: '0.25rem 0', textTransform: 'capitalize' }}>{typeDisplay}</p>
        </div>

        <div className="master-preview-locations">
          <strong>Position:</strong>
          <div className="master-preview-location-item">
            X: {location.x}, Y: {location.y}
          </div>
        </div>

        <div className="master-preview-locations" style={{ marginTop: '0.75rem' }}>
          <strong>Size:</strong>
          <div className="master-preview-location-item">
            Width: {location.width}, Height: {location.height}
          </div>
        </div>

        {isProtected && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: 'rgba(255, 193, 7, 0.2)',
            border: '1px solid rgba(255, 193, 7, 0.5)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontSize: '0.85rem'
          }}>
            <strong>⚠ Protected Location</strong>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
              This location is in inventory-locations.json and is permanent. Edit the JSON file to remove it.
            </p>
          </div>
        )}

        <div className="master-preview-actions" style={{ marginTop: '1rem' }}>
          <strong>Actions:</strong>
          <div className="master-preview-actions-buttons">
            <button 
              className="master-action-button delete-button" 
              onClick={handleDelete} 
              title={isProtected ? "This location is protected" : "Delete location"}
              disabled={deleting || isProtected}
              style={isProtected ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationPreview;

