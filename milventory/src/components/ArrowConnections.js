import React, { useEffect, useRef, useState } from 'react';
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
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const drawArrows = () => {
    if (!selectedSOTItem || !svgRef.current || !worldRef.current || !arrowsRef.current) return;

    const svg = svgRef.current;
    const arrowsGroup = arrowsRef.current;
    const locations = getItemLocations(selectedSOTItem);
    
    // Clear existing arrows
    arrowsGroup.innerHTML = '';

    if (locations.length === 0) return;

    // Find preview pane position in screen coordinates
    const previewPane = document.querySelector('.sot-preview-pane-overlay');
    if (!previewPane) return;

    const previewRect = previewPane.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const transform = d3.zoomTransform(svg);
    
    // Arrow should start from the right edge of the preview pane
    const previewScreenX = previewRect.right; // Right edge of preview pane
    const previewScreenY = previewRect.top + 50; // Top of preview pane + some offset
    
    // Convert screen coordinates to SVG coordinates
    // Formula: svgX = (screenX - svgRect.left - transform.x) / transform.k
    const previewX = (previewScreenX - svgRect.left - transform.x) / transform.k;
    const previewY = (previewScreenY - svgRect.top - transform.y) / transform.k;

    // Draw arrows to each location box
    locations.forEach((boxTitle) => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;

      // Box center coordinates (already in SVG space)
      const boxX = boxData.x + boxData.width / 2;
      const boxY = boxData.y + boxData.height / 2;

      // Create arrow path
      const path = d3.path();
      
      // Calculate control points for curved arrow
      const dx = boxX - previewX;
      const dy = boxY - previewY;
      
      // Use a curved path
      const cp1x = previewX + dx * 0.3;
      const cp1y = previewY;
      const cp2x = boxX - dx * 0.3;
      const cp2y = boxY;

      path.moveTo(previewX, previewY);
      path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, boxX, boxY);

      // Create arrowhead
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

      // Create path element
      const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathElement.setAttribute('d', path.toString());
      pathElement.setAttribute('class', 'sot-arrow-path');
      arrowsGroup.appendChild(pathElement);
    });

    // Highlight boxes
    locations.forEach((boxTitle) => {
      const boxElement = svg.querySelector(`rect[data-title="${boxTitle}"]`);
      if (boxElement) {
        boxElement.classList.add('box-highlighted');
      }
    });
  };

  useEffect(() => {
    drawArrows();

    // Cleanup function
    return () => {
      if (arrowsRef.current) {
        arrowsRef.current.innerHTML = '';
      }
      if (selectedSOTItem && svgRef.current) {
        const locations = getItemLocations(selectedSOTItem);
        locations.forEach((boxTitle) => {
          const boxElement = svgRef.current.querySelector(`rect[data-title="${boxTitle}"]`);
          if (boxElement) {
            boxElement.classList.remove('box-highlighted');
          }
        });
      }
    };
  }, [selectedSOTItem, getItemLocations, inventoryData, svgRef, worldRef, updateTrigger]);

  // Update arrows on zoom/pan
  useEffect(() => {
    if (!selectedSOTItem || !svgRef.current || !worldRef.current) return;

    const svg = svgRef.current;
    const world = worldRef.current;
    const updateArrows = () => {
      setUpdateTrigger(prev => prev + 1);
    };

    // Listen for zoom events (includes both zoom and pan in d3)
    svg.addEventListener('zoom', updateArrows);
    
    // Also observe the world transform attribute directly to catch any transform changes
    const observer = new MutationObserver(() => {
      updateArrows();
    });
    
    observer.observe(world, {
      attributes: true,
      attributeFilter: ['transform']
    });

    return () => {
      svg.removeEventListener('zoom', updateArrows);
      observer.disconnect();
    };
  }, [selectedSOTItem, svgRef, worldRef]);

  if (!selectedSOTItem) return null;

  return <g ref={arrowsRef} className="arrow-connections" />;
};

export default ArrowConnections;

