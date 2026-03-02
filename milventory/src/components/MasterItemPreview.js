import React, { useRef, useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterEditModal from './MasterEditModal';
import { getCategories } from '../api';

const MasterItemPreview = () => {
  const {
    selectedMasterItem,
    resolveMasterItem,
    getItemLocations,
    inventoryData,
    clearSelectedMasterItem,
    deleteMasterItem,
    startAddMode,
    startMoveMode,
    startDeleteMode,
    cancelMoveMode,
    moveModeItem,
    leftPaneWidth,
    leftPaneCollapsed
  } = useInventory();

  const SHELF_NAMES = [
    'Shelf 6 (Top)', 'Shelf 5', 'Shelf 4',
    'Shelf 3', 'Shelf 2', 'Shelf 1 (Bottom)'
  ];

  const previewRef = useRef(null);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryIdToName, setCategoryIdToName] = useState(new Map());

  // Fetch category mapping for display
  useEffect(() => {
    getCategories()
      .then(categories => {
        const mapping = new Map();
        categories.forEach(cat => {
          if (typeof cat === 'object' && cat.id && cat.name) {
            mapping.set(cat.id, cat.name);
          }
        });
        setCategoryIdToName(mapping);
      })
      .catch(console.error);
  }, []);

  const item = selectedMasterItem ? resolveMasterItem(selectedMasterItem) : null;
  const locations = selectedMasterItem ? getItemLocations(selectedMasterItem) : [];
  
  // Convert category IDs to names for display
  const categoryNames = item?.categories 
    ? item.categories.map(catId => categoryIdToName.get(catId)).filter(name => name !== undefined)
    : [];

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

  const handleDeleteItem = () => {
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

  const handleMove = () => {
    startMoveMode(selectedMasterItem);
  };

  const handleDelete = () => {
    startDeleteMode(selectedMasterItem);
  };

  const handleEdit = () => {
    setEditingItem(selectedMasterItem);
  };
  
  const isInMoveMode = moveModeItem === selectedMasterItem;

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
              onClick={() => {
                if (isInMoveMode) cancelMoveMode();
                clearSelectedMasterItem();
              }}
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
          {(item.teams && item.teams.length > 0) && (
            <div className="master-preview-teams" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
              <strong>Teams:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {item.teams.map((team, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.25rem 0.5rem',
                      background: 'var(--accent)',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      textTransform: 'capitalize'
                    }}
                  >
                    {team}
                  </span>
                ))}
              </div>
            </div>
          )}
          {categoryNames.length > 0 && (
            <div className="master-preview-categories" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
              <strong>Categories:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {categoryNames.map((category, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    {category}
                  </span>
                ))}
              </div>
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
              {isInMoveMode ? (
                <>
                  <button className="master-action-button add-button" onClick={cancelMoveMode} title="Apply moves and exit move mode">
                    Apply Move
                  </button>
                  <button className="master-action-button cancel-button" onClick={cancelMoveMode} title="Cancel move mode">
                    Cancel Move
                  </button>
                </>
              ) : (
                <>
                  <button className="master-action-button add-button" onClick={handleAddToBoxes} title="Add to boxes on map">
                    Add
                  </button>
                  <button className="master-action-button delete-button" onClick={handleDelete} title="Delete items from boxes">
                    Delete Some
                  </button>
                  <button className="master-action-button move-button" onClick={handleMove} title="Move items between boxes">
                    Move
                  </button>
                  <button className="master-action-button edit-button" onClick={handleEdit} title="Edit item">
                    Edit
                  </button>
                  <button className="master-action-button delete-button" onClick={handleDeleteItem} title="Delete item from master inventory">
                    Delete All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <MasterEditModal isOpen={editingItem !== null} onClose={() => setEditingItem(null)} itemName={editingItem} />
    </>
  );
};

export default MasterItemPreview;
