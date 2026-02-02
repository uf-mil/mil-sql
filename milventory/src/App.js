import React from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import MapComponent from './components/Map';
import RightPanel from './components/RightPanel';
import Tooltip from './components/Tooltip';
import AddModal from './components/AddModal';

function App() {
  return (
    <InventoryProvider>
      <AppContent />
    </InventoryProvider>
  );
}

function AppContent() {
  const { wrapRef, svgRef } = useInventory();

  return (
    <>
      <div className="wrap" ref={wrapRef}>
        <div className="titlebar">
          Zoom: <span className="kbd">wheel</span> · Pan: <span className="kbd">drag</span> · Hover for name · Click for details
        </div>
        <MapComponent ref={svgRef} />
        <Tooltip />
      </div>
      <RightPanel />
      <AddModal />
    </>
  );
}

export default App;

