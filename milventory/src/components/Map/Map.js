import React, { forwardRef, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import MasterItemPreview from '../Master/MasterItemPreview';
import ArrowConnections from './ArrowConnections';
import BoxInventoryOverlay from './BoxInventoryOverlay';
import AddModeArrow from './AddModeArrow';
import MoveModeBoxes from './MoveModeBoxes';
import SubtractModePreview from './SubtractModePreview';
import FreePlaceDots from './FreePlaceDots';
import { svgMarkupToDataUrl } from '../../utils/svgDataUrl';
import { hasShelves, getShelfCount, getShelfLabels } from '../../utils/shelfLabels';

function inventoryRowMatchesSupplyPublicId(invItem, supplyPublicId) {
  if (!supplyPublicId) return false;
  const k =
    invItem.supplyPublicId ||
    (invItem.supplyId != null ? `__legacy_id_${invItem.supplyId}` : null);
  return k === supplyPublicId;
}

const MapComponent = forwardRef((props, ref) => {
  const {
    worldRef,
    inventoryData,
    inventoryBounds,
    selectedBox,
    currentDragOverBox,
    handleBoxClick,
    handleBoxHover,
    handleBoxHoverLeave,
    handleDrop,
    setCurrentDragOverBox,
    addModeItem,
    addModePending,
    handleBoxClickAddMode,
    boxHasAnyPending,
    selectedMasterItem,
    getItemLocations,
    moveModeItem,
    moveModeDragging,
    handleMoveModeDrop,
    subtractModeItem,
    subtractModePending,
    handleBoxClickSubtractMode,
    boxHasAnySubtractPending,
    freePlaceModeItem,
    handleFreePlaceWorldClick
  } = useInventory();

  const freePlaceRoomPointerRef = useRef(null);

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
      
      if (boxData && hasShelves(boxData) && worldRef.current) {
        const shelfCount = getShelfCount(boxData);
        const svg = e.currentTarget.ownerSVGElement;
        if (svg) {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const ctm = worldRef.current.getScreenCTM();
          if (ctm) {
            const worldPt = pt.matrixTransform(ctm.inverse());
            const shelfH = boxData.height / shelfCount;
            const relativeY = worldPt.y - boxData.y;
            targetShelf = Math.max(0, Math.min(shelfCount - 1, Math.floor(relativeY / shelfH)));
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

  const onFreePlaceRoomPointerDown = (e) => {
    if (!freePlaceModeItem || e.button !== 0) return;
    freePlaceRoomPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const onFreePlaceRoomClick = (e) => {
    if (!freePlaceModeItem || !worldRef.current || !handleFreePlaceWorldClick) return;
    if (e.button !== 0) return;
    const start = freePlaceRoomPointerRef.current;
    freePlaceRoomPointerRef.current = null;
    if (start) {
      const d = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (d > 12) return;
    }
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = worldRef.current.getScreenCTM();
    if (!ctm) return;
    const w = pt.matrixTransform(ctm.inverse());
    void handleFreePlaceWorldClick(w.x, w.y);
  };

  const boxPointerBlockFreePlace = freePlaceModeItem ? { pointerEvents: 'none' } : undefined;

  // Boxes with shelves get shelf overlays in add/subtract/move mode
  const shelvedBoxes = (addModeItem || subtractModeItem || moveModeItem)
    ? boxes.filter(hasShelves)
    : [];

  return (
    <>
      <svg ref={ref} className="map" viewBox={viewBox} aria-label="Room map">
        <g ref={worldRef} id="world">
          <rect
            className={`room${freePlaceModeItem ? ' room-free-place-active' : ''}`}
            x={roomBounds.x}
            y={roomBounds.y}
            width={roomBounds.width}
            height={roomBounds.height}
            rx={roomBounds.rx}
            ry={roomBounds.ry}
            style={freePlaceModeItem ? { cursor: 'crosshair' } : undefined}
            onPointerDown={onFreePlaceRoomPointerDown}
            onClick={onFreePlaceRoomClick}
          />
          
          {boxes.map((box, idx) => {
            // For boxes without shelves, show box-level pending/subtract badges.
            // Shelved boxes get per-shelf overlays rendered separately below.
            const isRegularBox = !hasShelves(box);
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
                const matchingItems = boxData.inventory.filter((item) =>
                  inventoryRowMatchesSupplyPublicId(item, subtractModeItem)
                );
                currentQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
                remainingQty = Math.max(0, currentQty - subtractPendingQty);
              }
            }
            
            const svgHref = box.svgMarkup ? svgMarkupToDataUrl(box.svgMarkup) : null;

            return (
              <g key={idx}>
                {svgHref ? (
                  <image
                    href={svgHref}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    preserveAspectRatio="xMidYMid meet"
                    pointerEvents="none"
                  />
                ) : null}
                <rect
                  className={`box ${!addModeItem && !subtractModeItem && selectedBox === box.title ? 'selected' : ''} ${currentDragOverBox === box.title ? 'drag-over-box' : ''} ${addModeItem && boxHasAnyPending(box.title) ? 'add-mode-affected' : ''} ${subtractModeItem && (boxHasAnySubtractPending(box.title) || hasSubtractItem) ? 'add-mode-affected' : ''} ${highlightedBoxes && highlightedBoxes.has(box.title) ? 'box-highlighted' : ''}`}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill={svgHref ? 'transparent' : box.fill}
                  data-title={box.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (addModeItem) {
                      // Shelved boxes delegate clicks to per-shelf rects overlaid on top.
                      if (!hasShelves(box)) {
                        handleBoxClickAddMode(box.title);
                      }
                    } else if (subtractModeItem) {
                      if (!hasShelves(box)) {
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
                  style={boxPointerBlockFreePlace}
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

          {/* Shelf overlays for every box with shelves in add/subtract/move mode */}
          {shelvedBoxes.map(box => {
            const shelfCount = getShelfCount(box);
            const shelfH = box.height / shelfCount;
            const shelfLabels = getShelfLabels(shelfCount);
            return (
              <g key={`shelves-${box.title}`} className="add-mode-shelf-group">
                {shelfLabels.map((name, idx) => {
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
                      const matchingItems = boxData.inventory.filter(
                        (item) =>
                          inventoryRowMatchesSupplyPublicId(item, subtractModeItem) &&
                          (item.shelf ?? 0) === idx
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
                        style={
                          moveModeItem || freePlaceModeItem
                            ? { pointerEvents: 'none' }
                            : undefined
                        }
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
          <FreePlaceDots />
        </g>
      </svg>
      <MasterItemPreview />
      <SubtractModePreview />
    </>
  );
});

MapComponent.displayName = 'Map';

export default MapComponent;
