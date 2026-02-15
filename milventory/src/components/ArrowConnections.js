import React, { useEffect, useRef, useCallback } from 'react';
import { useInventory } from '../context/InventoryContext';
import * as d3 from 'd3';

const ArrowConnections = () => {
  const {
    selectedSOTItem,
    getItemLocations,
    inventoryData,
    svgRef,
    worldRef
  } = useInventory();

  const arrowsRef = useRef(null);
  const rafRef = useRef(null);

  const drawArrows = useCallback(() => {
    if (!arrowsRef.current || !svgRef.current) return;

    const svg = svgRef.current;
    const arrowsGroup = arrowsRef.current;

    // Clear existing arrows
    arrowsGroup.innerHTML = '';

    if (!selectedSOTItem) return;

    const locations = getItemLocations(selectedSOTItem);
    if (locations.length === 0) return;

    // Find preview pane position in screen coordinates
    const previewPane = document.querySelector('.sot-preview-pane-overlay');
    if (!previewPane) return;

    const previewRect = previewPane.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const transform = d3.zoomTransform(svg);

    // Arrow starts from right edge of preview pane
    const previewScreenX = previewRect.right;
    const previewScreenY = previewRect.top + 50;

    const previewX = (previewScreenX - svgRect.left - transform.x) / transform.k;
    const previewY = (previewScreenY - svgRect.top - transform.y) / transform.k;

    // Draw arrows to each location box
    locations.forEach((boxTitle) => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;

      const boxX = boxData.x + boxData.width / 2;
      const boxY = boxData.y + boxData.height / 2;

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
      pathElement.setAttribute('class', 'sot-arrow-path');
      arrowsGroup.appendChild(pathElement);
    });
  }, [selectedSOTItem, getItemLocations, inventoryData, svgRef]);

  // Draw arrows when selectedSOTItem changes
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
    if (!selectedSOTItem || !worldRef.current) return;

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
  }, [selectedSOTItem, worldRef, drawArrows]);

  if (!selectedSOTItem) return null;

  return <g ref={arrowsRef} className="arrow-connections" />;
};

export default ArrowConnections;
