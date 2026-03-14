import React, { useState } from 'react';
import { admin } from '../../api';

const MoveLocationsModal = ({ 
  moveMode, 
  selectedBoxes, 
  transform, 
  onTransformChange, 
  onSelectBoxes, 
  onCancel, 
  onApply 
}) => {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  if (moveMode === 'idle') return null;

  const handleTransformXChange = (e) => {
    const val = e.target.value;
    // Allow empty, minus sign, or valid number
    if (val === '' || val === '-') {
      onTransformChange({ ...transform, x: val });
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      onTransformChange({ ...transform, x: num });
    }
  };

  const handleTransformYChange = (e) => {
    const val = e.target.value;
    if (val === '' || val === '-') {
      onTransformChange({ ...transform, y: val });
      return;
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      onTransformChange({ ...transform, y: num });
    }
  };

  const handleApply = async () => {
    const dx = typeof transform.x === 'number' ? transform.x : 0;
    const dy = typeof transform.y === 'number' ? transform.y : 0;
    if (dx === 0 && dy === 0) {
      setError('No transform to apply');
      return;
    }

    setApplying(true);
    setError(null);

    try {
      // Update each selected box's position via API
      for (const box of selectedBoxes) {
        await admin.updateLocation(box.name, {
          x: Math.round(box.x + dx),
          y: Math.round(box.y + dy)
        });
      }
      onApply();
    } catch (err) {
      setError(err.message || 'Failed to apply move');
    } finally {
      setApplying(false);
    }
  };

  const dx = typeof transform.x === 'number' ? transform.x : 0;
  const dy = typeof transform.y === 'number' ? transform.y : 0;

  return (
    <div className="move-locations-modal">
      <div className="move-modal-header">
        <h3>Move Locations</h3>
        <button className="move-modal-close" onClick={onCancel}>✕</button>
      </div>

      {error && (
        <div style={{
          background: '#dc3545',
          color: 'white',
          padding: '0.4rem 0.6rem',
          borderRadius: '4px',
          marginBottom: '0.5rem',
          fontSize: '0.8rem'
        }}>
          {error}
        </div>
      )}

      {/* State 1: Only select button */}
      {moveMode === 'selecting' && selectedBoxes.length === 0 && (
        <div className="move-modal-body">
          <p className="move-modal-hint">
            Drag on the map to select boxes to move.
          </p>
          <button
            className="move-modal-select-btn"
            onClick={onSelectBoxes}
          >
            Select Boxes to Move
          </button>
        </div>
      )}

      {/* State 2: Boxes selected - show names + transform fields */}
      {moveMode === 'moving' && selectedBoxes.length > 0 && (
        <div className="move-modal-body">
          <div className="move-modal-selected">
            <label className="move-modal-label">Selected ({selectedBoxes.length})</label>
            <div className="move-modal-box-list">
              {selectedBoxes.map(box => (
                <span key={box.name} className="move-modal-box-tag">
                  {box.name}
                </span>
              ))}
            </div>
          </div>

          <div className="move-modal-transform">
            <label className="move-modal-label">Transform</label>
            <div className="move-modal-transform-fields">
              <div className="move-modal-field">
                <span className="move-modal-field-label">X</span>
                <input
                  type="text"
                  value={transform.x}
                  onChange={handleTransformXChange}
                  className="move-modal-input"
                  placeholder="0"
                />
              </div>
              <div className="move-modal-field">
                <span className="move-modal-field-label">Y</span>
                <input
                  type="text"
                  value={transform.y}
                  onChange={handleTransformYChange}
                  className="move-modal-input"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="move-modal-preview-coords">
              {selectedBoxes.slice(0, 3).map(box => (
                <div key={box.name} className="move-modal-coord-row">
                  <span className="move-modal-coord-name">{box.name}</span>
                  <span className="move-modal-coord-val">
                    ({box.x}, {box.y}) → ({Math.round(box.x + dx)}, {Math.round(box.y + dy)})
                  </span>
                </div>
              ))}
              {selectedBoxes.length > 3 && (
                <div className="move-modal-coord-row" style={{ color: 'var(--muted)' }}>
                  ...and {selectedBoxes.length - 3} more
                </div>
              )}
            </div>
          </div>

          <div className="move-modal-actions">
            <button
              className="move-modal-apply-btn"
              onClick={handleApply}
              disabled={applying || (dx === 0 && dy === 0)}
            >
              {applying ? 'Applying...' : 'Apply Move'}
            </button>
            <button
              className="move-modal-cancel-btn"
              onClick={onCancel}
              disabled={applying}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Selecting state but back from map with 0 boxes (shouldn't happen often) */}
      {moveMode === 'selecting' && selectedBoxes.length > 0 && (
         <div className="move-modal-body">
           <p className="move-modal-hint">Boxes selected, preparing...</p>
         </div>
      )}
    </div>
  );
};

export default MoveLocationsModal;

