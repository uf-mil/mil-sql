import React, { useRef, useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import MasterEditModal from './MasterEditModal';
import { getCategories, api } from '../../api';
import { formatCustomValue } from './MasterTableRow';
import { formatEasternDateTime } from '../../utils/appTimeZone';
import { useBlockingDialog } from '../Common/BlockingDialogContext';

const MasterItemPreview = () => {
  const { showConfirm } = useBlockingDialog();
  const {
    selectedMasterItem,
    resolveMasterItem,
    getItemLocations,
    inventoryData,
    clearSelectedMasterItem,
    deleteMasterItem,
    startAddMode,
    startMoveMode,
    startSubtractMode,
    finishMoveMode,
    cancelMoveMode,
    moveModeItem,
    leftPaneWidth,
    leftPaneCollapsed,
    freePlaceModeItem,
    freePlacementsBySupplyName,
    startFreePlaceMode,
    cancelFreePlaceMode,
    finishFreePlaceMode
  } = useInventory();

  const SHELF_NAMES = [
    'Shelf 6 (Top)', 'Shelf 5', 'Shelf 4',
    'Shelf 3', 'Shelf 2', 'Shelf 1 (Bottom)'
  ];

  const previewRef = useRef(null);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryIdToName, setCategoryIdToName] = useState(new Map());
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);

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

  useEffect(() => {
    api.getCustomFieldDefinitions()
      .then(data => setCustomFieldDefinitions(Array.isArray(data) ? data : []))
      .catch(() => setCustomFieldDefinitions([]));
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
    const freeDots = freePlacementsBySupplyName.get(selectedMasterItem) || [];
    freeDots.forEach((p) => {
      locationDetails.push({
        label: `Floor (${Math.round(p.x)}, ${Math.round(p.y)})`,
        qty: p.qty || 0
      });
    });
  }

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const handleDeleteItem = async () => {
    const freeDots = freePlacementsBySupplyName.get(selectedMasterItem) || [];
    const placeCount = locations.length + freeDots.length;
    if (placeCount > 0) {
      const confirmed = await showConfirm(
        `This item appears in ${placeCount} place(s) on the map (boxes and/or floor). Delete from everywhere?`,
        { title: 'Delete item', danger: true, confirmLabel: 'Delete all', cancelLabel: 'Cancel' }
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

  const handleSubtract = () => {
    startSubtractMode(selectedMasterItem);
  };

  const handleEdit = () => {
    setEditingItem(selectedMasterItem);
  };
  
  const isInMoveMode = moveModeItem === selectedMasterItem;
  const isInFreePlaceMode = freePlaceModeItem === selectedMasterItem;

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
                if (freePlaceModeItem === selectedMasterItem) cancelFreePlaceMode();
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
          {item.custom_fields && Object.keys(item.custom_fields).length > 0 && (
            <div className="master-preview-custom-fields" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
              <strong>Custom fields:</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                {Object.entries(item.custom_fields).map(([fieldName, value]) => {
                  const def = customFieldDefinitions.find(d => d.name === fieldName);
                  return (
                    <div key={fieldName} style={{ fontSize: '0.9rem' }}>
                      <span style={{ color: 'var(--muted)' }}>{fieldName}:</span>{' '}
                      {formatCustomValue(value, def?.type || 'text')}
                    </div>
                  );
                })}
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
                  ({formatEasternDateTime(item.lastModified)})
                </span>
              )}
            </div>
          )}
          <div className="master-preview-actions">
            <strong>Actions:</strong>
            {isInFreePlaceMode && (
              <p className="master-preview-free-place-hint" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Click the room floor to queue a marker, drag to reposition, double-click to queue removal. Nothing is saved until Done. Cancel discards all changes since you entered free place.
              </p>
            )}
            {isInMoveMode && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Dropping on a box moves stock immediately. Drag floor markers to preview; Apply Move saves those positions. Cancel Move reverts box moves and discards floor drags.
              </p>
            )}
            <div className="master-preview-actions-buttons">
              {isInFreePlaceMode ? (
                <>
                  <button className="master-action-button free-place-button" onClick={() => void finishFreePlaceMode()} title="Save floor changes to the server">
                    Done
                  </button>
                  <button className="master-action-button cancel-button" onClick={cancelFreePlaceMode} title="Cancel free placement mode">
                    Cancel
                  </button>
                </>
              ) : isInMoveMode ? (
                <>
                  <button className="master-action-button add-button" onClick={finishMoveMode} title="Apply moves and exit move mode">
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
                  <button className="master-action-button delete-button" onClick={handleSubtract} title="Subtract items from boxes">
                    Subtract
                  </button>
                  <button className="master-action-button move-button" onClick={handleMove} title="Move items between boxes">
                    Move
                  </button>
                  <button className="master-action-button edit-button" onClick={handleEdit} title="Edit item">
                    Edit
                  </button>
                  <button className="master-action-button delete-button" onClick={handleDeleteItem} title="Remove this item from the master catalog and all locations">
                    Delete Master Item
                  </button>
                  <button className="master-action-button free-place-button" onClick={() => startFreePlaceMode(selectedMasterItem)} title="Place on room floor by coordinates">
                    Free place
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
