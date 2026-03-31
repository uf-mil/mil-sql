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
  const [freeCoordsOpen, setFreeCoordsOpen] = useState(true);
  /** 'landscape' = wider or square → image below text; 'portrait' = taller → image right */
  const [descImageLayout, setDescImageLayout] = useState('landscape');

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

  // Box/shelf locations (with qty); free coordinates listed separately (always one unit per coordinate)
  const boxLocationDetails = [];
  const freeCoordinatePairs = [];
  if (selectedMasterItem) {
    locations.forEach(boxTitle => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;
      const matchingItems = boxData.inventory.filter(i => i.name === selectedMasterItem);
      if (boxTitle.startsWith('Tall Cabinet')) {
        matchingItems.forEach(i => {
          const shelfIdx = i.shelf ?? 0;
          const shelfName = SHELF_NAMES[shelfIdx] || `Shelf ${shelfIdx}`;
          boxLocationDetails.push({ label: `${boxTitle} → ${shelfName}`, qty: i.qty });
        });
      } else {
        const totalQty = matchingItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        boxLocationDetails.push({ label: boxTitle, qty: totalQty });
      }
    });
    const freeDots = freePlacementsBySupplyName.get(selectedMasterItem) || [];
    freeDots.forEach((p) => {
      freeCoordinatePairs.push({ x: Math.round(p.x), y: Math.round(p.y) });
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

  const hasDescriptionText = Boolean(item?.description);
  const hasPreviewImage = Boolean(item?.image);

  useEffect(() => {
    setDescImageLayout('landscape');
  }, [selectedMasterItem, item?.image]);

  useEffect(() => {
    if (!selectedMasterItem) setEditingItem(null);
  }, [selectedMasterItem]);

  if (!selectedMasterItem || !item) return null;

  const descriptionLayout =
    hasPreviewImage && hasDescriptionText ? descImageLayout : hasPreviewImage ? 'landscape' : 'text-only';

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
          {(hasDescriptionText || hasPreviewImage) && (
            <div className="master-preview-description">
              <strong>{hasDescriptionText ? 'Description:' : 'Image:'}</strong>
              <div className={`master-preview-description-body master-preview-description-body--${descriptionLayout}`}>
                {hasDescriptionText && (
                  <div className="master-preview-description-text">
                    <p>{item.description}</p>
                  </div>
                )}
                {hasPreviewImage && (
                  <div className="master-preview-description-image">
                    <img
                      src={item.image}
                      alt={item.name}
                      onLoad={(e) => {
                        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                        if (w > 0 && h > 0) {
                          setDescImageLayout(h > w ? 'portrait' : 'landscape');
                        }
                      }}
                    />
                  </div>
                )}
              </div>
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
            {boxLocationDetails.length === 0 && freeCoordinatePairs.length === 0 ? (
              <div className="master-preview-location-item">No locations</div>
            ) : (
              <>
                {boxLocationDetails.map((loc, idx) => (
                  <div key={idx} className="master-preview-location-item">
                    {loc.label}{' '}
                    <span className="master-preview-location-qty">(Qty: {loc.qty})</span>
                  </div>
                ))}
                {freeCoordinatePairs.length > 0 && (
                  <div className="master-preview-free-coords-group">
                    <button
                      type="button"
                      className="master-preview-location-item master-preview-locations-row-button"
                      onClick={() => setFreeCoordsOpen((o) => !o)}
                      aria-expanded={freeCoordsOpen}
                      aria-label={
                        freeCoordsOpen
                          ? 'Collapse free coordinates'
                          : 'Expand free coordinates'
                      }
                    >
                      Free Coordinates{' '}
                      <span className="master-preview-location-qty">
                        (Qty: {freeCoordinatePairs.length})
                      </span>
                    </button>
                    {freeCoordsOpen && (
                      <ul className="master-preview-free-coords-list">
                        {freeCoordinatePairs.map((c, idx) => (
                          <li
                            key={`${c.x}-${c.y}-${idx}`}
                            className="master-preview-free-coord-item"
                          >
                            ({c.x}, {c.y})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
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
              <p className="master-preview-actions-hint master-preview-free-place-hint">
                Click the room floor to add an instance of the item. Drag to reposition, double-click to remove.  Cancel discards all changes.
              </p>
            )}
            {isInMoveMode && (
              <p className="master-preview-actions-hint">
                Box drops update the map only until you choose Apply Move, which saves box and floor moves. Cancel Move reloads from the server and discards unsaved changes.
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
