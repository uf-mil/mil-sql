import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

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
  const [inventoryBounds, setInventoryBounds] = useState(null);
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

  // Initialize inventory data from JSON
  useEffect(() => {
    const loadInventoryData = async () => {
      try {
        const response = await fetch('/inventory-locations.json');
        if (!response.ok) {
          throw new Error('Failed to load inventory data');
        }
        const data = await response.json();
        
        // Store inventory bounds
        if (data['inventory-bounds']) {
          setInventoryBounds(data['inventory-bounds']);
        }
        
        const newInventoryData = new Map();
        data.boxes.forEach(box => {
          // Ensure inventory array exists and items have the correct structure
          const inventory = (box.inventory || []).map(item => ({
            name: item.name || '',
            qty: item.qty || 1,
            description: item.description || '',
            image: item.image || null,
            shelf: item.shelf !== undefined ? item.shelf : undefined
          }));
          
          newInventoryData.set(box.title, {
            ...box,
            inventory
          });
        });
        
        setInventoryData(newInventoryData);
      } catch (error) {
        console.error('Error loading inventory data:', error);
        // Fallback to empty data if JSON fails to load
        setInventoryData(new Map());
      }
    };
    
    loadInventoryData();
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
    inventoryBounds,
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

