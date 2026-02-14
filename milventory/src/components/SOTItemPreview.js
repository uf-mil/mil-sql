import React, { useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const SOTItemPreview = () => {
  const {
    selectedSOTItem,
    resolveSOTItem,
    getItemLocations,
    clearSelectedSOTItem,
    leftPaneWidth,
    leftPaneCollapsed
  } = useInventory();

  const previewRef = useRef(null);

  const item = selectedSOTItem ? resolveSOTItem(selectedSOTItem) : null;
  const locations = selectedSOTItem ? getItemLocations(selectedSOTItem) : [];

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20; // 20px padding from left pane
  const positionY = 20; // 20px from top

  if (!selectedSOTItem || !item) return null;

  return (
    <div
      ref={previewRef}
      className="sot-preview-pane-overlay"
      style={{
        position: 'fixed',
        left: `${positionX}px`,
        top: `${positionY}px`,
        zIndex: 1000
      }}
    >
      <div className="sot-preview-pane">
        <div className="sot-preview-pane-header">
          <h3>{item.name}</h3>
          <button
            className="sot-preview-pane-close"
            onClick={clearSelectedSOTItem}
            title="Close preview"
          >
            ×
          </button>
        </div>
        {item.description && (
          <div className="sot-preview-description">
            <strong>Description:</strong>
            <p>{item.description}</p>
          </div>
        )}
        <div className="sot-preview-locations">
          <strong>Locations:</strong>
          {locations.length === 0 ? (
            <div className="sot-preview-location-item">No locations</div>
          ) : (
            locations.map((location, idx) => (
              <div key={idx} className="sot-preview-location-item">
                {location}
              </div>
            ))
          )}
        </div>
        {item.image && (
          <div className="sot-preview-image">
            <img src={item.image} alt={item.name} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SOTItemPreview;

