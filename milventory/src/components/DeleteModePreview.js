import React from 'react';
import { useInventory } from '../context/InventoryContext';

const DeleteModePreview = () => {
  const {
    deleteModeItem,
    deleteModeQtyPerClick,
    setDeleteModeQtyPerClick,
    deleteModePending,
    finishDeleteMode,
    cancelDeleteMode,
    leftPaneWidth,
    leftPaneCollapsed,
    resolveMasterItem,
    deleteModePreviewRef
  } = useInventory();

  const item = deleteModeItem ? resolveMasterItem(deleteModeItem) : null;

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const handleQtyChange = (delta) => {
    setDeleteModeQtyPerClick(prev => Math.max(1, prev + delta));
  };

  const handleFinish = () => {
    finishDeleteMode();
  };

  const handleCancel = () => {
    cancelDeleteMode();
  };

  if (!deleteModeItem || !item) return null;

  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  const pendingCount = Array.from(deleteModePending.values()).reduce((sum, qty) => sum + qty, 0);
  const pendingEntries = Array.from(deleteModePending.entries());

  // Format a pending key for display
  const formatPendingKey = (key) => {
    const parts = key.split('||');
    if (parts.length > 1) {
      const shelfIdx = parseInt(parts[1], 10);
      return `${parts[0]} → ${SHELF_NAMES[shelfIdx] || `Shelf ${shelfIdx}`}`;
    }
    return parts[0];
  };

  return (
    <div
      ref={deleteModePreviewRef}
      className="master-preview-pane-overlay"
      style={{
        position: 'fixed',
        left: `${positionX}px`,
        top: `${positionY}px`,
        zIndex: 1000
      }}
    >
      <div className="master-preview-pane add-mode-pane">
        <div className="master-preview-pane-header">
          <h3>Delete: {item.name}</h3>
          <button
            className="master-preview-pane-close"
            onClick={handleCancel}
            title="Cancel"
          >
            ×
          </button>
        </div>
        
        <div className="add-mode-qty-field">
          <label>Qty deleted per click:</label>
          <div className="number-input-wrapper">
            <button
              className="number-input-btn"
              onClick={() => handleQtyChange(-1)}
              type="button"
            >
              −
            </button>
            <input
              type="number"
              className="number-input"
              value={deleteModeQtyPerClick}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setDeleteModeQtyPerClick(Math.max(1, val));
              }}
              min="1"
            />
            <button
              className="number-input-btn"
              onClick={() => handleQtyChange(1)}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        {pendingEntries.length > 0 && (
          <div className="add-mode-pending">
            <strong>Pending deletions:</strong>
            <ul>
              {pendingEntries.map(([key, qty]) => (
                <li key={key}>
                  {formatPendingKey(key)}: -{qty}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Total: {pendingCount} items
            </div>
          </div>
        )}

        <div className="add-mode-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleFinish}>
            Finish Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModePreview;



