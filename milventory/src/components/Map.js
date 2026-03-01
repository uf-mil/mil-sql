import React, { forwardRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterItemPreview from './MasterItemPreview';
import ArrowConnections from './ArrowConnections';
import BoxInventoryOverlay from './BoxInventoryOverlay';
import AddModeArrow from './AddModeArrow';
import MoveModeBoxes from './MoveModeBoxes';

const SHELF_NAMES = [
  'Shelf 6 (Top)',
  'Shelf 5',
  'Shelf 4',
  'Shelf 3',
  'Shelf 2',
  'Shelf 1 (Bottom)'
];

const MapComponent = forwardRef((props, ref) => {
  const { worldRef, inventoryData, inventoryBounds, selectedBox, currentDragOverBox, handleBoxClick, handleBoxHover, handleBoxHoverLeave, handleDrop, setCurrentDragOverBox, addModeItem, addModePending, handleBoxClickAddMode, boxHasAnyPending, selectedMasterItem, getItemLocations, moveModeItem, moveModeDragging, handleMoveModeDrop } = useInventory();

  // Compute highlighted box set from selected Master item (for React-managed className)
  const highlightedBoxes = selectedMasterItem ? new Set(getItemLocations(selectedMasterItem)) : null;

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
    if (moveModeItem && moveModeDragging) {
      // In move mode, track drag over for move boxes
      if (boxTitle !== currentDragOverBox) {
        setCurrentDragOverBox(boxTitle);
      }
    } else {
      if (boxTitle !== currentDragOverBox) {
        setCurrentDragOverBox(boxTitle);
      }
    }
  };

  const handleDragOver = (e, boxTitle) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (moveModeItem && moveModeDragging) {
      // In move mode, track drag over for move boxes
      if (boxTitle !== currentDragOverBox) {
        setCurrentDragOverBox(boxTitle);
      }
    } else {
      if (boxTitle !== currentDragOverBox) {
        setCurrentDragOverBox(boxTitle);
      }
    }
  };

  const handleDragLeave = (e, boxTitle) => {
    const target = e.currentTarget;
    const clientX = e.clientX;
    const clientY = e.clientY;
    
    setTimeout(() => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
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
    if (moveModeItem && moveModeDragging) {
      // In move mode, handle drop for moving items
      // For Tall Cabinets, we need to determine which shelf was dropped on
      const boxData = inventoryData.get(boxTitle);
      let targetShelf = undefined;
      
      if (boxData && boxTitle.startsWith('Tall Cabinet') && worldRef.current) {
        // Calculate which shelf based on mouse position
        const svg = e.currentTarget.ownerSVGElement;
        if (svg) {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const ctm = worldRef.current.getScreenCTM();
          if (ctm) {
            const worldPt = pt.matrixTransform(ctm.inverse());
            const shelfH = boxData.height / SHELF_NAMES.length;
            const relativeY = worldPt.y - boxData.y;
            targetShelf = Math.max(0, Math.min(SHELF_NAMES.length - 1, Math.floor(relativeY / shelfH)));
          }
        }
      }
      
      handleMoveModeDrop(boxTitle, targetShelf);
      setCurrentDragOverBox(null);
    } else {
      handleDrop(boxTitle);
      setCurrentDragOverBox(null);
    }
  };

  const boxes = Array.from(inventoryData.values());
  
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

  // All Tall Cabinets get shelf overlays in add mode
  const tallCabinets = addModeItem
    ? boxes.filter(b => b.title.startsWith('Tall Cabinet'))
    : [];

  return (
    <>
      <svg ref={ref} className="map" viewBox={viewBox} aria-label="Room map">
        <g ref={worldRef} id="world">
          <rect className="room" x={roomBounds.x} y={roomBounds.y} width={roomBounds.width} height={roomBounds.height} rx={roomBounds.rx} ry={roomBounds.ry}/>
          
          {boxes.map((box, idx) => (
            <rect
              key={idx}
              className={`box ${!addModeItem && selectedBox === box.title ? 'selected' : ''} ${currentDragOverBox === box.title ? 'drag-over-box' : ''} ${addModeItem && boxHasAnyPending(box.title) ? 'add-mode-affected' : ''} ${highlightedBoxes && highlightedBoxes.has(box.title) ? 'box-highlighted' : ''}`}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={box.fill}
              data-title={box.title}
              onClick={(e) => {
                e.stopPropagation();
                if (addModeItem) {
                  // For Tall Cabinets, shelf rects on top handle clicks
                  if (!box.title.startsWith('Tall Cabinet')) {
                    handleBoxClickAddMode(box.title);
                  }
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

          {/* Shelf overlays for all Tall Cabinets in add mode — always visible */}
          {tallCabinets.map(box => {
            const shelfH = box.height / SHELF_NAMES.length;
            return (
              <g key={`shelves-${box.title}`} className="add-mode-shelf-group">
                {SHELF_NAMES.map((name, idx) => {
                  const shelfY = box.y + idx * shelfH;
                  const pendingKey = `${box.title}||${idx}`;
                  const isAffected = addModePending.has(pendingKey);
                  const pendingQty = addModePending.get(pendingKey);

                  return (
                    <g key={idx}>
                      <rect
                        className={`add-mode-shelf ${isAffected ? 'add-mode-shelf-affected' : ''}`}
                        x={box.x}
                        y={shelfY}
                        width={box.width}
                        height={shelfH}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBoxClickAddMode(box.title, idx);
                        }}
                      />
                      <text
                        className="add-mode-shelf-label"
                        x={box.x + box.width / 2}
                        y={shelfY + shelfH / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        pointerEvents="none"
                      >
                        {name}
                      </text>
                      {isAffected && (
                        <text
                          className="add-mode-shelf-qty"
                          x={box.x + box.width - 8}
                          y={shelfY + shelfH / 2}
                          textAnchor="end"
                          dominantBaseline="middle"
                          pointerEvents="none"
                        >
                          +{pendingQty}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          <ArrowConnections />
          <BoxInventoryOverlay />
          <AddModeArrow />
          <MoveModeBoxes />
        </g>
      </svg>
      <MasterItemPreview />
    </>
  );
});

MapComponent.displayName = 'Map';

export default MapComponent;
