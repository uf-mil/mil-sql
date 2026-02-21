import React, { useEffect, useRef, useCallback } from 'react';
import { useInventory } from '../context/InventoryContext';
import * as d3 from 'd3';

const AddModeArrow = () => {
  const { addModeItem, svgRef, addModePreviewRef } = useInventory();
  const arrowRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
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

  const updateArrowPath = useCallback(() => {
    if (!arrowRef.current || !svgRef.current || !addModePreviewRef.current) return;

    const previewPane = addModePreviewRef.current;
    const previewRect = previewPane.getBoundingClientRect();

    // Get preview pane right edge in world coordinates
    const preview = screenToWorld(previewRect.right, previewRect.top + 50);
    const previewX = preview.x;
    const previewY = preview.y;

    const mx = mousePosRef.current.x;
    const my = mousePosRef.current.y;

    // Draw arrow from preview to mouse
    const path = d3.path();
    const dx = mx - previewX;
    const dy = my - previewY;

    // Curved path
    const cp1x = previewX + dx * 0.3;
    const cp1y = previewY;
    const cp2x = mx - dx * 0.3;
    const cp2y = my;

    path.moveTo(previewX, previewY);
    path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, mx, my);

    // Arrowhead
    const angle = Math.atan2(dy, dx);
    const arrowLength = 12;
    const arrowAngle = Math.PI / 6;
    const arrowX = mx - Math.cos(angle) * 20;
    const arrowY = my - Math.sin(angle) * 20;

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

    arrowRef.current.setAttribute('d', path.toString());
  }, [svgRef, addModePreviewRef, screenToWorld]);

  useEffect(() => {
    if (!addModeItem || !svgRef.current) return;

    const svg = svgRef.current;

    const scheduleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateArrowPath);
    };

    const handleMouseMove = (e) => {
      // Convert screen coordinates to world-group coordinates — store in ref, no re-render
      mousePosRef.current = screenToWorld(e.clientX, e.clientY);
      scheduleUpdate();
    };

    // Listen for mouse movement (passive so it never blocks pointer events / d3 zoom)
    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Listen for zoom/pan changes via MutationObserver on the world group
    const world = svg.querySelector('#world');
    let observer;
    if (world) {
      observer = new MutationObserver(() => {
        scheduleUpdate();
      });
      observer.observe(world, { attributes: true, attributeFilter: ['transform'] });
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (observer) observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [addModeItem, svgRef, updateArrowPath, screenToWorld]);

  if (!addModeItem) return null;

  return <path ref={arrowRef} className="add-mode-arrow" />;
};

export default AddModeArrow;
