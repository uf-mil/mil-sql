import React from 'react';

const AdminActionsPanel = ({ onAddLocation }) => {
  return (
    <div className="admin-actions-panel">
      <div className="admin-actions-header">
        <h3>Actions</h3>
      </div>
      <div className="admin-actions-content">
        <button 
          className="admin-action-button"
          onClick={onAddLocation}
        >
          Add Location
        </button>
      </div>
    </div>
  );
};

export default AdminActionsPanel;

