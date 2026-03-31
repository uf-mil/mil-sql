import React, { useEffect, useRef, useCallback } from 'react';
import { useInventory, MASTER_ARROWS_REDRAW_EVENT } from '../../context/InventoryContext';
import * as d3 from 'd3';

const SHELF_NAMES = [
  'Shelf 6 (Top)',
  'Shelf 5',
  'Shelf 4',
  'Shelf 3',
  'Shelf 2',
  'Shelf 1 (Bottom)'
];

const ArrowConnections = () => {
  const {
    selectedMasterItem,
    getItemLocations,
    inventoryData,
    svgRef,
    worldRef,
    moveModeItem,
    subtractModeItem,
    freePlaceModeItem,
    freePlacementsBySupplyPublicId,
    freePlaceVisualDots,
    subtractModeVisualFreeDots,
    moveModeVisualFreeDots,
    moveModeDotDragLiveByIdRef
  } = useInventory();

  const arrowsRef = useRef(null);
  const rafRef = useRef(null);

  // Convert screen coords to world-group coords (accounts for viewBox + D3 zoom)
  const screenToWorld = useCallback((screenX, screenY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const world = svg.querySelector('#world');
    if (!world) return { x: 0, y: 0 };
    const ctm = world.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    const worldPt = pt.matrixTransform(ctm.inverse());
    return { x: worldPt.x, y: worldPt.y };
  }, [svgRef]);

  const drawArrows = useCallback(() => {
    if (!arrowsRef.current || !svgRef.current) return;

    const arrowsGroup = arrowsRef.current;

    // Clear existing arrows
    arrowsGroup.innerHTML = '';

    const arrowItem =
      subtractModeItem || moveModeItem || freePlaceModeItem || selectedMasterItem;
    if (!arrowItem) return;

    const locations = getItemLocations(arrowItem);
    let freeDots = freePlacementsBySupplyPublicId.get(arrowItem) || [];
    if (freePlaceModeItem === arrowItem && freePlaceVisualDots != null) {
      freeDots = freePlaceVisualDots;
    } else if (subtractModeItem === arrowItem && subtractModeVisualFreeDots != null) {
      freeDots = subtractModeVisualFreeDots;
    } else if (moveModeItem === arrowItem && moveModeVisualFreeDots != null) {
      freeDots = moveModeVisualFreeDots.map((d) => {
        const live = moveModeDotDragLiveByIdRef.current.get(d.id);
        return live ? { ...d, x: live.x, y: live.y } : d;
      });
    }
    if (locations.length === 0 && freeDots.length === 0) return;

    // Find preview pane position in screen coordinates
    const previewPane = document.querySelector('.master-preview-pane-overlay');
    if (!previewPane) return;

    const previewRect = previewPane.getBoundingClientRect();

    // Arrow starts from right edge of preview pane — convert to world coords
    const preview = screenToWorld(previewRect.right, previewRect.top + 50);
    const previewX = preview.x;
    const previewY = preview.y;

    // Draw arrows to each location box (or move boxes if in move mode)
    locations.forEach((boxTitle) => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;

      let boxX, boxY;
      
      if (moveModeItem && moveModeItem === arrowItem) {
        // In move mode, point to the little red boxes
        const matchingItems = boxData.inventory.filter(item => item.name === moveModeItem);
        if (matchingItems.length === 0) return;
        
        const isTallCabinet = boxTitle.startsWith('Tall Cabinet');
        
        if (isTallCabinet) {
          // For Tall Cabinets, point to each shelf's move box
          matchingItems.forEach(item => {
            const shelfIdx = item.shelf ?? 0;
            const shelfH = boxData.height / SHELF_NAMES.length;
            const shelfY = boxData.y + shelfIdx * shelfH;
            
            const boxSize = Math.min(shelfH * 0.6, boxData.width * 0.4, 60);
            boxX = boxData.x + (boxData.width - boxSize) / 2 + boxSize / 2;
            boxY = shelfY + (shelfH - boxSize) / 2 + boxSize / 2;
            
            drawArrowToPoint(previewX, previewY, boxX, boxY, arrowsGroup);
          });
          return; // Skip the regular box arrow for Tall Cabinets
        } else {
          // For regular boxes, point to the center move box
          const boxSize = Math.min(boxData.height * 0.5, boxData.width * 0.4, 60);
          boxX = boxData.x + (boxData.width - boxSize) / 2 + boxSize / 2;
          boxY = boxData.y + (boxData.height - boxSize) / 2 + boxSize / 2;
        }
      } else {
        // Normal mode: point to center of inventory box
        boxX = boxData.x + boxData.width / 2;
        boxY = boxData.y + boxData.height / 2;
      }
      
      drawArrowToPoint(previewX, previewY, boxX, boxY, arrowsGroup);
    });

    freeDots.forEach((p) => {
      drawArrowToPoint(previewX, previewY, p.x, p.y, arrowsGroup);
    });
  }, [
    selectedMasterItem,
    subtractModeItem,
    moveModeItem,
    freePlaceModeItem,
    freePlaceVisualDots,
    subtractModeVisualFreeDots,
    moveModeVisualFreeDots,
    moveModeDotDragLiveByIdRef,
    getItemLocations,
    inventoryData,
    svgRef,
    screenToWorld,
    freePlacementsBySupplyPublicId
  ]);
  
  const drawArrowToPoint = (previewX, previewY, boxX, boxY, arrowsGroup) => {

    const path = d3.path();
    const dx = boxX - previewX;
    const dy = boxY - previewY;

    const cp1x = previewX + dx * 0.3;
    const cp1y = previewY;
    const cp2x = boxX - dx * 0.3;
    const cp2y = boxY;

    path.moveTo(previewX, previewY);
    path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, boxX, boxY);

    // Arrowhead - calculate angle from curve tangent at endpoint
    // For a cubic Bezier P(t), the derivative at t=1 is: P'(1) = 3(P₃ - P₂)
    // However, to get the visual direction of the curve as it enters the box,
    // we sample two points very close to the endpoint to get the actual curve direction
    const t1 = 0.95; // Sample point before endpoint
    const t2 = 1.0;   // Endpoint
    
    // Cubic Bezier evaluation: P(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const evalBezier = (t, p0, p1, p2, p3) => {
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;
      return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
    };
    
    // Sample the curve at t1 and t2
    const x1 = evalBezier(t1, previewX, cp1x, cp2x, boxX);
    const y1 = evalBezier(t1, previewY, cp1y, cp2y, boxY);
    const x2 = boxX; // t2 = 1.0, endpoint
    const y2 = boxY;
    
    // Calculate the direction vector from sampled point to endpoint
    const tangentDx = x2 - x1;
    const tangentDy = y2 - y1;
    
    // Calculate angle from this direction vector
    // If the vector is too small (degenerate case), fall back to derivative formula
    const tangentLength = Math.sqrt(tangentDx * tangentDx + tangentDy * tangentDy);
    let angle;
    if (tangentLength < 0.001) {
      // Degenerate case: use the derivative formula P'(1) = 3(P₃ - P₂)
      const derivDx = 3 * (boxX - cp2x);
      const derivDy = 3 * (boxY - cp2y);
      angle = Math.atan2(derivDy, derivDx);
    } else {
      // Use the sampled direction
      angle = Math.atan2(tangentDy, tangentDx);
    }
    const arrowLength = 12;
    const arrowAngle = Math.PI / 6;
    const arrowX = boxX;
    const arrowY = boxY;

    path.moveTo(arrowX, arrowY);
    path.lineTo(
      arrowX - arrowLength * Math.cos(angle - arrowAngle),
      arrowY - arrowLength * Math.sin(angle - arrowAngle)
    );
    path.moveTo(arrowX, arrowY);
    path.lineTo(
      arrowX - arrowLength * Math.cos(angle + arrowAngle),
      arrowY - arrowLength * Math.sin(angle + arrowAngle)
    );

    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', path.toString());
    pathElement.setAttribute('class', 'master-arrow-path');
    arrowsGroup.appendChild(pathElement);
  };

  // Draw arrows when selectedMasterItem changes
  useEffect(() => {
    drawArrows();

    return () => {
      if (arrowsRef.current) {
        arrowsRef.current.innerHTML = '';
      }
    };
  }, [drawArrows]);

  // Floor-dot drag updates a ref only; redraw arrows on custom event
  useEffect(() => {
    const onRedraw = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawArrows);
    };
    window.addEventListener(MASTER_ARROWS_REDRAW_EVENT, onRedraw);
    return () => window.removeEventListener(MASTER_ARROWS_REDRAW_EVENT, onRedraw);
  }, [drawArrows]);

  // Update arrows on zoom/pan via MutationObserver — direct DOM, no React state
  useEffect(() => {
    const arrowActive =
      subtractModeItem || moveModeItem || freePlaceModeItem || selectedMasterItem;
    if (!arrowActive || !worldRef.current) return;

    const world = worldRef.current;

    const scheduleRedraw = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(drawArrows);
    };

    const observer = new MutationObserver(scheduleRedraw);
    observer.observe(world, { attributes: true, attributeFilter: ['transform'] });

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [selectedMasterItem, subtractModeItem, moveModeItem, freePlaceModeItem, worldRef, drawArrows]);

  if (!subtractModeItem && !moveModeItem && !freePlaceModeItem && !selectedMasterItem) return null;

  return <g ref={arrowsRef} className="arrow-connections" />;
};

export default ArrowConnections;
