import React, { useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const SHELF_NAMES = [
  'Shelf 6 (Top)',
  'Shelf 5',
  'Shelf 4',
  'Shelf 3',
  'Shelf 2',
  'Shelf 1 (Bottom)'
];

const MoveModeBoxes = () => {
  const {
    moveModeItem,
    inventoryData,
    moveModeDragging,
    handleMoveModeDragStart,
    handleMoveModeDragMove,
    handleMoveModeDrop,
    clearMoveModeDragging,
    currentDragOverBox,
    svgRef,
    worldRef,
    isDraggingMoveBoxRef
  } = useInventory();
  
  const dragStartRef = useRef(null);
  
  // Track mouse position during drag
  useEffect(() => {
    if (!moveModeDragging) {
      dragStartRef.current = null;
      return;
    }
    
    const handleMouseMove = (e) => {
      if (!svgRef.current || !worldRef.current || !moveModeDragging) return;
      
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      
      const ctm = worldRef.current.getScreenCTM();
      if (!ctm) return;
      
      const worldPt = pt.matrixTransform(ctm.inverse());
      handleMoveModeDragMove(worldPt.x - 30, worldPt.y - 30); // Offset by half box size
    };
    
    const handleMouseUp = (e) => {
      if (!moveModeDragging || !dragStartRef.current) return;
      
      // Check if we're over an inventory box
      const svg = svgRef.current;
      if (!svg || !worldRef.current) {
        // Reset to original position
        clearMoveModeDragging();
        return;
      }
      
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = worldRef.current.getScreenCTM();
      if (!ctm) {
        clearMoveModeDragging();
        return;
      }
      
      const worldPt = pt.matrixTransform(ctm.inverse());
      
      // Find which inventory box we're over
      let targetBox = null;
      let targetShelf = undefined;
      
      for (const [boxTitle, boxData] of inventoryData.entries()) {
        if (worldPt.x >= boxData.x && worldPt.x <= boxData.x + boxData.width &&
            worldPt.y >= boxData.y && worldPt.y <= boxData.y + boxData.height) {
          targetBox = boxTitle;
          
          // If it's a Tall Cabinet, determine shelf
          if (boxTitle.startsWith('Tall Cabinet')) {
            const shelfH = boxData.height / SHELF_NAMES.length;
            const relativeY = worldPt.y - boxData.y;
            targetShelf = Math.max(0, Math.min(SHELF_NAMES.length - 1, Math.floor(relativeY / shelfH)));
          }
          break;
        }
      }
      
      // Check if dropped on a different location (different box or different shelf of same box)
      const isDifferentLocation = targetBox && (
        targetBox !== dragStartRef.current.boxTitle ||
        (targetBox === dragStartRef.current.boxTitle && targetShelf !== dragStartRef.current.shelf)
      );
      
      if (isDifferentLocation) {
        // Dropped on a different location - move the item
        handleMoveModeDrop(targetBox, targetShelf);
      } else {
        // Dropped outside or on same location - reset to original position
        clearMoveModeDragging();
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [moveModeDragging, svgRef, worldRef, handleMoveModeDragMove, handleMoveModeDrop, clearMoveModeDragging, inventoryData]);

  if (!moveModeItem) return null;

  const boxes = Array.from(inventoryData.values());
  const moveBoxes = [];

  boxes.forEach(box => {
    const boxData = inventoryData.get(box.title);
    if (!boxData) return;

    const matchingItems = boxData.inventory.filter(item => item.name === moveModeItem);
    if (matchingItems.length === 0) return;

    const isTallCabinet = box.title.startsWith('Tall Cabinet');

    if (isTallCabinet) {
      // For Tall Cabinets, show a box per shelf
      matchingItems.forEach(item => {
        const shelfIdx = item.shelf ?? 0;
        const shelfH = box.height / SHELF_NAMES.length;
        const shelfY = box.y + shelfIdx * shelfH;
        
        // Position box in center of shelf
        const boxSize = Math.min(shelfH * 0.6, box.width * 0.4, 60);
        const boxX = box.x + (box.width - boxSize) / 2;
        const boxY = shelfY + (shelfH - boxSize) / 2;
        
        const isDragging = moveModeDragging && 
          moveModeDragging.boxTitle === box.title && 
          moveModeDragging.shelf === shelfIdx;
        const isDragOver = currentDragOverBox === box.title;

        moveBoxes.push({
          key: `${box.title}||${shelfIdx}`,
          x: boxX,
          y: boxY,
          width: boxSize,
          height: boxSize,
          qty: item.qty,
          boxTitle: box.title,
          shelf: shelfIdx,
          isDragging,
          isDragOver
        });
      });
    } else {
      // For regular boxes, show one box with total quantity
      const totalQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
      
      // Position box in center
      const boxSize = Math.min(box.height * 0.5, box.width * 0.4, 60);
      const boxX = box.x + (box.width - boxSize) / 2;
      const boxY = box.y + (box.height - boxSize) / 2;
      
      const isDragging = moveModeDragging && 
        moveModeDragging.boxTitle === box.title && 
        moveModeDragging.shelf === undefined;
      const isDragOver = currentDragOverBox === box.title;

      moveBoxes.push({
        key: box.title,
        x: boxX,
        y: boxY,
        width: boxSize,
        height: boxSize,
        qty: totalQty,
        boxTitle: box.title,
        shelf: undefined,
        isDragging,
        isDragOver
      });
    }
  });

  const handleMouseDown = (e, boxTitle, shelf, qty, x, y) => {
    // Prevent D3 zoom from starting
    e.preventDefault();
    e.stopPropagation();
    // Set dragging state immediately so D3 filter can see it
    isDraggingMoveBoxRef.current = true;
    dragStartRef.current = { boxTitle, shelf, qty, x, y };
    handleMoveModeDragStart(boxTitle, shelf, qty, x, y);
  };

  return (
    <g className="move-mode-boxes">
      {moveBoxes.map(moveBox => {
        if (moveBox.isDragging) return null; // Don't render the dragging box
        
        return (
          <g key={moveBox.key}>
            <rect
              x={moveBox.x}
              y={moveBox.y}
              width={moveBox.width}
              height={moveBox.height}
              fill="var(--accent)"
              stroke={moveBox.isDragOver ? '#fff' : 'rgba(155, 183, 255, 0.8)'}
              strokeWidth={moveBox.isDragOver ? 3 : 2}
              rx="4"
              ry="4"
              style={{ cursor: 'grab' }}
              data-move-box="true"
              onMouseDown={(e) => handleMouseDown(e, moveBox.boxTitle, moveBox.shelf, moveBox.qty, moveBox.x, moveBox.y)}
            />
            <text
              x={moveBox.x + moveBox.width / 2}
              y={moveBox.y + moveBox.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize={Math.max(10, moveBox.width * 0.25)}
              fontWeight="bold"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {moveBox.qty}
            </text>
          </g>
        );
      })}
      {/* Render dragging box at cursor position */}
      {moveModeDragging && (
        <g>
          <rect
            x={moveModeDragging.x || 0}
            y={moveModeDragging.y || 0}
            width={60}
            height={60}
            fill="var(--accent)"
            stroke="#fff"
            strokeWidth={3}
            rx="4"
            ry="4"
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={(moveModeDragging.x || 0) + 30}
            y={(moveModeDragging.y || 0) + 30}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={14}
            fontWeight="bold"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {moveModeDragging.qty}
          </text>
        </g>
      )}
    </g>
  );
};

export default MoveModeBoxes;

