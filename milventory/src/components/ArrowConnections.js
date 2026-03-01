import React, { useEffect, useRef, useCallback } from 'react';
import { useInventory } from '../context/InventoryContext';
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
    moveModeItem
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

    if (!selectedMasterItem) return;

    const locations = getItemLocations(selectedMasterItem);
    if (locations.length === 0) return;

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
      
      if (moveModeItem && moveModeItem === selectedMasterItem) {
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
  }, [selectedMasterItem, getItemLocations, inventoryData, svgRef, screenToWorld, moveModeItem]);
  
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

    // Arrowhead
    const angle = Math.atan2(dy, dx);
    const arrowLength = 12;
    const arrowAngle = Math.PI / 6;
    const arrowX = boxX - Math.cos(angle) * 20;
    const arrowY = boxY - Math.sin(angle) * 20;

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

  // Update arrows on zoom/pan via MutationObserver — direct DOM, no React state
  useEffect(() => {
    if (!selectedMasterItem || !worldRef.current) return;

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
  }, [selectedMasterItem, worldRef, drawArrows]);

  if (!selectedMasterItem) return null;

  return <g ref={arrowsRef} className="arrow-connections" />;
};

export default ArrowConnections;
