import React, { forwardRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterItemPreview from './MasterItemPreview';
import ArrowConnections from './ArrowConnections';
import BoxInventoryOverlay from './BoxInventoryOverlay';
import AddModeArrow from './AddModeArrow';
import MoveModeBoxes from './MoveModeBoxes';
import SubtractModePreview from './SubtractModePreview';

const SHELF_NAMES = [
  'Shelf 6 (Top)',
  'Shelf 5',
  'Shelf 4',
  'Shelf 3',
  'Shelf 2',
  'Shelf 1 (Bottom)'
];

const MapComponent = forwardRef((props, ref) => {
  const { worldRef, inventoryData, inventoryBounds, selectedBox, currentDragOverBox, handleBoxClick, handleBoxHover, handleBoxHoverLeave, handleDrop, setCurrentDragOverBox, addModeItem, addModePending, handleBoxClickAddMode, boxHasAnyPending, selectedMasterItem, getItemLocations, moveModeItem, moveModeDragging, handleMoveModeDrop, subtractModeItem, subtractModePending, handleBoxClickSubtractMode, boxHasAnySubtractPending } = useInventory();

  // Compute highlighted box set from selected Master item (for React-managed className)
  const highlightedBoxes = selectedMasterItem ? new Set(getItemLocations(selectedMasterItem)) : null;
  
  // Compute highlighted box set for subtract mode (all boxes containing the item)
  const subtractModeHighlightedBoxes = subtractModeItem ? new Set(getItemLocations(subtractModeItem)) : null;

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

  // All Tall Cabinets get shelf overlays in add mode, subtract mode, or move mode
  const tallCabinets = (addModeItem || subtractModeItem || moveModeItem)
    ? boxes.filter(b => b.title.startsWith('Tall Cabinet'))
    : [];

  return (
    <>
      <svg ref={ref} className="map" viewBox={viewBox} aria-label="Room map">
        <g ref={worldRef} id="world">
          <rect className="room" x={roomBounds.x} y={roomBounds.y} width={roomBounds.width} height={roomBounds.height} rx={roomBounds.rx} ry={roomBounds.ry}/>
          
          {boxes.map((box, idx) => {
            // For regular boxes (not Tall Cabinets), check if they have pending items
            const isRegularBox = !box.title.startsWith('Tall Cabinet');
            const hasAddPending = isRegularBox && addModeItem && addModePending.has(box.title);
            const addPendingQty = hasAddPending ? addModePending.get(box.title) : null;
            
            // For subtract mode, get current quantity, subtracted quantity, and remaining
            const hasSubtractPending = isRegularBox && subtractModeItem && subtractModePending.has(box.title);
            const subtractPendingQty = hasSubtractPending ? subtractModePending.get(box.title) : 0;
            const hasSubtractItem = isRegularBox && subtractModeItem && subtractModeHighlightedBoxes && subtractModeHighlightedBoxes.has(box.title);
            let currentQty = 0;
            let remainingQty = 0;
            if (subtractModeItem && isRegularBox) {
              const boxData = inventoryData.get(box.title);
              if (boxData) {
                const matchingItems = boxData.inventory.filter(item => item.name === subtractModeItem);
                currentQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
                remainingQty = Math.max(0, currentQty - subtractPendingQty);
              }
            }
            
            return (
              <g key={idx}>
                <rect
                  className={`box ${!addModeItem && !subtractModeItem && selectedBox === box.title ? 'selected' : ''} ${currentDragOverBox === box.title ? 'drag-over-box' : ''} ${addModeItem && boxHasAnyPending(box.title) ? 'add-mode-affected' : ''} ${subtractModeItem && (boxHasAnySubtractPending(box.title) || hasSubtractItem) ? 'add-mode-affected' : ''} ${highlightedBoxes && highlightedBoxes.has(box.title) ? 'box-highlighted' : ''}`}
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
                    } else if (subtractModeItem) {
                      // For Tall Cabinets, shelf rects on top handle clicks
                      if (!box.title.startsWith('Tall Cabinet')) {
                        handleBoxClickSubtractMode(box.title);
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
                {hasAddPending && (
                  <text
                    className="add-mode-shelf-qty"
                    x={box.x + box.width - 8}
                    y={box.y + box.height / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    +{addPendingQty}
                  </text>
                )}
                {hasSubtractItem && (
                  <text
                    className="add-mode-shelf-qty"
                    x={box.x + box.width - 8}
                    y={box.y + box.height / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    pointerEvents="none"
                    fill={hasSubtractPending ? "#ff6b6b" : "var(--accent)"}
                  >
                    {hasSubtractPending ? `${currentQty} / -${subtractPendingQty} / ${remainingQty}` : currentQty}
                  </text>
                )}
              </g>
            );
          })}

          {/* Shelf overlays for all Tall Cabinets in add mode, subtract mode, or move mode */}
          {tallCabinets.map(box => {
            const shelfH = box.height / SHELF_NAMES.length;
            return (
              <g key={`shelves-${box.title}`} className="add-mode-shelf-group">
                {SHELF_NAMES.map((name, idx) => {
                  const shelfY = box.y + idx * shelfH;
                  const pendingKey = `${box.title}||${idx}`;
                  const isAddAffected = addModeItem && addModePending.has(pendingKey);
                  const addPendingQty = addModePending.get(pendingKey);
                  
                  // For subtract mode, get current quantity, subtracted quantity, and remaining
                  const isSubtractAffected = subtractModeItem && subtractModePending.has(pendingKey);
                  const subtractPendingQty = isSubtractAffected ? subtractModePending.get(pendingKey) : 0;
                  let currentQty = 0;
                  let remainingQty = 0;
                  let hasSubtractItemOnShelf = false;
                  if (subtractModeItem) {
                    const boxData = inventoryData.get(box.title);
                    if (boxData) {
                      const matchingItems = boxData.inventory.filter(item => 
                        item.name === subtractModeItem && (item.shelf ?? 0) === idx
                      );
                      currentQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
                      remainingQty = Math.max(0, currentQty - subtractPendingQty);
                      hasSubtractItemOnShelf = currentQty > 0;
                    }
                  }
                  
                  const isAffected = isAddAffected || isSubtractAffected || hasSubtractItemOnShelf;

                  return (
                    <g key={idx}>
                      <rect
                        className={`add-mode-shelf ${isAffected ? 'add-mode-shelf-affected' : ''}`}
                        x={box.x}
                        y={shelfY}
                        width={box.width}
                        height={shelfH}
                        onClick={(addModeItem || subtractModeItem) ? (e) => {
                          e.stopPropagation();
                          if (addModeItem) {
                            handleBoxClickAddMode(box.title, idx);
                          } else if (subtractModeItem) {
                            handleBoxClickSubtractMode(box.title, idx);
                          }
                        } : undefined}
                        style={moveModeItem ? { pointerEvents: 'none' } : undefined}
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
                      {isAddAffected && (
                        <text
                          className="add-mode-shelf-qty"
                          x={box.x + box.width - 8}
                          y={shelfY + shelfH / 2}
                          textAnchor="end"
                          dominantBaseline="middle"
                          pointerEvents="none"
                        >
                          +{addPendingQty}
                        </text>
                      )}
                      {hasSubtractItemOnShelf && (
                        <text
                          className="add-mode-shelf-qty"
                          x={box.x + box.width - 8}
                          y={shelfY + shelfH / 2}
                          textAnchor="end"
                          dominantBaseline="middle"
                          pointerEvents="none"
                          fill={isSubtractAffected ? "#ff6b6b" : "var(--accent)"}
                        >
                          {isSubtractAffected ? `${currentQty} / -${subtractPendingQty} / ${remainingQty}` : currentQty}
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
      <SubtractModePreview />
    </>
  );
});

MapComponent.displayName = 'Map';

export default MapComponent;
