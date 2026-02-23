import React, { forwardRef, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useInventory } from '../context/InventoryContext';

const AdminMap = forwardRef((props, ref) => {
  const { drawMode, onDrawComplete } = props;
  const { inventoryData, inventoryBounds } = useInventory();
  const worldRef = useRef(null);
  const svgRef = useRef(null);
  const isPanningRef = useRef(false);
  const [drawingBox, setDrawingBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef(null);
  const currentDrawingBoxRef = useRef(null);
  const currentTransformRef = useRef(d3.zoomIdentity);

  // Expose svgRef to parent via forwarded ref
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(svgRef.current);
      } else {
        ref.current = svgRef.current;
      }
    }
  }, [ref]);

  // Setup D3 zoom/pan (disabled when in draw mode)
  useEffect(() => {
    if (!svgRef.current || !worldRef.current) return;

    const zoom = d3.zoom()
      .scaleExtent([0.6, 6])
      .filter(() => !drawMode) // Disable zoom/pan when in draw mode
      .on('start', () => {
        if (!drawMode) {
          isPanningRef.current = true;
        }
      })
      .on('zoom', (e) => {
        if (worldRef.current && !drawMode) {
          worldRef.current.setAttribute('transform', e.transform);
          currentTransformRef.current = e.transform;
        }
      })
      .on('end', () => {
        isPanningRef.current = false;
      });
    
    const svg = d3.select(svgRef.current);
    svg.call(zoom).on('dblclick.zoom', null);
    if (!drawMode) {
      svg.call(zoom.transform, d3.zoomIdentity.scale(1.03));
    }
  }, [drawMode]);

  // Convert screen coordinates to SVG coordinates (accounting for zoom/pan)
  const screenToSVG = (screenX, screenY) => {
    if (!svgRef.current || !worldRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    
    // Get the transform matrix from the world group (includes zoom/pan)
    const worldMatrix = worldRef.current.getScreenCTM();
    if (!worldMatrix) return { x: 0, y: 0 };
    
    // Convert to SVG coordinates by inverting the world transform
    const svgPoint = pt.matrixTransform(worldMatrix.inverse());
    
    return {
      x: svgPoint.x,
      y: svgPoint.y
    };
  };

  // Handle mouse down for drawing
  const handleMouseDown = (e) => {
    if (!drawMode || isPanningRef.current) return;
    
    // Prevent default to avoid conflicts with zoom
    e.preventDefault();
    e.stopPropagation();
    
    const svgCoords = screenToSVG(e.clientX, e.clientY);
    
    drawStartRef.current = svgCoords;
    const initialBox = {
      x: svgCoords.x,
      y: svgCoords.y,
      width: 0,
      height: 0
    };
    currentDrawingBoxRef.current = initialBox;
    setIsDrawing(true);
    setDrawingBox(initialBox);
  };

  // Handle mouse move for drawing
  const handleMouseMove = (e) => {
    if (!drawMode || !isDrawing || !drawStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const svgCoords = screenToSVG(e.clientX, e.clientY);
    const start = drawStartRef.current;
    
    const updatedBox = {
      x: Math.min(start.x, svgCoords.x),
      y: Math.min(start.y, svgCoords.y),
      width: Math.abs(svgCoords.x - start.x),
      height: Math.abs(svgCoords.y - start.y)
    };
    currentDrawingBoxRef.current = updatedBox;
    setDrawingBox(updatedBox);
  };

  // Handle mouse up to complete drawing
  const handleMouseUp = (e) => {
    if (!drawMode || !isDrawing) return;
    
    // Prevent default to avoid conflicts with zoom
    e.preventDefault();
    e.stopPropagation();
    
    // Get current drawing box from ref (synchronous access)
    const currentBox = currentDrawingBoxRef.current;
    if (!currentBox || !drawStartRef.current) {
      setIsDrawing(false);
      setDrawingBox(null);
      currentDrawingBoxRef.current = null;
      drawStartRef.current = null;
      return;
    }
    
    // Only complete if box has minimum size
    if (currentBox.width > 10 && currentBox.height > 10) {
      if (onDrawComplete) {
        onDrawComplete({
          x: Math.round(currentBox.x),
          y: Math.round(currentBox.y),
          width: Math.round(currentBox.width),
          height: Math.round(currentBox.height)
        });
      }
    }
    
    setIsDrawing(false);
    setDrawingBox(null);
    currentDrawingBoxRef.current = null;
    drawStartRef.current = null;
  };

  const boxes = inventoryData ? Array.from(inventoryData.values()) : [];
  
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
    <svg 
      ref={svgRef} 
      className="map" 
      viewBox={viewBox} 
      aria-label="Admin room map"
      style={{ 
        touchAction: 'none', 
        userSelect: 'none',
        cursor: drawMode ? 'crosshair' : 'default'
      }}
      onMouseDown={drawMode ? handleMouseDown : undefined}
      onMouseMove={drawMode ? handleMouseMove : undefined}
      onMouseUp={drawMode ? handleMouseUp : undefined}
      onMouseLeave={drawMode ? () => {
        // Cancel drawing if mouse leaves
        if (isDrawing) {
          setIsDrawing(false);
          setDrawingBox(null);
          currentDrawingBoxRef.current = null;
          drawStartRef.current = null;
        }
      } : undefined}
    >
      <g ref={worldRef} id="world">
        <rect 
          className="room" 
          x={roomBounds.x} 
          y={roomBounds.y} 
          width={roomBounds.width} 
          height={roomBounds.height} 
          rx={roomBounds.rx} 
          ry={roomBounds.ry}
        />
        
        {boxes.map((box, idx) => (
          <rect
            key={idx}
            className="box"
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill={box.fill}
            data-title={box.title}
            style={{ cursor: 'default', pointerEvents: drawMode ? 'none' : 'auto' }}
          />
        ))}

        {/* Drawing preview box */}
        {drawingBox && (
          <rect
            className="box"
            x={drawingBox.x}
            y={drawingBox.y}
            width={drawingBox.width}
            height={drawingBox.height}
            fill="rgba(74, 158, 255, 0.3)"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeDasharray="4,4"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </g>
    </svg>
  );
});

AdminMap.displayName = 'AdminMap';

export default AdminMap;

