import React from 'react';

const AdminActionsPanel = ({ onAddLocation, drawMode, onCancelDraw }) => {
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
          <button 
            className="admin-action-button"
            onClick={onAddLocation}
          >
            Add Location
          </button>
        )}
      </div>
    </div>
  );
};

export default AdminActionsPanel;

