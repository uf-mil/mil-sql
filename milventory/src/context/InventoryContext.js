import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { POOL, WORKBENCH_ITEMS, sample } from '../utils';

const InventoryContext = createContext(null);

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
};

export const InventoryProvider = ({ children }) => {
  // State
  const [inventoryData, setInventoryData] = useState(new Map());
  const [selectedBox, setSelectedBox] = useState(null);
  const [currentEditingBox, setCurrentEditingBox] = useState(null);
  const [currentEditingIndex, setCurrentEditingIndex] = useState(null);
  const [currentAddingBox, setCurrentAddingBox] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [draggedItemData, setDraggedItemData] = useState(null);
  const [currentDragOverBox, setCurrentDragOverBox] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, title: '', x: 0, y: 0 });
  const [rightTabWidth, setRightTabWidth] = useState(300);
  const [editFormHeight, setEditFormHeight] = useState(400);
  
  // Refs
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const worldRef = useRef(null);

  // Initialize inventory data
  useEffect(() => {
    // Top drawers A-K (11 drawers) - square and smaller
    const topDrawers = [];
    const drawerSize = 100; // Square drawers
    const drawerSpacing = 5;
    const topStartX = 150;
    const topY = 80;
    
    const drawerLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
    drawerLabels.forEach((label, index) => {
      topDrawers.push({
        title: `Drawer ${label}`,
        x: topStartX + index * (drawerSize + drawerSpacing),
        y: topY,
        width: drawerSize,
        height: drawerSize,
        fill: 'var(--drawer)'
      });
    });
    
    // Right side drawers L-AA (L through Z = 15, plus AA = 16 total) - square and smaller
    const rightDrawers = [];
    const rightDrawerSize = drawerSize; // Square drawers
    const rightDrawerSpacing = 5;
    const rightX = 1750;
    const rightStartY = 300;
    
    const rightDrawerLabels = ['L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'];
    rightDrawerLabels.forEach((label, index) => {
      rightDrawers.push({
        title: `Drawer ${label}`,
        x: rightX,
        y: rightStartY + index * (rightDrawerSize + rightDrawerSpacing),
        width: rightDrawerSize,
        height: rightDrawerSize,
        fill: 'var(--drawer)'
      });
    });
    
    // Top cabinets 1-4 (each is 2 drawers wide, positioned below drawers A-K)
    const topCabinets = [];
    const cabinetWidth = drawerSize * 2 + drawerSpacing; // 2 drawers wide
    const cabinetHeight = drawerSize + drawerSpacing;
    const cabinetSpacing = drawerSize + drawerSpacing*2; // Chair space between cabinets
    const cabinetY = topY + drawerSize + 20; // Below the drawers
    
    for (let i = 0; i < 4; i++) {
      const cabinetX = topStartX + i * (cabinetWidth + cabinetSpacing);
      topCabinets.push({
        title: `Cabinet ${i + 1}`,
        x: cabinetX,
        y: cabinetY,
        width: cabinetWidth,
        height: cabinetHeight,
        fill: 'var(--table)' // Using table color, adjust if needed
      });
    }
    
    // Right side cabinets 5-12 (each is 2 drawers wide, positioned to the left of drawers L-AA)
    const rightCabinets = [];
    const rightCabinetWidth = rightDrawerSize + rightDrawerSpacing; // 1 drawers wide
    const rightCabinetHeight = rightDrawerSize * 2 + rightDrawerSpacing; // 2 drawers tall
    const rightCabinetX = rightX - rightCabinetWidth - 20; // To the left of drawers
    
    for (let i = 0; i < 8; i++) {
      const cabinetY = rightStartY + i * 2 * (rightDrawerSize + rightDrawerSpacing);
      rightCabinets.push({
        title: `Cabinet ${i + 5}`,
        x: rightCabinetX,
        y: cabinetY,
        width: rightCabinetWidth,
        height: rightCabinetHeight,
        fill: 'var(--table)' // Using table color, adjust if needed
      });
    }
    
    const boxes = [
      ...topDrawers,
      ...rightDrawers,
      ...topCabinets,
      ...rightCabinets,
      { title: 'Workbench', x: 140, y: 400, width: 150, height: 170, fill: '#e7ebf3', isWorkbench: true },
      { title: 'File Cabinet 103', x: 140, y: 800, width: 200, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 102', x: 140, y: 1100, width: 200, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 101', x: 140, y: 1400, width: 200, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 100', x: 140, y: 1700, width: 200, height: 280, fill: 'var(--files)' },
      { title: 'Table A', x: 600, y: 720, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table B', x: 1060, y: 720, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table C', x: 600, y: 1340, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table D', x: 1060, y: 1340, width: 300, height: 200, fill: 'var(--table)' },
    ];

    const newInventoryData = new Map();
    boxes.forEach(box => {
      const items = box.isWorkbench ? sample(WORKBENCH_ITEMS, 4) : sample(POOL, 4);
      const inventory = items.map(name => ({
        name: name.trim(),
        qty: Math.floor(Math.random() * 5) + 1,
        description: '',
        image: null
      }));
      newInventoryData.set(box.title, { ...box, inventory });
    });
    setInventoryData(newInventoryData);
  }, []);

  // Setup D3 zoom
  useEffect(() => {
    if (!svgRef.current || !worldRef.current) return;

    const zoom = d3.zoom()
      .scaleExtent([0.6, 6])
      .on('zoom', (e) => {
        if (worldRef.current) {
          worldRef.current.setAttribute('transform', e.transform);
        }
      });
    
    const svg = d3.select(svgRef.current);
    svg.call(zoom).on('dblclick.zoom', null);
    svg.call(zoom.transform, d3.zoomIdentity.scale(1.03));
  }, []);

  // Update CSS variables
  useEffect(() => {
    document.body.style.setProperty('--right-tab-width', `${rightTabWidth}px`);
  }, [rightTabWidth]);

  useEffect(() => {
    const rightTab = document.querySelector('.right-tab');
    if (rightTab) {
      rightTab.style.setProperty('--edit-form-height', `${editFormHeight}px`);
    }
  }, [editFormHeight]);

  // Handlers
  const handleBoxClick = useCallback((boxTitle) => {
    setSelectedBox(boxTitle);
    setCurrentEditingBox(null);
    setCurrentEditingIndex(null);
    setLastSelectedIndex(null);
    setCurrentAddingBox(null);
    setTooltip({ visible: false, title: '', x: 0, y: 0 });
  }, []);

  const handleBoxHover = useCallback((boxTitle, x, y) => {
    const boxData = inventoryData.get(boxTitle);
    if (boxData) {
      setTooltip({ visible: true, title: boxTitle, x, y });
    }
  }, [inventoryData]);

  const handleBoxHoverLeave = useCallback(() => {
    setTooltip({ visible: false, title: '', x: 0, y: 0 });
  }, []);

  const updateInventory = useCallback((boxTitle, newInventory) => {
    setInventoryData(prev => {
      const next = new Map(prev);
      const boxData = next.get(boxTitle);
      if (boxData) {
        next.set(boxTitle, { ...boxData, inventory: newInventory });
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((boxTitle, index, isMultiple, selectedIndices) => {
    const boxData = inventoryData.get(boxTitle);
    if (!boxData) return;

    if (isMultiple && selectedIndices.length > 1) {
      const items = selectedIndices.map(idx => ({ ...boxData.inventory[idx] }));
      setDraggedItemData({
        sourceBox: boxTitle,
        sourceIndices: selectedIndices,
        items,
        isMultiple: true
      });
    } else {
      setDraggedItemData({
        sourceBox: boxTitle,
        sourceIndex: index,
        item: { ...boxData.inventory[index] },
        isMultiple: false
      });
    }
  }, [inventoryData]);

  const handleDrop = useCallback((targetBoxTitle) => {
    if (!draggedItemData || draggedItemData.sourceBox === targetBoxTitle) return;

    const sourceBoxData = inventoryData.get(draggedItemData.sourceBox);
    const targetBoxData = inventoryData.get(targetBoxTitle);
    if (!sourceBoxData || !targetBoxData) return;

    let newSourceInventory = [...sourceBoxData.inventory];
    let newTargetInventory = [...targetBoxData.inventory];

    if (draggedItemData.isMultiple) {
      const sortedIndices = [...draggedItemData.sourceIndices].sort((a, b) => b - a);
      sortedIndices.forEach(idx => {
        newSourceInventory.splice(idx, 1);
      });
      newTargetInventory.push(...draggedItemData.items);
    } else {
      newSourceInventory.splice(draggedItemData.sourceIndex, 1);
      newTargetInventory.push(draggedItemData.item);
    }

    updateInventory(draggedItemData.sourceBox, newSourceInventory);
    updateInventory(targetBoxTitle, newTargetInventory);

    // Auto-select the target box after successful drop
    setSelectedBox(targetBoxTitle);
    setCurrentEditingBox(null);
    setCurrentEditingIndex(null);
    setLastSelectedIndex(null);

    setDraggedItemData(null);
    setCurrentDragOverBox(null);
  }, [draggedItemData, inventoryData, updateInventory]);

  const value = {
    // State
    inventoryData,
    selectedBox,
    currentEditingBox,
    currentEditingIndex,
    currentAddingBox,
    lastSelectedIndex,
    draggedItemData,
    currentDragOverBox,
    tooltip,
    rightTabWidth,
    editFormHeight,
    // Setters
    setInventoryData,
    setSelectedBox,
    setCurrentEditingBox,
    setCurrentEditingIndex,
    setCurrentAddingBox,
    setLastSelectedIndex,
    setDraggedItemData,
    setCurrentDragOverBox,
    setTooltip,
    setRightTabWidth,
    setEditFormHeight,
    // Refs
    wrapRef,
    svgRef,
    worldRef,
    // Handlers
    handleBoxClick,
    handleBoxHover,
    handleBoxHoverLeave,
    updateInventory,
    handleDragStart,
    handleDrop,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

