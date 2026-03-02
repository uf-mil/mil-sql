import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { api, admin } from '../api';

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
  
  // Delete Mode state
  const [deleteModeItem, setDeleteModeItem] = useState(null);
  const [deleteModeQtyPerClick, setDeleteModeQtyPerClick] = useState(1);
  const [deleteModePending, setDeleteModePending] = useState(new Map()); // Map<boxTitle, qty>
  const deleteModePreviewRef = useRef(null);
  const deleteModeItemRef = useRef(null);
  const deleteModePendingRef = useRef(new Map());
  const deleteModeQtyPerClickRef = useRef(1);
  
  // Move Mode state
  const [moveModeItem, setMoveModeItem] = useState(null);
  const [moveModeDragging, setMoveModeDragging] = useState(null); // { boxTitle, shelf, qty, x, y }
  const moveModeItemRef = useRef(null);
  const isDraggingMoveBoxRef = useRef(false); // Synchronous ref for D3 filter
  
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

  useEffect(() => {
    deleteModeItemRef.current = deleteModeItem;
  }, [deleteModeItem]);
  
  useEffect(() => {
    deleteModePendingRef.current = deleteModePending;
  }, [deleteModePending]);

  useEffect(() => {
    deleteModeQtyPerClickRef.current = deleteModeQtyPerClick;
  }, [deleteModeQtyPerClick]);
  
  useEffect(() => {
    moveModeItemRef.current = moveModeItem;
  }, [moveModeItem]);
  
  // Refs
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const worldRef = useRef(null);
  const isPanningRef = useRef(false);

  // Helper function to get fill color for location type
  const getFillForType = (type) => {
    const typeFills = {
      'drawer': 'var(--drawer)',
      'cabinet': 'var(--table)',
      'tall_cabinet': 'var(--files)', // Tall cabinets use files color
      'table': 'var(--table)',
      'other': '#e7ebf3', // Other category (includes workbench) has special color
      'special': '#ff69b4', // Special category - pink
      'external': '#ff9800', // External category - orange
    };
    return typeFills[type] || 'var(--table)';
  };

  // Function to reload supply locations from API
  const reloadSupplyLocations = useCallback(async () => {
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
          id: sl.id, // supply_location_id from API
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
      console.error('Error reloading supply locations from API:', apiError);
    }
  }, []);

  // Initialize inventory data from database (locations) and API (inventory data)
  useEffect(() => {
    const loadInventoryData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // 1. Set default inventory bounds (no longer loading from JSON)
        setInventoryBounds({
          viewBox: { x: 0, y: 0, width: 4000, height: 4000 },
          room: { x: 80, y: 80, width: 3600, height: 3840, rx: 18, ry: 18 }
        });
        
        // 2. Load locations from database API
        const locations = await admin.getLocations();
        
        // Convert API locations to box format expected by map
        const newInventoryData = new Map();
        locations.forEach(location => {
          const boxData = {
            title: location.name,
            x: location.x,
            y: location.y,
            width: location.width,
            height: location.height,
            fill: getFillForType(location.type),
            type: location.type,
            inventory: [] // Will be populated from supply locations API
          };
          
          newInventoryData.set(location.name, boxData);
        });
        
        setInventoryData(newInventoryData);
        
        // 3. Load supply locations from API and merge into inventoryData
        await reloadSupplyLocations();
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading inventory data:', error);
        setError(error.message || 'Failed to load inventory data');
        setIsLoading(false);
        // Fallback to empty data if API fails
        setInventoryData(new Map());
        // Set default bounds
        setInventoryBounds({
          viewBox: { x: 0, y: 0, width: 4000, height: 4000 },
          room: { x: 80, y: 80, width: 3600, height: 3840, rx: 18, ry: 18 }
        });
      }
    };
    
    loadInventoryData();
  }, []);

  // Setup D3 zoom — re-run when isLoading changes because SVG doesn't exist during loading
  useEffect(() => {
    if (isLoading || !svgRef.current || !worldRef.current) return;

    const zoom = d3.zoom()
      .scaleExtent([0.6, 6])
      .filter((event) => {
        // Disable zoom/pan when dragging a move box
        if (isDraggingMoveBoxRef.current) return false;
        // Check if the event target is a move box
        if (event.target && event.target.dataset && event.target.dataset.moveBox) return false;
        return true;
      })
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

      // Reload supply locations to get the IDs for newly added items
      await reloadSupplyLocations();

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
  }, [inventoryData, supplyNameToId, reloadSupplyLocations]);

  const cancelAddMode = useCallback(() => {
    setAddModeItem(null);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
  }, []);

  // Delete Mode functions
  const startDeleteMode = useCallback((itemName) => {
    setDeleteModeItem(itemName);
    setDeleteModeQtyPerClick(1);
    setDeleteModePending(new Map());
    setSelectedBox(null); // Clear box selection when entering delete mode
    setSelectedMasterItem(null); // Clear Master preview when entering delete mode
  }, []);

  // shelf is optional — undefined for non-shelf boxes, number for Tall Cabinet shelves
  const handleBoxClickDeleteMode = useCallback((boxTitle, shelf) => {
    const qty = deleteModeQtyPerClickRef.current;
    const key = shelf !== undefined ? `${boxTitle}||${shelf}` : boxTitle;
    
    // Get current quantity in this location
    const boxData = inventoryData.get(boxTitle);
    if (!boxData) return;
    
    const matchingItems = boxData.inventory.filter(item => {
      if (item.name !== deleteModeItemRef.current) return false;
      if (shelf !== undefined) return (item.shelf ?? 0) === shelf;
      return item.shelf === undefined;
    });
    
    const currentQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
    const existingPending = deleteModePendingRef.current.get(key) || 0;
    
    // Don't allow deleting more than what's available
    const maxDeletable = currentQty - existingPending;
    const toDelete = Math.min(qty, maxDeletable);
    
    if (toDelete <= 0) return; // Nothing to delete
    
    setDeleteModePending(prev => {
      const next = new Map(prev);
      const existing = next.get(key) || 0;
      next.set(key, existing + toDelete);
      return next;
    });
  }, [inventoryData]);

  // Check if any pending deletion belongs to a given box (handles compound keys)
  const boxHasAnyDeletePending = useCallback((boxTitle) => {
    for (const key of deleteModePending.keys()) {
      if (key === boxTitle || key.startsWith(boxTitle + '||')) return true;
    }
    return false;
  }, [deleteModePending]);

  const finishDeleteMode = useCallback(async () => {
    const currentItem = deleteModeItemRef.current;
    const pending = deleteModePendingRef.current;
    
    if (!currentItem) {
      setDeleteModeItem(null);
      setDeleteModeQtyPerClick(1);
      setDeleteModePending(new Map());
      return;
    }

    // Get supply_id for the item
    const supplyId = supplyNameToId.get(currentItem);
    if (!supplyId) {
      console.error(`Supply ID not found for item: ${currentItem}`);
      setError(`Supply ID not found for item: ${currentItem}`);
      return;
    }

    // Convert pending map to deletions
    const deletions = [];
    pending.forEach((pendingQty, key) => {
      const parts = key.split('||');
      const boxTitle = parts[0];
      const shelf = parts.length > 1 ? parseInt(parts[1], 10) : null;
      
      // Find the supply_location_id for this item at this location
      const boxData = inventoryData.get(boxTitle);
      if (!boxData) return;
      
      const matchingItems = boxData.inventory.filter(item => {
        if (item.name !== currentItem) return false;
        if (shelf !== null && shelf !== undefined) return (item.shelf ?? 0) === shelf;
        return item.shelf === undefined;
      });
      
      // For each matching item, we need to delete or reduce it
      let remainingToDelete = pendingQty;
      matchingItems.forEach(item => {
        if (item.id && remainingToDelete > 0) {
          const deleteQty = Math.min(remainingToDelete, item.qty);
          deletions.push({
            id: item.id,
            location: boxTitle,
            shelf: shelf,
            amount: deleteQty
          });
          remainingToDelete -= deleteQty;
        }
      });
    });

    if (deletions.length === 0) {
      setDeleteModeItem(null);
      setDeleteModeQtyPerClick(1);
      setDeleteModePending(new Map());
      return;
    }

    try {
      // Delete items via API
      for (const deletion of deletions) {
        const item = inventoryData.get(deletion.location)?.inventory.find(i => i.id === deletion.id);
        if (!item) continue;
        
        if (item.qty <= deletion.amount) {
          // Delete the entire entry
          await api.deleteSupplyLocation(deletion.id);
        } else {
          // Reduce the quantity
          await api.updateSupplyLocation(deletion.id, { amount: item.qty - deletion.amount });
        }
      }

      // Update local state optimistically
      const byBox = new Map();
      deletions.forEach(({ location, shelf, amount, id }) => {
        if (!byBox.has(location)) byBox.set(location, []);
        byBox.get(location).push({ shelf, amount, id });
      });

      byBox.forEach((entries, boxTitle) => {
        const boxData = inventoryData.get(boxTitle);
        if (!boxData) return;

        const newInventory = [...boxData.inventory];

        entries.forEach(({ shelf, amount, id }) => {
          const existingIndex = newInventory.findIndex(item => item.id === id);
          if (existingIndex >= 0) {
            const newQty = newInventory[existingIndex].qty - amount;
            if (newQty <= 0) {
              // Remove item
              newInventory.splice(existingIndex, 1);
            } else {
              // Update quantity
              newInventory[existingIndex] = {
                ...newInventory[existingIndex],
                qty: newQty
              };
            }
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

      // Clear delete mode
      setDeleteModeItem(null);
      setDeleteModeQtyPerClick(1);
      setDeleteModePending(new Map());
    } catch (error) {
      console.error('Error finishing delete mode:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to delete items');
      }
    }
  }, [inventoryData, supplyNameToId]);

  const cancelDeleteMode = useCallback(() => {
    setDeleteModeItem(null);
    setDeleteModeQtyPerClick(1);
    setDeleteModePending(new Map());
  }, []);

  // Move Mode functions
  const startMoveMode = useCallback((itemName) => {
    setMoveModeItem(itemName);
    setMoveModeDragging(null);
    setSelectedBox(null); // Clear box selection when entering move mode
  }, []);

  const cancelMoveMode = useCallback(() => {
    setMoveModeItem(null);
    setMoveModeDragging(null);
    setCurrentDragOverBox(null);
    isDraggingMoveBoxRef.current = false;
  }, []);
  
  const clearMoveModeDragging = useCallback(() => {
    setMoveModeDragging(null);
    setCurrentDragOverBox(null);
    isDraggingMoveBoxRef.current = false;
  }, []);

  const handleMoveModeDragStart = useCallback((boxTitle, shelf, qty, x, y) => {
    isDraggingMoveBoxRef.current = true;
    setMoveModeDragging({ boxTitle, shelf, qty, x, y, originalX: x, originalY: y });
  }, []);
  
  const handleMoveModeDragMove = useCallback((x, y) => {
    if (moveModeDragging) {
      setMoveModeDragging(prev => ({ ...prev, x, y }));
    }
  }, [moveModeDragging]);

  const handleMoveModeDrop = useCallback(async (targetBoxTitle, targetShelf) => {
    if (!moveModeDragging || !moveModeItemRef.current) return;
    
    const { boxTitle: sourceBoxTitle, shelf: sourceShelf, qty } = moveModeDragging;
    
    // Don't allow dropping on the same location
    if (sourceBoxTitle === targetBoxTitle && sourceShelf === targetShelf) {
      setMoveModeDragging(null);
      return;
    }

    const supplyId = supplyNameToId.get(moveModeItemRef.current);
    if (!supplyId) {
      console.error(`Supply ID not found for item: ${moveModeItemRef.current}`);
      setError(`Supply ID not found for item: ${moveModeItemRef.current}`);
      setMoveModeDragging(null);
      return;
    }

    try {
      await api.moveSupplyLocations({
        from_location: sourceBoxTitle,
        to_location: targetBoxTitle,
        supply_id: supplyId,
        shelf_from: sourceShelf !== undefined ? sourceShelf : null,
        shelf_to: targetShelf !== undefined ? targetShelf : null,
        amount: qty
      });

      // Update local state optimistically
      const sourceBoxData = inventoryData.get(sourceBoxTitle);
      const targetBoxData = inventoryData.get(targetBoxTitle);
      
      if (!sourceBoxData || !targetBoxData) {
        setMoveModeDragging(null);
        return;
      }

      // Remove from source - find the exact item and subtract qty
      const newSourceInventory = [];
      let foundSource = false;
      
      for (const item of sourceBoxData.inventory) {
        if (item.name === moveModeItemRef.current) {
          const itemShelf = item.shelf ?? 0;
          const sourceShelfValue = sourceShelf ?? 0;
          
          if (itemShelf === sourceShelfValue && !foundSource) {
            // This is the source item - subtract qty
            foundSource = true;
            const newQty = item.qty - qty;
            if (newQty > 0) {
              // Keep item with reduced qty
              newSourceInventory.push({ ...item, qty: newQty });
            }
            // If newQty <= 0, don't add it (effectively removing it)
          } else {
            // Different shelf or already found - keep as is
            newSourceInventory.push(item);
          }
        } else {
          // Different item - keep as is
          newSourceInventory.push(item);
        }
      }

      const isSameBox = sourceBoxTitle === targetBoxTitle;

      // For same-box moves (between shelves), work from the already-updated source inventory
      const baseTargetInventory = isSameBox ? newSourceInventory : [...targetBoxData.inventory];

      // Add to target (combine if exists)
      const newTargetInventory = [...baseTargetInventory];
      const existingIndex = newTargetInventory.findIndex(item => {
        if (item.name !== moveModeItemRef.current) return false;
        if (targetShelf !== undefined) return (item.shelf ?? 0) === targetShelf;
        return item.shelf === undefined;
      });

      if (existingIndex >= 0) {
        newTargetInventory[existingIndex] = {
          ...newTargetInventory[existingIndex],
          qty: newTargetInventory[existingIndex].qty + qty
        };
      } else {
        const newItem = { name: moveModeItemRef.current, qty };
        if (targetShelf !== undefined) newItem.shelf = targetShelf;
        newTargetInventory.push(newItem);
      }

      setInventoryData(prev => {
        const next = new Map(prev);
        if (isSameBox) {
          // Same box, different shelf — only set once with the fully updated inventory
          next.set(sourceBoxTitle, { ...sourceBoxData, inventory: newTargetInventory });
        } else {
          next.set(sourceBoxTitle, { ...sourceBoxData, inventory: newSourceInventory });
          next.set(targetBoxTitle, { ...targetBoxData, inventory: newTargetInventory });
        }
        return next;
      });

      setMoveModeDragging(null);
      isDraggingMoveBoxRef.current = false;
    } catch (error) {
      console.error('Error moving item:', error);
      if (!isPanningRef.current) {
        setError(error.message || 'Failed to move item');
      }
      setMoveModeDragging(null);
      isDraggingMoveBoxRef.current = false;
    }
  }, [moveModeDragging, inventoryData, supplyNameToId]);

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
    // Delete Mode
    deleteModeItem,
    deleteModeQtyPerClick,
    setDeleteModeQtyPerClick,
    deleteModePending,
    deleteModePreviewRef,
    startDeleteMode,
    finishDeleteMode,
    cancelDeleteMode,
    handleBoxClickDeleteMode,
    boxHasAnyDeletePending,
    // Move Mode
    moveModeItem,
    moveModeDragging,
    startMoveMode,
    cancelMoveMode,
    clearMoveModeDragging,
    handleMoveModeDragStart,
    handleMoveModeDragMove,
    handleMoveModeDrop,
    isDraggingMoveBoxRef,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};