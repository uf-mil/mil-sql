import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { useInventory, FREE_SUBTRACT_DOT_PREFIX } from '../../context/InventoryContext';

const FreePlaceDots = () => {
  const gRef = useRef(null);
  const {
    selectedMasterItem,
    subtractModeItem,
    moveModeItem,
    freePlaceModeItem,
    freePlacementsBySupplyPublicId,
    freePlaceVisualDots,
    subtractModePending,
    moveModeFreeCoordById,
    updateFreePlaceSessionCoord,
    updateMoveModeFreeDotPosition,
    updateMoveModeDotDragLiveForArrows,
    moveModeDotDragLiveByIdRef,
    requestMasterArrowsRedraw,
    handleFreePlaceSessionDotDelete,
    handleSubtractFreeDotClick
  } = useInventory();

  const dotItemName =
    subtractModeItem || moveModeItem || freePlaceModeItem || selectedMasterItem || null;

  const dots = useMemo(() => {
    if (!dotItemName) return [];
    if (freePlaceModeItem && dotItemName === freePlaceModeItem && freePlaceVisualDots != null) {
      return freePlaceVisualDots;
    }
    return freePlacementsBySupplyPublicId.get(dotItemName) || [];
  }, [dotItemName, freePlaceModeItem, freePlaceVisualDots, freePlacementsBySupplyPublicId]);

  const displayDots = useMemo(() => {
    if (!subtractModeItem || dotItemName !== subtractModeItem) return dots;
    return dots
      .map((d) => {
        const key = `${FREE_SUBTRACT_DOT_PREFIX}||${d.id}`;
        const pending = subtractModePending.get(key) || 0;
        const displayQty = (d.qty || 0) - pending;
        if (displayQty <= 0) return null;
        return { ...d, displayQty, pendingSubtract: pending };
      })
      .filter(Boolean);
  }, [dots, dotItemName, subtractModeItem, subtractModePending]);

  const dotsInteractiveSubtract = Boolean(
    subtractModeItem && dotItemName === subtractModeItem
  );
  const dotsInteractiveMove = Boolean(moveModeItem && dotItemName === moveModeItem);
  const dotsInteractiveFreePlace = Boolean(
    freePlaceModeItem && dotItemName === freePlaceModeItem
  );
  const dotsInteractive =
    dotsInteractiveSubtract || dotsInteractiveMove || dotsInteractiveFreePlace;
  const allowDrag = dotsInteractiveMove || dotsInteractiveFreePlace;

  const renderDots = useMemo(() => {
    if (!dotsInteractiveMove) return displayDots;
    return displayDots.map((d) => {
      const o = moveModeFreeCoordById.get(d.id);
      if (!o) return d;
      return { ...d, x: o.x, y: o.y };
    });
  }, [displayDots, dotsInteractiveMove, moveModeFreeCoordById]);

  useEffect(() => {
    if (!gRef.current) return;
    const g = d3.select(gRef.current);
    g.selectAll('*').remove();
    if (!dotItemName || renderDots.length === 0) return;

    const drag = d3
      .drag()
      .filter((event) => {
        if (event.ctrlKey || event.button) return false;
        const t = event.type;
        if ((t === 'mousedown' || t === 'pointerdown') && event.detail > 1) return false;
        return true;
      })
      .clickDistance(4)
      .on('start', (event) => {
        event.sourceEvent?.stopPropagation?.();
      })
      .on('drag', function dragMove(event, d) {
        if (!allowDrag) return;
        const node = d3.select(this);
        const cx = (+node.attr('cx') || 0) + event.dx;
        const cy = (+node.attr('cy') || 0) + event.dy;
        node.attr('cx', cx).attr('cy', cy);
        if (dotsInteractiveMove) {
          updateMoveModeDotDragLiveForArrows(d.id, cx, cy);
        }
      })
      .on('end', function dragEnd(event, d) {
        if (!allowDrag) return;
        const cx = +d3.select(this).attr('cx');
        const cy = +d3.select(this).attr('cy');
        const ox = d.x;
        const oy = d.y;
        const significant = Math.hypot(cx - ox, cy - oy) >= 0.5;
        if (dotsInteractiveMove) {
          moveModeDotDragLiveByIdRef.current.delete(d.id);
          if (!significant) requestMasterArrowsRedraw();
        }
        if (!significant) return;
        if (dotsInteractiveMove) {
          updateMoveModeFreeDotPosition(d.id, cx, cy);
        } else if (dotsInteractiveFreePlace) {
          updateFreePlaceSessionCoord(d.id, cx, cy);
        }
      });

    const cursor = dotsInteractiveSubtract
      ? 'pointer'
      : allowDrag
        ? 'grab'
        : 'default';

    const circles = g
      .selectAll('circle')
      .data(renderDots, (d) => d.id)
      .join('circle')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('r', dotsInteractive ? 12 : 9)
      .attr('class', 'free-place-dot')
      .style('cursor', cursor)
      .style('fill', 'var(--accent)')
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('opacity', (d) =>
        dotsInteractiveSubtract && d.pendingSubtract > 0 ? 0.62 : 1
      )
      .style('pointer-events', dotsInteractive ? 'all' : 'none')
      .on('click', (e, d) => {
        if (!dotsInteractiveSubtract) return;
        e.stopPropagation();
        e.preventDefault();
        void handleSubtractFreeDotClick(d.id);
      })
      .on('dblclick', (e, d) => {
        if (!dotsInteractiveFreePlace) return;
        e.stopPropagation();
        e.preventDefault();
        handleFreePlaceSessionDotDelete(d.id);
      });

    if (allowDrag) {
      circles.call(drag);
    }
  }, [
    renderDots,
    dotItemName,
    dotsInteractive,
    dotsInteractiveSubtract,
    dotsInteractiveMove,
    dotsInteractiveFreePlace,
    allowDrag,
    updateFreePlaceSessionCoord,
    updateMoveModeFreeDotPosition,
    updateMoveModeDotDragLiveForArrows,
    moveModeDotDragLiveByIdRef,
    requestMasterArrowsRedraw,
    handleFreePlaceSessionDotDelete,
    handleSubtractFreeDotClick
  ]);

  if (!dotItemName || renderDots.length === 0) return null;

  return <g ref={gRef} className="free-place-dots-layer" />;
};

export default FreePlaceDots;
