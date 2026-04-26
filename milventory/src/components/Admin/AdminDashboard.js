import React, { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import AdminMap from './AdminMap';
import AdminLeftPanel from './AdminLeftPanel';
import AdminActionsPanel from './AdminActionsPanel';
import AddLocationModal from './AddLocationModal';
import LocationPreview from './LocationPreview';
import MoveLocationsModal from './MoveLocationsModal';
import HistoryModal from '../History/HistoryModal';
import ErrorToast from '../Common/ErrorToast';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { wrapRef, leftPaneWidth, leftPaneCollapsed, dismissMasterWorkbenchUI, error, setError } = useInventory();
  const svgRef = useRef(null);
  const [drawMode, setDrawMode] = useState(false);
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [drawnBox, setDrawnBox] = useState(null);
  const [previewBox, setPreviewBox] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const edgeDragHandlerRef = useRef(null);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Move mode state
  // 'idle' | 'selecting' | 'moving'
  const [moveMode, setMoveMode] = useState('idle');
  const [moveSelectedBoxes, setMoveSelectedBoxes] = useState([]); // [{name, x, y, width, height, ...}]
  const [moveTransform, setMoveTransform] = useState({ x: 0, y: 0 }); // current dx, dy offset

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
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };

  const handleLocationDeselect = () => {
    if (isEditingLocation) {
      // If editing, cancel edit first
      setIsEditingLocation(false);
      setPreviewBox(null);
    }
    setSelectedLocation(null);
  };

  const handleLocationDeleted = () => {
    setSelectedLocation(null);
    setRefreshTrigger(prev => prev + 1);
  };

  // Edit mode handlers for LocationPreview
  const handleEditStart = useCallback(() => {
    setIsEditingLocation(true);
  }, []);

  const handleEditEnd = useCallback(() => {
    setIsEditingLocation(false);
    setPreviewBox(null);
  }, []);

  // Move mode handlers
  const handleStartMove = useCallback(() => {
    setMoveMode('selecting');
    setMoveSelectedBoxes([]);
    setMoveTransform({ x: 0, y: 0 });
    setSelectedLocation(null);
  }, []);

  const handleSelectBoxes = useCallback(() => {
    // Transition from modal state to actual rectangle selection on map
    setMoveMode('selecting');
  }, []);

  const handleBoxesSelected = useCallback((boxes) => {
    setMoveSelectedBoxes(boxes);
    setMoveMode('moving');
    setMoveTransform({ x: 0, y: 0 });
  }, []);

  const handleMoveTransformChange = useCallback((newTransform) => {
    setMoveTransform(newTransform);
  }, []);

  const handleCancelMove = useCallback(() => {
    setMoveMode('idle');
    setMoveSelectedBoxes([]);
    setMoveTransform({ x: 0, y: 0 });
  }, []);

  const handleApplyMove = useCallback(() => {
    // Applied successfully from the modal - refresh
    setMoveMode('idle');
    setMoveSelectedBoxes([]);
    setMoveTransform({ x: 0, y: 0 });
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }, []);

  const isInMoveMode = moveMode !== 'idle';

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
          <span style={{ float: 'right', marginRight: '1rem' }}>
            <button
              onClick={() => {
                void dismissMasterWorkbenchUI().then(() => setShowHistoryModal(true));
              }}
              style={{
                marginRight: '0.5rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: 'rgba(0,0,0,.3)',
                color: 'var(--text, #e6ebf4)',
                border: '1px solid rgba(255,255,255,.15)',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,.3)';
              }}
            >
              View History
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: 'var(--accent, #4a9eff)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              }}
            >
              Master Inventory
            </button>
          </span>
          {drawMode && (
            <span style={{ 
              marginLeft: '1rem', 
              color: 'var(--accent)',
              fontWeight: '600'
            }}>
              Draw Mode: Drag on map to create a box
            </span>
          )}
          {isEditingLocation && (
            <span style={{ 
              marginLeft: '1rem', 
              color: 'var(--accent)',
              fontWeight: '600'
            }}>
              Edit Mode: Drag edges to resize
            </span>
          )}
          {moveMode === 'selecting' && (
            <span style={{ 
              marginLeft: '1rem', 
              color: '#ffc107',
              fontWeight: '600'
            }}>
              Move Mode: Drag on map to select boxes
            </span>
          )}
          {moveMode === 'moving' && (
            <span style={{ 
              marginLeft: '1rem', 
              color: '#ffc107',
              fontWeight: '600'
            }}>
              Move Mode: Drag selected boxes or type transform values
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
            const newPreviewBox = {
              x: edges.leftX,
              y: edges.topY,
              width: edges.rightX - edges.leftX,
              height: edges.bottomY - edges.topY
            };
            setPreviewBox(newPreviewBox);
            if (edgeDragHandlerRef.current) {
              edgeDragHandlerRef.current(edges);
            }
          }}
          moveMode={moveMode}
          moveSelectedBoxes={moveSelectedBoxes}
          moveTransform={moveTransform}
          onBoxesSelected={handleBoxesSelected}
          onMoveTransformChange={handleMoveTransformChange}
        />
        <AdminActionsPanel 
          onAddLocation={handleAddLocation}
          drawMode={drawMode}
          onCancelDraw={() => setDrawMode(false)}
          onStartMove={handleStartMove}
          isInMoveMode={isInMoveMode}
        />
        <MoveLocationsModal
          moveMode={moveMode}
          selectedBoxes={moveSelectedBoxes}
          transform={moveTransform}
          onTransformChange={handleMoveTransformChange}
          onSelectBoxes={handleSelectBoxes}
          onCancel={handleCancelMove}
          onApply={handleApplyMove}
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
          onEditStart={handleEditStart}
          onEditEnd={handleEditEnd}
          onPreviewUpdate={setPreviewBox}
          onEdgeDrag={edgeDragHandlerRef}
        />
        <HistoryModal 
          isOpen={showHistoryModal} 
          onClose={() => setShowHistoryModal(false)} 
          isAdmin={true}
        />
        <ErrorToast error={error} onClose={() => setError(null)} />
      </div>
    </>
  );
};

export default AdminDashboard;
