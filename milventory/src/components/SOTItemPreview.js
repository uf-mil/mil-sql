import React, { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import SOTEditModal from './SOTEditModal';

const SOTItemPreview = () => {
  const {
    selectedSOTItem,
    resolveSOTItem,
    getItemLocations,
    inventoryData,
    clearSelectedSOTItem,
    deleteSOTItem,
    startAddMode,
    leftPaneWidth,
    leftPaneCollapsed
  } = useInventory();

  const SHELF_NAMES = [
    'Shelf 6 (Top)', 'Shelf 5', 'Shelf 4',
    'Shelf 3', 'Shelf 2', 'Shelf 1 (Bottom)'
  ];

  const previewRef = useRef(null);
  const [editingItem, setEditingItem] = useState(null);

  const item = selectedSOTItem ? resolveSOTItem(selectedSOTItem) : null;
  const locations = selectedSOTItem ? getItemLocations(selectedSOTItem) : [];

  // Build detailed location entries with qty (breaking Tall Cabinets down by shelf)
  const locationDetails = [];
  if (selectedSOTItem) {
    locations.forEach(boxTitle => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;
      const matchingItems = boxData.inventory.filter(i => i.name === selectedSOTItem);
      if (boxTitle.startsWith('Tall Cabinet')) {
        matchingItems.forEach(i => {
          const shelfIdx = i.shelf ?? 0;
          const shelfName = SHELF_NAMES[shelfIdx] || `Shelf ${shelfIdx}`;
          locationDetails.push({ label: `${boxTitle} → ${shelfName}`, qty: i.qty });
        });
      } else {
        const totalQty = matchingItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        locationDetails.push({ label: boxTitle, qty: totalQty });
      }
    });
  }

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const handleDelete = () => {
    if (locations.length > 0) {
      const confirmed = window.confirm(
        `This item is used in ${locations.length} box(es). Delete from all boxes?`
      );
      if (!confirmed) return;
    }
    deleteSOTItem(selectedSOTItem);
  };

  const handleAddToBoxes = () => {
    startAddMode(selectedSOTItem);
  };

  const handleEdit = () => {
    setEditingItem(selectedSOTItem);
  };

  if (!selectedSOTItem || !item) return null;

  return (
    <>
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
            {locationDetails.length === 0 ? (
              <div className="sot-preview-location-item">No locations</div>
            ) : (
              locationDetails.map((loc, idx) => (
                <div key={idx} className="sot-preview-location-item">
                  {loc.label} <span className="sot-preview-location-qty">(Qty: {loc.qty})</span>
                </div>
              ))
            )}
          </div>
          {item.image && (
            <div className="sot-preview-image">
              <img src={item.image} alt={item.name} />
            </div>
          )}
          <div className="sot-preview-actions">
            <strong>Actions:</strong>
            <div className="sot-preview-actions-buttons">
              <button className="sot-action-button add-button" onClick={handleAddToBoxes} title="Add to boxes on map">
                Add to Boxes
              </button>
              <button className="sot-action-button edit-button" onClick={handleEdit} title="Edit item">
                Edit
              </button>
              <button className="sot-action-button delete-button" onClick={handleDelete} title="Delete item">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      <SOTEditModal isOpen={editingItem !== null} onClose={() => setEditingItem(null)} itemName={editingItem} />
    </>
  );
};

export default SOTItemPreview;
