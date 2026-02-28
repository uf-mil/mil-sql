import React, { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import AdminMap from './AdminMap';
import AdminLeftPanel from './AdminLeftPanel';
import AdminActionsPanel from './AdminActionsPanel';
import AddLocationModal from './AddLocationModal';
import LocationPreview from './LocationPreview';

const AdminDashboard = () => {
  const { wrapRef, leftPaneWidth, leftPaneCollapsed } = useInventory();
  const svgRef = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [drawnBox, setDrawnBox] = useState(null);
  const [previewBox, setPreviewBox] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const edgeDragHandlerRef = useRef(null);

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
    setPreviewBox(null);
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

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };

  const handleLocationDeselect = () => {
    setSelectedLocation(null);
  };

  const handleLocationDeleted = () => {
    setSelectedLocation(null);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      <AdminLeftPanel 
        key={refreshTrigger}
        selectedLocation={selectedLocation}
        onLocationSelect={handleLocationSelect}
      />
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
          selectedLocation={selectedLocation}
          onLocationSelect={handleLocationSelect}
          previewBox={previewBox}
          onPreviewEdgeDrag={(edges) => {
            // Update preview box state directly
            const newPreviewBox = {
              x: edges.leftX,
              y: edges.topY,
              width: edges.rightX - edges.leftX,
              height: edges.bottomY - edges.topY
            };
            setPreviewBox(newPreviewBox);
            // Also trigger form update via edge drag handler if available
            if (edgeDragHandlerRef.current) {
              edgeDragHandlerRef.current(edges);
            }
          }}
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
          leftPaneWidth={leftPaneWidth}
          leftPaneCollapsed={leftPaneCollapsed}
          onPreviewUpdate={setPreviewBox}
          previewBox={previewBox}
          onEdgeDrag={edgeDragHandlerRef}
        />
        <LocationPreview
          location={selectedLocation}
          onClose={handleLocationDeselect}
          onDelete={handleLocationDeleted}
          leftPaneWidth={leftPaneWidth}
          leftPaneCollapsed={leftPaneCollapsed}
        />
      </div>
    </>
  );
};

export default AdminDashboard;

