import React from 'react';
import { useInventory, FREE_SUBTRACT_DOT_PREFIX } from '../../context/InventoryContext';

const SubtractModePreview = () => {
  const {
    subtractModeItem,
    subtractModeQtyPerClick,
    setSubtractModeQtyPerClick,
    subtractModePending,
    finishSubtractMode,
    cancelSubtractMode,
    leftPaneWidth,
    leftPaneCollapsed,
    resolveMasterItem,
    subtractModePreviewRef,
    freePlacementsBySupplyPublicId
  } = useInventory();

  const item = subtractModeItem ? resolveMasterItem(subtractModeItem) : null;

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const handleQtyChange = (delta) => {
    setSubtractModeQtyPerClick(prev => Math.max(1, prev + delta));
  };

  const handleFinish = () => {
    finishSubtractMode();
  };

  const handleCancel = () => {
    cancelSubtractMode();
  };

  if (!subtractModeItem || !item) return null;

  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  const pendingCount = Array.from(subtractModePending.values()).reduce((sum, qty) => sum + qty, 0);
  const pendingEntries = Array.from(subtractModePending.entries());

  // Format a pending key for display
  const formatPendingKey = (key) => {
    const parts = key.split('||');
    if (parts[0] === FREE_SUBTRACT_DOT_PREFIX && parts[1] != null && parts[1] !== '') {
      const id = parseInt(parts[1], 10);
      const placements = freePlacementsBySupplyPublicId.get(subtractModeItem) || [];
      const dot = placements.find((p) => p.id === id);
      if (dot) return `Floor (${Math.round(dot.x)}, ${Math.round(dot.y)})`;
      return 'Floor placement';
    }
    if (parts.length > 1) {
      const shelfIdx = parseInt(parts[1], 10);
      return `${parts[0]} → ${SHELF_NAMES[shelfIdx] || `Shelf ${shelfIdx}`}`;
    }
    return parts[0];
  };

  return (
    <div
      ref={subtractModePreviewRef}
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
          <h3>Subtract: {item.name}</h3>
          <button
            className="master-preview-pane-close"
            onClick={handleCancel}
            title="Cancel"
          >
            ×
          </button>
        </div>
        
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
          Click boxes or <strong>floor markers</strong> to queue subtractions (same qty per click). Use <strong>Finish Subtract</strong> to apply, or <strong>Cancel</strong> to discard all pending.
        </p>
        <div className="add-mode-qty-field">
          <label>Qty subtracted per click:</label>
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
              value={subtractModeQtyPerClick}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setSubtractModeQtyPerClick(Math.max(1, val));
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
            <strong>Pending subtractions:</strong>
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
            Finish Subtract
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubtractModePreview;

