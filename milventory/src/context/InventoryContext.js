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
  const [currentAddingIndex, setCurrentAddingIndex] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [draggedItemData, setDraggedItemData] = useState(null);
  const [currentDragOverBox, setCurrentDragOverBox] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, title: '', x: 0, y: 0 });
  const [rightTabWidth, setRightTabWidth] = useState(300);
  
  // Refs
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const worldRef = useRef(null);

  // Initialize inventory data
  useEffect(() => {
    
    const boxes = [
      // Top Drawers A-K
      { title: 'Drawer A', x: 400, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer B', x: 505, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer C', x: 610, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer D', x: 715, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer E', x: 820, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer F', x: 925, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer G', x: 1030, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer H', x: 1135, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer I', x: 1240, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer J', x: 1345, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer K', x: 1450, y: 80, width: 100, height: 100, fill: 'var(--drawer)' },

// Right Drawers L-AA
      { title: 'Drawer L', x: 1750, y: 300, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer M', x: 1750, y: 405, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer N', x: 1750, y: 510, width: 100, height: 205, fill: 'var(--drawer)' },
      { title: 'Drawer O', x: 1750, y: 720, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer P', x: 1750, y: 825, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer R', x: 1750, y: 930, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer S', x: 1750, y: 1035, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer T', x: 1750, y: 1140, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer U', x: 1750, y: 1245, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer V', x: 1750, y: 1350, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer W', x: 1750, y: 1455, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer X', x: 1750, y: 1560, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer Y', x: 1750, y: 1665, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer Z', x: 1750, y: 1770, width: 100, height: 100, fill: 'var(--drawer)' },
      { title: 'Drawer AA', x: 1750, y: 1875, width: 100, height: 100, fill: 'var(--drawer)' },

// Top Cabinets 1-4
      { title: 'Cabinet 1', x: 400, y: 200, width: 205, height: 105, fill: 'var(--table)' },
      { title: 'Cabinet 2', x: 715, y: 200, width: 205, height: 105, fill: 'var(--table)' },
      { title: 'Cabinet 3', x: 1030, y: 200, width: 205, height: 105, fill: 'var(--table)' },
      { title: 'Cabinet 4', x: 1345, y: 200, width: 205, height: 105, fill: 'var(--table)' },

// Right Cabinets 5-12
      { title: 'Cabinet 5', x: 1625, y: 300, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 6', x: 1625, y: 510, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 7', x: 1625, y: 720, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 8', x: 1625, y: 930, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 9', x: 1625, y: 1140, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 10', x: 1625, y: 1350, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 11', x: 1625, y: 1560, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Cabinet 12', x: 1625, y: 1770, width: 105, height: 205, fill: 'var(--table)' },
      { title: 'Workbench', x: 140, y: 500, width: 200, height: 280, fill: '#e7ebf3', isWorkbench: true },
      { title: 'File Cabinet 103', x: 140, y: 800, width: 160, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 102', x: 140, y: 1100, width: 160, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 101', x: 140, y: 1400, width: 160, height: 280, fill: 'var(--files)' },
      { title: 'File Cabinet 100', x: 140, y: 1700, width: 160, height: 280, fill: 'var(--files)' },
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
    currentAddingIndex,
    lastSelectedIndex,
    draggedItemData,
    currentDragOverBox,
    tooltip,
    rightTabWidth,
    // Setters
    setInventoryData,
    setSelectedBox,
    setCurrentEditingBox,
    setCurrentEditingIndex,
    setCurrentAddingBox,
    setCurrentAddingIndex,
    setLastSelectedIndex,
    setDraggedItemData,
    setCurrentDragOverBox,
    setTooltip,
    setRightTabWidth,
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

