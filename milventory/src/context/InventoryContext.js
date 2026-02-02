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
    const boxes = [
      { title: 'Workbench', x: 140, y: 300, width: 150, height: 170, fill: '#e7ebf3', isWorkbench: true },
      { title: 'File Cabinet A', x: 140, y: 700, width: 200, height: 260, fill: 'var(--files)' },
      { title: 'File Cabinet B', x: 140, y: 1000, width: 200, height: 260, fill: 'var(--files)' },
      { title: 'Drawer T1', x: 200, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer T2', x: 410, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer T3', x: 620, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer T4', x: 830, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer T5', x: 1040, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer T6', x: 1250, y: 120, width: 190, height: 120, fill: 'var(--drawer)' },
      { title: 'Drawer R1', x: 1340, y: 320, width: 170, height: 170, fill: 'var(--drawer)' },
      { title: 'Drawer R2', x: 1340, y: 520, width: 170, height: 170, fill: 'var(--drawer)' },
      { title: 'Drawer R3', x: 1340, y: 720, width: 170, height: 170, fill: 'var(--drawer)' },
      { title: 'Drawer R4', x: 1340, y: 920, width: 170, height: 170, fill: 'var(--drawer)' },
      { title: 'Drawer R5', x: 1340, y: 1120, width: 170, height: 170, fill: 'var(--drawer)' },
      { title: 'Table A', x: 420, y: 520, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table B', x: 880, y: 520, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table C', x: 420, y: 940, width: 300, height: 200, fill: 'var(--table)' },
      { title: 'Table D', x: 880, y: 940, width: 300, height: 200, fill: 'var(--table)' },
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

