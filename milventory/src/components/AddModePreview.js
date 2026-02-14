import React from 'react';
import { useInventory } from '../context/InventoryContext';

const AddModePreview = () => {
  const {
    addModeItem,
    addModeQtyPerClick,
    setAddModeQtyPerClick,
    addModePending,
    finishAddMode,
    cancelAddMode,
    leftPaneWidth,
    leftPaneCollapsed,
    resolveSOTItem,
    addModePreviewRef
  } = useInventory();

  const item = addModeItem ? resolveSOTItem(addModeItem) : null;

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const handleQtyChange = (delta) => {
    setAddModeQtyPerClick(prev => Math.max(1, prev + delta));
  };

  const handleFinish = () => {
    finishAddMode();
  };

  const handleCancel = () => {
    cancelAddMode();
  };

  if (!addModeItem || !item) return null;

  const pendingCount = Array.from(addModePending.values()).reduce((sum, qty) => sum + qty, 0);
  const pendingBoxes = Array.from(addModePending.entries());

  return (
    <div
      ref={addModePreviewRef}
      className="sot-preview-pane-overlay"
      style={{
        position: 'fixed',
        left: `${positionX}px`,
        top: `${positionY}px`,
        zIndex: 1000
      }}
    >
      <div className="sot-preview-pane add-mode-pane">
        <div className="sot-preview-pane-header">
          <h3>Add: {item.name}</h3>
          <button
            className="sot-preview-pane-close"
            onClick={handleCancel}
            title="Cancel"
          >
            ×
          </button>
        </div>
        
        <div className="add-mode-qty-field">
          <label>Qty added per click:</label>
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
              value={addModeQtyPerClick}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setAddModeQtyPerClick(Math.max(1, val));
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

        {pendingBoxes.length > 0 && (
          <div className="add-mode-pending">
            <strong>Pending additions:</strong>
            <ul>
              {pendingBoxes.map(([boxTitle, qty]) => (
                <li key={boxTitle}>
                  {boxTitle}: +{qty}
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
            Finish Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddModePreview;

