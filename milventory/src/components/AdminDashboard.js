import React, { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import AdminMap from './AdminMap';
import AdminLeftPanel from './AdminLeftPanel';
import AdminActionsPanel from './AdminActionsPanel';
import AddLocationModal from './AddLocationModal';

const AdminDashboard = () => {
  const { wrapRef } = useInventory();
  const svgRef = useRef(null);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAddLocation = () => {
    setShowAddLocationModal(true);
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
        </div>
        <AdminMap ref={svgRef} />
        <AdminActionsPanel 
          onAddLocation={handleAddLocation}
        />
        <AddLocationModal
          isOpen={showAddLocationModal}
          onClose={() => setShowAddLocationModal(false)}
          onSuccess={handleLocationAdded}
        />
      </div>
    </>
  );
};

export default AdminDashboard;

