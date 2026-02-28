import React, { forwardRef, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useInventory } from '../context/InventoryContext';
import { admin } from '../api';

const AdminMap = forwardRef((props, ref) => {
  const { drawMode, onDrawComplete, selectedLocation, onLocationSelect, previewBox, onPreviewEdgeDrag } = props;
  const { inventoryData, inventoryBounds } = useInventory();
  const worldRef = useRef(null);
  const svgRef = useRef(null);
  const isPanningRef = useRef(false);
  const [drawingBox, setDrawingBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef(null);
  const currentDrawingBoxRef = useRef(null);
  const currentTransformRef = useRef(d3.zoomIdentity);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);
  const isDraggingEdgeRef = useRef(false); // Synchronous ref for D3 filter
  const [draggingEdge, setDraggingEdge] = useState(null); // 'top', 'bottom', 'left', 'right'
  const edgeDragStartRef = useRef(null);

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
      .filter((event) => {
        // Disable zoom/pan when in draw mode or when dragging an edge handle
        if (drawMode) return false;
        if (isDraggingEdgeRef.current) return false;
        // Check if the event target is an edge handle
        if (event.target && event.target.dataset && event.target.dataset.edgeHandle) return false;
        return true;
      })
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

  // Snap value to nearest multiple of 5
  const snapTo5 = (value) => {
    return Math.round(value / 5) * 5;
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
    
    // Calculate raw dimensions
    const rawWidth = Math.abs(svgCoords.x - start.x);
    const rawHeight = Math.abs(svgCoords.y - start.y);
    
    // Snap width and height to nearest multiple of 5
    const snappedWidth = snapTo5(rawWidth);
    const snappedHeight = snapTo5(rawHeight);
    
    // Calculate box position: always use the minimum of start and current position
    // This ensures the box always starts from the top-left corner
    const minX = Math.min(start.x, svgCoords.x);
    const minY = Math.min(start.y, svgCoords.y);
    
    // Adjust position if we're dragging left or up to account for snapped dimensions
    // If dragging left, adjust x; if dragging up, adjust y
    const updatedBox = {
      x: svgCoords.x < start.x ? start.x - snappedWidth : minX,
      y: svgCoords.y < start.y ? start.y - snappedHeight : minY,
      width: snappedWidth,
      height: snappedHeight
    };
    currentDrawingBoxRef.current = updatedBox;
    setDrawingBox(updatedBox);
  };

  // Handle mouse up to complete drawing
  const handleMouseUp = (e) => {
    if (isDraggingEdgeRef.current) {
      // End edge dragging
      isDraggingEdgeRef.current = false;
      setIsDraggingEdge(false);
      setDraggingEdge(null);
      edgeDragStartRef.current = null;
      return;
    }
    
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
    // Dimensions are already snapped to 5px intervals from handleMouseMove
    if (currentBox.width > 10 && currentBox.height > 10) {
      if (onDrawComplete) {
        onDrawComplete({
          x: Math.round(currentBox.x),
          y: Math.round(currentBox.y),
          width: currentBox.width, // Already snapped to 5px
          height: currentBox.height // Already snapped to 5px
        });
      }
    }
    
    setIsDrawing(false);
    setDrawingBox(null);
    currentDrawingBoxRef.current = null;
    drawStartRef.current = null;
  };

  // Handle edge drag start
  const handleEdgeMouseDown = (e, edge) => {
    if (!previewBox || !onPreviewEdgeDrag) return;
    e.preventDefault();
    e.stopPropagation();
    
    const svgCoords = screenToSVG(e.clientX, e.clientY);
    isDraggingEdgeRef.current = true;
    setIsDraggingEdge(true);
    setDraggingEdge(edge);
    edgeDragStartRef.current = {
      edge,
      startCoords: svgCoords,
      initialBox: { ...previewBox }
    };
  };

  // Handle edge drag move
  const handleEdgeMouseMove = (e) => {
    if (!isDraggingEdgeRef.current || !edgeDragStartRef.current || !onPreviewEdgeDrag) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const svgCoords = screenToSVG(e.clientX, e.clientY);
    const { initialBox } = edgeDragStartRef.current;
    
    let newTopY = initialBox.y;
    let newBottomY = initialBox.y + initialBox.height;
    let newLeftX = initialBox.x;
    let newRightX = initialBox.x + initialBox.width;
    
    // Snap to 5px intervals
    const snapTo5 = (value) => Math.round(value / 5) * 5;
    
    if (draggingEdge === 'top') {
      newTopY = snapTo5(svgCoords.y);
      if (newTopY >= newBottomY) newTopY = newBottomY - 5;
    } else if (draggingEdge === 'bottom') {
      newBottomY = snapTo5(svgCoords.y);
      if (newBottomY <= newTopY) newBottomY = newTopY + 5;
    } else if (draggingEdge === 'left') {
      newLeftX = snapTo5(svgCoords.x);
      if (newLeftX >= newRightX) newLeftX = newRightX - 5;
    } else if (draggingEdge === 'right') {
      newRightX = snapTo5(svgCoords.x);
      if (newRightX <= newLeftX) newRightX = newLeftX + 5;
    }
    
    // Update preview box
    onPreviewEdgeDrag({
      topY: newTopY,
      bottomY: newBottomY,
      leftX: newLeftX,
      rightX: newRightX
    });
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
      onMouseMove={(e) => {
        if (drawMode) { handleMouseMove(e); return; }
        if (isDraggingEdgeRef.current) { handleEdgeMouseMove(e); return; }
      }}
      onMouseUp={(e) => {
        if (isDraggingEdgeRef.current) { handleMouseUp(e); return; }
        if (drawMode) { handleMouseUp(e); return; }
      }}
      onMouseLeave={() => {
        if (isDrawing) {
          setIsDrawing(false);
          setDrawingBox(null);
          currentDrawingBoxRef.current = null;
          drawStartRef.current = null;
        }
        if (isDraggingEdgeRef.current) {
          isDraggingEdgeRef.current = false;
          setIsDraggingEdge(false);
          setDraggingEdge(null);
          edgeDragStartRef.current = null;
        }
      }}
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
        
        {boxes.map((box, idx) => {
          const isSelected = selectedLocation && selectedLocation.name === box.title;
          return (
            <rect
              key={idx}
              className="box"
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={box.fill}
              data-title={box.title}
              style={{ 
                cursor: drawMode ? 'default' : 'pointer', 
                pointerEvents: drawMode ? 'none' : 'auto',
                stroke: isSelected ? 'var(--accent)' : 'none',
                strokeWidth: isSelected ? 3 : 0,
                opacity: isSelected ? 0.9 : 1
              }}
              onClick={async (e) => {
                if (!drawMode && onLocationSelect) {
                  e.stopPropagation();
                  try {
                    // Fetch the full location data from the API
                    const location = await admin.getLocations().then(locations => 
                      locations.find(loc => loc.name === box.title)
                    );
                    if (location) {
                      onLocationSelect(location);
                    } else {
                      // Fallback: construct from box data if API doesn't have it
                      const fallbackLocation = {
                        name: box.title,
                        x: box.x,
                        y: box.y,
                        width: box.width,
                        height: box.height,
                        type: 'drawer'
                      };
                      onLocationSelect(fallbackLocation);
                    }
                  } catch (err) {
                    console.error('Error fetching location:', err);
                    // Fallback: construct from box data
                    const fallbackLocation = {
                      name: box.title,
                      x: box.x,
                      y: box.y,
                      width: box.width,
                      height: box.height,
                      type: 'drawer'
                    };
                    onLocationSelect(fallbackLocation);
                  }
                }
              }}
            />
          );
        })}

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

        {/* Preview box from AddLocationModal with draggable edges */}
        {previewBox && !drawingBox && (
          <>
            <rect
              className="box"
              x={previewBox.x}
              y={previewBox.y}
              width={previewBox.width}
              height={previewBox.height}
              fill="rgba(74, 158, 255, 0.3)"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="4,4"
              style={{ pointerEvents: 'none' }}
            />
            {/* Top edge */}
            <line
              x1={previewBox.x}
              y1={previewBox.y}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y}
              stroke="var(--accent)"
              strokeWidth="8"
              strokeOpacity="0"
              data-edge-handle="top"
              style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleEdgeMouseDown(e, 'top')}
            />
            <line
              x1={previewBox.x}
              y1={previewBox.y}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y}
              stroke="var(--accent)"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
            {/* Bottom edge */}
            <line
              x1={previewBox.x}
              y1={previewBox.y + previewBox.height}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="8"
              strokeOpacity="0"
              data-edge-handle="bottom"
              style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleEdgeMouseDown(e, 'bottom')}
            />
            <line
              x1={previewBox.x}
              y1={previewBox.y + previewBox.height}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
            {/* Left edge */}
            <line
              x1={previewBox.x}
              y1={previewBox.y}
              x2={previewBox.x}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="8"
              strokeOpacity="0"
              data-edge-handle="left"
              style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleEdgeMouseDown(e, 'left')}
            />
            <line
              x1={previewBox.x}
              y1={previewBox.y}
              x2={previewBox.x}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
            {/* Right edge */}
            <line
              x1={previewBox.x + previewBox.width}
              y1={previewBox.y}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="8"
              strokeOpacity="0"
              data-edge-handle="right"
              style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
              onMouseDown={(e) => handleEdgeMouseDown(e, 'right')}
            />
            <line
              x1={previewBox.x + previewBox.width}
              y1={previewBox.y}
              x2={previewBox.x + previewBox.width}
              y2={previewBox.y + previewBox.height}
              stroke="var(--accent)"
              strokeWidth="2"
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}
      </g>
    </svg>
  );
});

AdminMap.displayName = 'AdminMap';

export default AdminMap;

