import React from 'react';

const AdminActionsPanel = ({ onAddLocation, drawMode, onCancelDraw, onStartMove, isInMoveMode }) => {
  return (
    <div className="admin-actions-panel">
      <div className="admin-actions-header">
        <h3>Actions</h3>
      </div>
      <div className="admin-actions-content">
        {drawMode ? (
          <button 
            className="admin-action-button cancel"
            onClick={onCancelDraw}
            style={{ background: '#dc3545' }}
          >
            Cancel Draw
          </button>
        ) : (
          <>
            <button 
              className="admin-action-button"
              onClick={onAddLocation}
              disabled={isInMoveMode}
              style={isInMoveMode ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              Add Location
            </button>
            <button 
              className="admin-action-button"
              onClick={onStartMove}
              disabled={isInMoveMode}
              style={{ 
                background: isInMoveMode ? 'rgba(255,193,7,0.5)' : '#ffc107',
                color: '#1a1a2e',
                cursor: isInMoveMode ? 'not-allowed' : 'pointer'
              }}
            >
              Move Locations
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminActionsPanel;

