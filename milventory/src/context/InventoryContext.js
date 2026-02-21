import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { api } from '../api';

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
  
  // Master Inventory Table state
  const [masterInventoryItems, setMasterInventoryItems] = useState(new Map());
  const [selectedMasterItem, setSelectedMasterItem] = useState(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(300);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  
  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Supply name to ID mapping (for API calls)
  const [supplyNameToId, setSupplyNameToId] = useState(new Map());
  
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

  // Initialize inventory data from JSON (layout only) and API (inventory data)
  useEffect(() => {
    const loadInventoryData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // 1. Load layout from JSON (no inventory arrays)
        const response = await fetch('/inventory-locations.json');
        if (!response.ok) {
          throw new Error('Failed to load inventory layout');
        }
        const data = await response.json();
        
        // Store inventory bounds
        if (data['inventory-bounds']) {
          setInventoryBounds(data['inventory-bounds']);
        }
        
        // Initialize inventoryData with layout only (empty inventory arrays)
        const newInventoryData = new Map();
        data.boxes.forEach(box => {
          newInventoryData.set(box.title, {
            ...box,
            inventory: [] // Will be populated from API
          });
        });
        
        setInventoryData(newInventoryData);
        
        // 2. Load supply locations from API and merge into inventoryData
        try {
          const supplyLocations = await api.getAllSupplyLocations();
          
          // Group by location_name and merge into inventoryData
          const locationMap = new Map();
          supplyLocations.forEach(sl => {
            const key = sl.location;
            if (!locationMap.has(key)) {
              locationMap.set(key, []);
            }
            locationMap.get(key).push({
              name: sl.supply_name || '', // From JOIN in API
              qty: sl.qty, // API maps amount to qty
              shelf: sl.shelf !== null ? sl.shelf : undefined
            });
          });
          
          // Merge into inventoryData
          setInventoryData(prev => {
            const next = new Map(prev);
            locationMap.forEach((items, locationName) => {
              const boxData = next.get(locationName);
              if (boxData) {
                next.set(locationName, {
                  ...boxData,
                  inventory: items
                });
              }
            });
            return next;
          });
        } catch (apiError) {
          console.error('Error loading supply locations from API:', apiError);
          // Continue with empty inventory arrays if API fails
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading inventory data:', error);
        setError(error.message || 'Failed to load inventory data');
        setIsLoading(false);
        // Fallback to empty data if JSON fails to load
        setInventoryData(new Map());
      }
    };
    
    loadInventoryData();
  }, []);

  // Setup D3 zoom — re-run when isLoading changes because SVG doesn't exist during loading
  useEffect(() => {
    if (isLoading || !svgRef.current || !worldRef.current) return;

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
  }, [isLoading]);

  // Update CSS variables
  useEffect(() => {
    document.body.style.setProperty('--left-pane-width', `${leftPaneWidth}px`);
  }, [leftPaneWidth]);

  // Load Master inventory items (supplies catalog) from API
  useEffect(() => {
    const loadMasterItems = async () => {
      try {
        const supplies = await api.getSupplies();
        
        const newMasterItems = new Map();
        const nameToIdMap = new Map();
        
        supplies.forEach(supply => {
          // Build name to ID mapping
          nameToIdMap.set(supply.name, supply.id);
          
          // Convert API response to Master item format
          // API returns locations[] with {location, shelf, qty}
          const locations = (supply.locations || []).map(loc => {
            if (loc.shelf !== null && loc.shelf !== undefined) {
              return `${loc.location} (Shelf ${loc.shelf})`;
            }
            return loc.location;
          });
          
          newMasterItems.set(supply.name, {
            name: supply.name,
            description: supply.description || '',
            image: supply.image || null,
            locations: locations,
            teams: supply.teams || [],
            categories: supply.categories || [],
            lastModified: supply.lastModified || null,
            last_modified_by: supply.last_modified_by || null,
            last_modified_by_name: supply.last_modified_by_name || null,
            id: supply.id // Store ID for API calls
          });
        });
        
        setMasterInventoryItems(newMasterItems);
        setSupplyNameToId(nameToIdMap);
      } catch (error) {
        console.error('Error loading Master inventory items from API:', error);
        if (error.message === 'Authentication required') {
          setError('Authentication required. Please login.');
        }
        setMasterInventoryItems(new Map());
        setSupplyNameToId(new Map());
      }
    };
    
    if (!isLoading) {
      loadMasterItems();
    }
  }, [isLoading]);

  // Load pane state from localStorage
  useEffect(() => {
    const savedLeftWidth = localStorage.getItem('leftPaneWidth');
    const savedLeftCollapsed = localStorage.getItem('leftPaneCollapsed');
    if (savedLeftWidth) setLeftPaneWidth(parseInt(savedLeftWidth, 10));
    if (savedLeftCollapsed === 'true') setLeftPaneCollapsed(true);
  }, []);

  // Save pane state to localStorage
  useEffect(() => {
    localStorage.setItem('leftPaneWidth', leftPaneWidth.toString());
    localStorage.setItem('leftPaneCollapsed', leftPaneCollapsed.toString());
  }, [leftPaneWidth, leftPaneCollapsed]);


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

  const updateInventory = useCallback(async (boxTitle, newInventory) => {
    // Update local state immediately (optimistic update)
    setInventoryData(prev => {
      const next = new Map(prev);
      const boxData = next.get(boxTitle);
      if (boxData) {
        next.set(boxTitle, { ...boxData, inventory: newInventory });
      }
      return next;
    });
    
    // Sync to API (fire and forget for now - could add error handling later)
    try {
      // Get current supply locations for this box
      const currentLocations = await api.getLocationSupplies(boxTitle);
      
      // Build maps for comparison
      const currentMap = new Map();
      currentLocations.forEach(sl => {
        const key = `${sl.supply_name}||${sl.shelf !== null ? sl.shelf : 'null'}`;
        currentMap.set(key, { id: sl.id, qty: sl.qty });
      });
      
      const newMap = new Map();
      newInventory.forEach(item => {
        const key = `${item.name}||${item.shelf !== undefined ? item.shelf : 'null'}`;
        const supplyId = supplyNameToId.get(item.name);
        if (supplyId) {
          newMap.set(key, { supplyId, qty: item.qty, shelf: item.shelf });
        }
      });
      
      // Calculate differences and sync
      const toAdd = [];
      const toUpdate = [];
      const toDelete = [];
      
      // Items to add or update
      newMap.forEach((newItem, key) => {
        const current = currentMap.get(key);
        if (!current) {
          // New item
          toAdd.push({
            supply_id: newItem.supplyId,
            location_name: boxTitle,
            shelf: newItem.shelf !== undefined ? newItem.shelf : null,
            amount: newItem.qty
          });
        } else if (current.qty !== newItem.qty) {
          // Update quantity
          toUpdate.push({ id: current.id, amount: newItem.qty });
        }
      });
      
      // Items to delete
      currentMap.forEach((current, key) => {
        if (!newMap.has(key)) {
          toDelete.push(current.id);
        }
      });
      
      // Execute API calls
      for (const entry of toAdd) {
        await api.addSupplyLocation(entry);
      }
      for (const update of toUpdate) {
        await api.updateSupplyLocation(update.id, { amount: update.amount });
      }
      for (const id of toDelete) {
        await api.deleteSupplyLocation(id);
      }
    } catch (error) {
      console.error('Error syncing inventory to API:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to sync inventory changes');
      }
    }
  }, [supplyNameToId]);

  // Add Mode functions
  const startAddMode = useCallback((itemName) => {
    setAddModeItem(itemName);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
    setSelectedBox(null); // Clear box selection when entering add mode
    setSelectedMasterItem(null); // Clear Master preview when entering add mode
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

  const finishAddMode = useCallback(async () => {
    const currentItem = addModeItemRef.current;
    const pending = addModePendingRef.current;
    
    if (!currentItem) {
      setAddModeItem(null);
      setAddModeQtyPerClick(1);
      setAddModePending(new Map());
      return;
    }

    // Get supply_id for the item
    const supplyId = supplyNameToId.get(currentItem);
    if (!supplyId) {
      console.error(`Supply ID not found for item: ${currentItem}`);
      setError(`Supply ID not found for item: ${currentItem}`);
      return;
    }

    // Convert pending map to API format
    const additions = [];
    pending.forEach((qty, key) => {
      const parts = key.split('||');
      const boxTitle = parts[0];
      const shelf = parts.length > 1 ? parseInt(parts[1], 10) : null;
      additions.push({
        location: boxTitle,
        shelf: shelf,
        amount: qty
      });
    });

    if (additions.length === 0) {
      setAddModeItem(null);
      setAddModeQtyPerClick(1);
      setAddModePending(new Map());
      return;
    }

    try {
      // Use bulk-add API endpoint
      await api.bulkAddSupplyLocations({
        supply_id: supplyId,
        additions: additions
      });

      // Update local state optimistically
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

        setInventoryData(prev => {
          const next = new Map(prev);
          const box = next.get(boxTitle);
          if (box) {
            next.set(boxTitle, { ...box, inventory: newInventory });
          }
          return next;
        });
      });

      // Clear add mode
      setAddModeItem(null);
      setAddModeQtyPerClick(1);
      setAddModePending(new Map());
    } catch (error) {
      console.error('Error finishing add mode:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to add items');
      }
    }
  }, [inventoryData, supplyNameToId]);

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

  const handleDrop = useCallback(async (targetBoxTitle) => {
    if (!draggedItemData || draggedItemData.sourceBox === targetBoxTitle) return;

    const sourceBoxData = inventoryData.get(draggedItemData.sourceBox);
    const targetBoxData = inventoryData.get(targetBoxTitle);
    if (!sourceBoxData || !targetBoxData) return;

    try {
      // Use move API for each item
      if (draggedItemData.isMultiple) {
        for (const item of draggedItemData.items) {
          const supplyId = supplyNameToId.get(item.name);
          if (!supplyId) {
            console.error(`Supply ID not found for item: ${item.name}`);
            continue;
          }
          await api.moveSupplyLocations({
            from_location: draggedItemData.sourceBox,
            to_location: targetBoxTitle,
            supply_id: supplyId,
            shelf_from: item.shelf !== undefined ? item.shelf : null,
            shelf_to: item.shelf !== undefined ? item.shelf : null,
            amount: item.qty
          });
        }
      } else {
        const supplyId = supplyNameToId.get(draggedItemData.item.name);
        if (!supplyId) {
          throw new Error(`Supply ID not found for item: ${draggedItemData.item.name}`);
        }
        await api.moveSupplyLocations({
          from_location: draggedItemData.sourceBox,
          to_location: targetBoxTitle,
          supply_id: supplyId,
          shelf_from: draggedItemData.item.shelf !== undefined ? draggedItemData.item.shelf : null,
          shelf_to: draggedItemData.item.shelf !== undefined ? draggedItemData.item.shelf : null,
          amount: draggedItemData.item.qty
        });
      }

      // Update local state optimistically
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

      setInventoryData(prev => {
        const next = new Map(prev);
        const sourceBox = next.get(draggedItemData.sourceBox);
        const targetBox = next.get(targetBoxTitle);
        if (sourceBox) {
          next.set(draggedItemData.sourceBox, { ...sourceBox, inventory: newSourceInventory });
        }
        if (targetBox) {
          next.set(targetBoxTitle, { ...targetBox, inventory: newTargetInventory });
        }
        return next;
      });

      // Auto-select the target box after successful drop
      setSelectedBox(targetBoxTitle);
      setCurrentEditingBox(null);
      setCurrentEditingIndex(null);
      setLastSelectedIndex(null);

      setDraggedItemData(null);
      setCurrentDragOverBox(null);
    } catch (error) {
      console.error('Error moving items:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to move items');
      }
    }
  }, [draggedItemData, inventoryData, supplyNameToId]);

  // Master Item helper functions
  const resolveMasterItem = useCallback((itemName) => {
    return masterInventoryItems.get(itemName) || null;
  }, [masterInventoryItems]);

  const computeMasterQuantities = useCallback(() => {
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

  const addMasterItem = useCallback(async (item) => {
    try {
      const created = await api.createSupply({
        name: item.name,
        description: item.description || '',
        image: item.image || null,
        teams: item.teams || [],
        categories: item.categories || []
      });
      
      // Update local state
      setMasterInventoryItems(prev => {
        const next = new Map(prev);
        next.set(created.name, {
          name: created.name,
          description: created.description || '',
          image: created.image || null,
          locations: created.locations || [],
          teams: created.teams || [],
          categories: created.categories || [],
          lastModified: created.lastModified || null,
          last_modified_by: created.last_modified_by || null,
          last_modified_by_name: created.last_modified_by_name || null,
          id: created.id
        });
        return next;
      });
      
      // Update name to ID mapping
      setSupplyNameToId(prev => {
        const next = new Map(prev);
        next.set(created.name, created.id);
        return next;
      });
    } catch (error) {
      console.error('Error adding Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to add item');
      }
      throw error;
    }
  }, []);

  const updateMasterItem = useCallback(async (oldName, newItem) => {
    try {
      const oldItem = masterInventoryItems.get(oldName);
      if (!oldItem || !oldItem.id) {
        throw new Error(`Item ${oldName} not found or missing ID`);
      }
      
      const updated = await api.updateSupply(oldItem.id, {
        name: newItem.name,
        description: newItem.description || '',
        image: newItem.image || null,
        teams: newItem.teams || [],
        categories: newItem.categories || []
      });
      
      // Update local state
      setMasterInventoryItems(prev => {
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
        next.set(updated.name, {
          name: updated.name,
          description: updated.description || '',
          image: updated.image || null,
          locations: updated.locations || [],
          teams: updated.teams || [],
          categories: updated.categories || [],
          lastModified: updated.lastModified || null,
          last_modified_by: updated.last_modified_by || null,
          last_modified_by_name: updated.last_modified_by_name || null,
          id: updated.id
        });
        return next;
      });
      
      // Update name to ID mapping if name changed
      if (oldName !== newItem.name) {
        setSupplyNameToId(prev => {
          const next = new Map(prev);
          next.delete(oldName);
          next.set(updated.name, updated.id);
          return next;
        });
      }
    } catch (error) {
      console.error('Error updating Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to update item');
      }
      throw error;
    }
  }, [masterInventoryItems]);

  const deleteMasterItem = useCallback(async (itemName) => {
    try {
      const item = masterInventoryItems.get(itemName);
      if (!item || !item.id) {
        throw new Error(`Item ${itemName} not found or missing ID`);
      }
      
      await api.deleteSupply(item.id);
      
      // Update local state
      setMasterInventoryItems(prev => {
        const next = new Map(prev);
        next.delete(itemName);
        return next;
      });
      
      // Remove from name to ID mapping
      setSupplyNameToId(prev => {
        const next = new Map(prev);
        next.delete(itemName);
        return next;
      });
      
      // Remove from all boxes (CASCADE in DB handles this, but update UI)
      setInventoryData(prev => {
        const newData = new Map(prev);
        newData.forEach((boxData, boxTitle) => {
          const updatedInventory = boxData.inventory.filter(item => item.name !== itemName);
          newData.set(boxTitle, { ...boxData, inventory: updatedInventory });
        });
        return newData;
      });
      
      // Close preview if this item was selected
      if (selectedMasterItem === itemName) {
        setSelectedMasterItem(null);
      }
    } catch (error) {
      console.error('Error deleting Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to delete item');
      }
      throw error;
    }
  }, [selectedMasterItem, masterInventoryItems]);

  const clearSelectedMasterItem = useCallback(() => {
    setSelectedMasterItem(null);
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
    // Master Inventory state
    masterInventoryItems,
    selectedMasterItem,
    leftPaneWidth,
    leftPaneCollapsed,
    // Loading and error states
    isLoading,
    error,
    setError,
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
    setMasterInventoryItems,
    setSelectedMasterItem,
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
    // Master Item helpers
    resolveMasterItem,
    computeMasterQuantities,
    getItemLocations,
    addMasterItem,
    updateMasterItem,
    deleteMasterItem,
    clearSelectedMasterItem,
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