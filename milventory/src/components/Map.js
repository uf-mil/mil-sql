import React, { forwardRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import SOTItemPreview from './SOTItemPreview';
import ArrowConnections from './ArrowConnections';
import BoxInventoryOverlay from './BoxInventoryOverlay';
import AddModeArrow from './AddModeArrow';

const MapComponent = forwardRef((props, ref) => {
  const { worldRef, inventoryData, inventoryBounds, selectedBox, currentDragOverBox, handleBoxClick, handleBoxHover, handleBoxHoverLeave, handleDrop, setCurrentDragOverBox, addModeItem, addModePending, handleBoxClickAddMode } = useInventory();

  const handleBoxMouseEnter = (e, boxTitle) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wrap = e.currentTarget.closest('.wrap');
    if (wrap) {
      const wrapRect = wrap.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - wrapRect.left;
      const y = rect.top + rect.height / 2 - wrapRect.top;
      handleBoxHover(boxTitle, x, y);
    }
  };

  const handleDragEnter = (e, boxTitle) => {
    e.preventDefault();
    if (boxTitle !== currentDragOverBox) {
      setCurrentDragOverBox(boxTitle);
    }
  };

  const handleDragOver = (e, boxTitle) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (boxTitle !== currentDragOverBox) {
      setCurrentDragOverBox(boxTitle);
    }
  };

  const handleDragLeave = (e, boxTitle) => {
    const target = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    setTimeout(() => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      // Only remove if mouse is actually outside the box bounds
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        if (currentDragOverBox === boxTitle) {
          setCurrentDragOverBox(null);
        }
      }
    }, 0);
  };

  const handleDropBox = (e, boxTitle) => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(boxTitle);
    setCurrentDragOverBox(null);
  };

  const boxes = Array.from(inventoryData.values());
  
  // Default bounds if not loaded yet
  const viewBox = inventoryBounds?.viewBox 
    ? `${inventoryBounds.viewBox.x} ${inventoryBounds.viewBox.y} ${inventoryBounds.viewBox.width} ${inventoryBounds.viewBox.height}`
    : "0 0 2000 2200";
  
  const roomBounds = inventoryBounds?.room || {
    x: 80,
    y: 80,
    width: 1840,
    height: 2000,
    rx: 18,
    ry: 18
  };

  return (
    <>
      <svg ref={ref} className="map" viewBox={viewBox} aria-label="Room map">
        <g ref={worldRef} id="world">
          <rect className="room" x={roomBounds.x} y={roomBounds.y} width={roomBounds.width} height={roomBounds.height} rx={roomBounds.rx} ry={roomBounds.ry}/>
          
          {boxes.map((box, idx) => (
            <rect
              key={idx}
              className={`box ${!addModeItem && selectedBox === box.title ? 'selected' : ''} ${currentDragOverBox === box.title ? 'drag-over-box' : ''} ${addModeItem && addModePending.has(box.title) ? 'add-mode-affected' : ''}`}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={box.fill}
              data-title={box.title}
              onClick={(e) => {
                e.stopPropagation();
                if (addModeItem) {
                  handleBoxClickAddMode(box.title);
                } else {
                  handleBoxClick(box.title);
                }
              }}
              onMouseEnter={(e) => handleBoxMouseEnter(e, box.title)}
              onMouseLeave={handleBoxHoverLeave}
              onDragEnter={(e) => handleDragEnter(e, box.title)}
              onDragOver={(e) => handleDragOver(e, box.title)}
              onDragLeave={(e) => handleDragLeave(e, box.title)}
              onDrop={(e) => handleDropBox(e, box.title)}
            />
          ))}
          <ArrowConnections />
          <BoxInventoryOverlay />
          <AddModeArrow />
        </g>
      </svg>
      <SOTItemPreview />
    </>
  );
});

MapComponent.displayName = 'Map';

export default MapComponent;

