import React, { forwardRef, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useInventory } from '../context/InventoryContext';

const AdminMap = forwardRef((props, ref) => {
  const { inventoryData, inventoryBounds } = useInventory();
  const worldRef = useRef(null);
  const svgRef = useRef(null);
  const isPanningRef = useRef(false);

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

  // Setup D3 zoom/pan
  useEffect(() => {
    if (!svgRef.current || !worldRef.current) return;

    const zoom = d3.zoom()
      .scaleExtent([0.6, 6])
      .on('start', () => {
        isPanningRef.current = true;
      })
      .on('zoom', (e) => {
        if (worldRef.current) {
          worldRef.current.setAttribute('transform', e.transform);
        }
      })
      .on('end', () => {
        isPanningRef.current = false;
      });
    
    const svg = d3.select(svgRef.current);
    svg.call(zoom).on('dblclick.zoom', null);
    svg.call(zoom.transform, d3.zoomIdentity.scale(1.03));
  }, []);

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

  return (
    <svg 
      ref={svgRef} 
      className="map" 
      viewBox={viewBox} 
      aria-label="Admin room map"
      style={{ touchAction: 'none', userSelect: 'none' }}
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
            style={{ cursor: 'default' }}
          />
        ))}
      </g>
    </svg>
  );
});

AdminMap.displayName = 'AdminMap';

export default AdminMap;

