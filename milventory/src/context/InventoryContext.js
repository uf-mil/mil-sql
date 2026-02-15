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
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  
  // SOT Inventory Table state
  const [sotInventoryItems, setSotInventoryItems] = useState(new Map());
  const [selectedSOTItem, setSelectedSOTItem] = useState(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(300);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  
  // Add Mode state
  const [addModeItem, setAddModeItem] = useState(null);
  const [addModeQtyPerClick, setAddModeQtyPerClick] = useState(1);
  const [addModePending, setAddModePending] = useState(new Map()); // Map<boxTitle, qty>
  const addModePreviewRef = useRef(null);
  const addModeItemRef = useRef(null);
  const addModePendingRef = useRef(new Map());
  const addModeQtyPerClickRef = useRef(1);
  
  // Keep refs in sync with state
  useEffect(() => {
    addModeItemRef.current = addModeItem;
  }, [addModeItem]);
  
  useEffect(() => {
    addModePendingRef.current = addModePending;
  }, [addModePending]);

  useEffect(() => {
    addModeQtyPerClickRef.current = addModeQtyPerClick;
  }, [addModeQtyPerClick]);
  
  // Refs
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const worldRef = useRef(null);
  const isPanningRef = useRef(false);

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
          // Ensure inventory array exists - simplified structure: name + qty (+ optional shelf)
          const inventory = (box.inventory || []).map(item => ({
            name: item.name || '',
            qty: item.qty || 1,
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

  // Update CSS variables
  useEffect(() => {
    document.body.style.setProperty('--left-pane-width', `${leftPaneWidth}px`);
  }, [leftPaneWidth]);

  // Load SOT inventory items from JSON
  useEffect(() => {
    const loadSOTItems = async () => {
      try {
        const response = await fetch('/sot-inventory-items.json');
        if (!response.ok) {
          throw new Error('Failed to load SOT inventory items');
        }
        const data = await response.json();
        
        const newSOTItems = new Map();
        (data.items || []).forEach(item => {
          newSOTItems.set(item.name, {
            name: item.name,
            description: item.description || '',
            image: item.image || null,
            locations: item.locations || [],
            lastModified: item.lastModified || null
          });
        });
        
        setSotInventoryItems(newSOTItems);
      } catch (error) {
        console.error('Error loading SOT inventory items:', error);
        setSotInventoryItems(new Map());
      }
    };
    
    loadSOTItems();
  }, []);

  // Load pane state from localStorage
  useEffect(() => {
    const savedLeftWidth = localStorage.getItem('leftPaneWidth');
    const savedLeftCollapsed = localStorage.getItem('leftPaneCollapsed');
    const savedRightCollapsed = localStorage.getItem('rightPaneCollapsed');
    if (savedLeftWidth) setLeftPaneWidth(parseInt(savedLeftWidth, 10));
    if (savedLeftCollapsed === 'true') setLeftPaneCollapsed(true);
    if (savedRightCollapsed === 'true') setRightPaneCollapsed(true);
  }, []);

  // Save pane state to localStorage
  useEffect(() => {
    localStorage.setItem('leftPaneWidth', leftPaneWidth.toString());
    localStorage.setItem('leftPaneCollapsed', leftPaneCollapsed.toString());
    localStorage.setItem('rightPaneCollapsed', rightPaneCollapsed.toString());
  }, [leftPaneWidth, leftPaneCollapsed, rightPaneCollapsed]);


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
    if (isPanningRef.current) return; // Skip during pan/zoom to avoid re-render storm
    const boxData = inventoryData.get(boxTitle);
    if (boxData) {
      setTooltip({ visible: true, title: boxTitle, x, y });
    }
  }, [inventoryData]);

  const handleBoxHoverLeave = useCallback(() => {
    if (isPanningRef.current) return; // Skip during pan/zoom
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

  // Add Mode functions
  const startAddMode = useCallback((itemName) => {
    setAddModeItem(itemName);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
    setSelectedBox(null); // Clear box selection when entering add mode
    setSelectedSOTItem(null); // Clear SOT preview when entering add mode
  }, []);

  // shelf is optional — undefined for non-shelf boxes, number for Tall Cabinet shelves
  const handleBoxClickAddMode = useCallback((boxTitle, shelf) => {
    const qty = addModeQtyPerClickRef.current;
    const key = shelf !== undefined ? `${boxTitle}||${shelf}` : boxTitle;
    setAddModePending(prev => {
      const next = new Map(prev);
      const existing = next.get(key) || 0;
      next.set(key, existing + qty);
      return next;
    });
  }, []);

  // Check if any pending entry belongs to a given box (handles compound keys)
  const boxHasAnyPending = useCallback((boxTitle) => {
    for (const key of addModePending.keys()) {
      if (key === boxTitle || key.startsWith(boxTitle + '||')) return true;
    }
    return false;
  }, [addModePending]);

  const finishAddMode = useCallback(() => {
    const currentItem = addModeItemRef.current;
    const pending = addModePendingRef.current;
    
    if (!currentItem) {
      setAddModeItem(null);
      setAddModeQtyPerClick(1);
      setAddModePending(new Map());
      return;
    }

    // Group pending entries by box title so we apply all changes per box in one pass
    const byBox = new Map();
    pending.forEach((qty, key) => {
      const parts = key.split('||');
      const boxTitle = parts[0];
      const shelf = parts.length > 1 ? parseInt(parts[1], 10) : undefined;
      if (!byBox.has(boxTitle)) byBox.set(boxTitle, []);
      byBox.get(boxTitle).push({ shelf, qty });
    });

    byBox.forEach((entries, boxTitle) => {
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;

      const newInventory = [...boxData.inventory];

      entries.forEach(({ shelf, qty }) => {
        // Find existing item matching name AND shelf
        const existingIndex = newInventory.findIndex(item => {
          if (item.name !== currentItem) return false;
          if (shelf !== undefined) return (item.shelf ?? 0) === shelf;
          return true;
        });

        if (existingIndex >= 0) {
          newInventory[existingIndex] = {
            ...newInventory[existingIndex],
            qty: newInventory[existingIndex].qty + qty
          };
        } else {
          const newItem = { name: currentItem, qty };
          if (shelf !== undefined) newItem.shelf = shelf;
          newInventory.push(newItem);
        }
      });

      updateInventory(boxTitle, newInventory);
    });

    // Clear add mode
    setAddModeItem(null);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
  }, [inventoryData, updateInventory]);

  const cancelAddMode = useCallback(() => {
    setAddModeItem(null);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
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

  // SOT Item helper functions
  const resolveSOTItem = useCallback((itemName) => {
    return sotInventoryItems.get(itemName) || null;
  }, [sotInventoryItems]);

  const computeSOTQuantities = useCallback(() => {
    const quantities = new Map();
    inventoryData.forEach((boxData, boxTitle) => {
      boxData.inventory.forEach(item => {
        const currentQty = quantities.get(item.name) || 0;
        quantities.set(item.name, currentQty + (item.qty || 0));
      });
    });
    return quantities;
  }, [inventoryData]);

  const getItemLocations = useCallback((itemName) => {
    const locations = [];
    inventoryData.forEach((boxData, boxTitle) => {
      const hasItem = boxData.inventory.some(item => item.name === itemName);
      if (hasItem) {
        locations.push(boxTitle);
      }
    });
    return locations;
  }, [inventoryData]);

  const addSOTItem = useCallback((item) => {
    setSotInventoryItems(prev => {
      const next = new Map(prev);
      next.set(item.name, { ...item, lastModified: new Date().toISOString() });
      return next;
    });
  }, []);

  const updateSOTItem = useCallback((oldName, newItem) => {
    setSotInventoryItems(prev => {
      const next = new Map(prev);
      if (oldName !== newItem.name) {
        next.delete(oldName);
        // Update all box references if name changed
        setInventoryData(prevData => {
          const newData = new Map(prevData);
          newData.forEach((boxData, boxTitle) => {
            const updatedInventory = boxData.inventory.map(item => 
              item.name === oldName ? { ...item, name: newItem.name } : item
            );
            newData.set(boxTitle, { ...boxData, inventory: updatedInventory });
          });
          return newData;
        });
      }
      next.set(newItem.name, { ...newItem, lastModified: new Date().toISOString() });
      return next;
    });
  }, []);

  const deleteSOTItem = useCallback((itemName) => {
    setSotInventoryItems(prev => {
      const next = new Map(prev);
      next.delete(itemName);
      return next;
    });
    // Remove from all boxes
    setInventoryData(prev => {
      const newData = new Map(prev);
      newData.forEach((boxData, boxTitle) => {
        const updatedInventory = boxData.inventory.filter(item => item.name !== itemName);
        newData.set(boxTitle, { ...boxData, inventory: updatedInventory });
      });
      return newData;
    });
    // Close preview if this item was selected
    if (selectedSOTItem === itemName) {
      setSelectedSOTItem(null);
    }
  }, [selectedSOTItem]);

  const clearSelectedSOTItem = useCallback(() => {
    setSelectedSOTItem(null);
  }, []);

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
    rightPaneCollapsed,
    // SOT Inventory state
    sotInventoryItems,
    selectedSOTItem,
    leftPaneWidth,
    leftPaneCollapsed,
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
    setRightPaneCollapsed,
    setSotInventoryItems,
    setSelectedSOTItem,
    setLeftPaneWidth,
    setLeftPaneCollapsed,
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
    // SOT Item helpers
    resolveSOTItem,
    computeSOTQuantities,
    getItemLocations,
    addSOTItem,
    updateSOTItem,
    deleteSOTItem,
    clearSelectedSOTItem,
    // Add Mode
    addModeItem,
    addModeQtyPerClick,
    setAddModeQtyPerClick,
    addModePending,
    addModePreviewRef,
    startAddMode,
    finishAddMode,
    cancelAddMode,
    handleBoxClickAddMode,
    boxHasAnyPending,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};

