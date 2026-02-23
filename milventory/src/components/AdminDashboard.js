import React, { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import AdminMap from './AdminMap';
import AdminLeftPanel from './AdminLeftPanel';
import AdminActionsPanel from './AdminActionsPanel';
import AddLocationModal from './AddLocationModal';

const AdminDashboard = () => {
  const { wrapRef } = useInventory();
  const svgRef = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [drawnBox, setDrawnBox] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAddLocation = () => {
    setDrawMode(true);
  };

  const handleDrawComplete = (box) => {
    setDrawnBox(box);
    setDrawMode(false);
    setShowAddLocationModal(true);
  };

  const handleModalClose = () => {
    setShowAddLocationModal(false);
    setDrawnBox(null);
    setDrawMode(false);
  };

  const handleLocationAdded = () => {
    // Trigger refresh of components
    setRefreshTrigger(prev => prev + 1);
    // Reload page after a short delay to ensure backend has synced JSON
    // The JSON file is synced by sync_locations_json() when location is created
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <>
      <AdminLeftPanel key={refreshTrigger} />
      <div className="wrap" ref={wrapRef}>
        <div className="titlebar">
          Admin Dashboard
          {drawMode && (
            <span style={{ 
              marginLeft: '1rem', 
              color: 'var(--accent)',
              fontWeight: '600'
            }}>
              Draw Mode: Drag on map to create a box
            </span>
          )}
        </div>
        <AdminMap 
          ref={svgRef} 
          drawMode={drawMode}
          onDrawComplete={handleDrawComplete}
        />
        <AdminActionsPanel 
          onAddLocation={handleAddLocation}
          drawMode={drawMode}
          onCancelDraw={() => setDrawMode(false)}
        />
        <AddLocationModal
          isOpen={showAddLocationModal}
          onClose={handleModalClose}
          onSuccess={handleLocationAdded}
          initialBox={drawnBox}
        />
      </div>
    </>
  );
};

export default AdminDashboard;

