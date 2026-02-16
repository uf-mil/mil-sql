import React, { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterEditModal from './MasterEditModal';

const MasterItemPreview = () => {
  const {
    selectedMasterItem,
    resolveMasterItem,
    getItemLocations,
    inventoryData,
    clearSelectedMasterItem,
    deleteMasterItem,
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

  const item = selectedMasterItem ? resolveMasterItem(selectedMasterItem) : null;
  const locations = selectedMasterItem ? getItemLocations(selectedMasterItem) : [];

  // Build detailed location entries with qty (breaking Tall Cabinets down by shelf)
  const locationDetails = [];
  if (selectedMasterItem) {
    locations.forEach(boxTitle => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;
      const matchingItems = boxData.inventory.filter(i => i.name === selectedMasterItem);
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
    deleteMasterItem(selectedMasterItem);
  };

  const handleAddToBoxes = () => {
    startAddMode(selectedMasterItem);
  };

  const handleEdit = () => {
    setEditingItem(selectedMasterItem);
  };

  if (!selectedMasterItem || !item) return null;

  return (
    <>
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
            <h3>{item.name}</h3>
            <button
              className="master-preview-pane-close"
              onClick={clearSelectedMasterItem}
              title="Close preview"
            >
              ×
            </button>
          </div>
          {item.description && (
            <div className="master-preview-description">
              <strong>Description:</strong>
              <p>{item.description}</p>
            </div>
          )}
          <div className="master-preview-locations">
            <strong>Locations:</strong>
            {locationDetails.length === 0 ? (
              <div className="master-preview-location-item">No locations</div>
            ) : (
              locationDetails.map((loc, idx) => (
                <div key={idx} className="master-preview-location-item">
                  {loc.label} <span className="master-preview-location-qty">(Qty: {loc.qty})</span>
                </div>
              ))
            )}
          </div>
          {item.image && (
            <div className="master-preview-image">
              <img src={item.image} alt={item.name} />
            </div>
          )}
          {item.last_modified_by_name && (
            <div className="master-preview-last-modified" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              <strong>Last modified by:</strong> {item.last_modified_by_name}
              {item.lastModified && (
                <span style={{ marginLeft: '0.5rem' }}>
                  ({new Date(item.lastModified).toLocaleString()})
                </span>
              )}
            </div>
          )}
          <div className="master-preview-actions">
            <strong>Actions:</strong>
            <div className="master-preview-actions-buttons">
              <button className="master-action-button add-button" onClick={handleAddToBoxes} title="Add to boxes on map">
                Add to Boxes
              </button>
              <button className="master-action-button edit-button" onClick={handleEdit} title="Edit item">
                Edit
              </button>
              <button className="master-action-button delete-button" onClick={handleDelete} title="Delete item">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      <MasterEditModal isOpen={editingItem !== null} onClose={() => setEditingItem(null)} itemName={editingItem} />
    </>
  );
};

export default MasterItemPreview;
