import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { api, admin, handleApiError } from '../api';
import { LOCATION_SVG_MARKUP_BY_NAME } from '../constants/locationSvgByName';
import { clampPointToRoom } from '../constants/mapBounds';
import { LEFT_PANE_MIN_WIDTH, LEFT_PANE_MAX_WIDTH } from '../constants/leftPaneLayout';

export const MASTER_ARROWS_REDRAW_EVENT = 'milventory-master-arrows-redraw';

function newTempFreePlaceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `fp-${crypto.randomUUID()}`;
  }
  return `fp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Pending subtract map keys for floor placements (`${prefix}||supply_location_id`). */
export const FREE_SUBTRACT_DOT_PREFIX = '__free__';

const InventoryContext = createContext(null);

/** Build master table location strings from API supplies.locations[] */
function locationsListFromSupplyLocs(locations) {
  const out = [];
  let freeN = 0;
  (locations || []).forEach((loc) => {
    if (loc.location === 'Free Coordinate' || (loc.coord_x != null && loc.coord_y != null)) {
      freeN += 1;
      return;
    }
    if (loc.shelf !== null && loc.shelf !== undefined) {
      out.push(`${loc.location} (Shelf ${loc.shelf})`);
    } else {
      out.push(loc.location);
    }
  });
  if (freeN > 0) {
    out.push(freeN === 1 ? 'Free Coordinate' : `Free Coordinates (${freeN})`);
  }
  return out;
}

/** Treat undefined/null shelf as the same for regular (non–tall-cabinet) rows. */
function shelvesMatchForMove(invShelf, locShelf) {
  const a = invShelf === undefined || invShelf === null ? null : invShelf;
  const b = locShelf === undefined || locShelf === null ? null : locShelf;
  return a === b;
}

/**
 * Apply a box-to-box move only in local `inventoryData` (no API).
 * Identifies the stock line by supplyPublicId (stable); display name may be duplicated.
 */
function applyOptimisticMoveBetweenBoxes(
  inventoryMap,
  supplyPublicId,
  itemName,
  sourceBox,
  sourceShelf,
  targetBox,
  targetShelf,
  moveQty,
  numericSupplyId
) {
  const src = inventoryMap.get(sourceBox);
  const dst = inventoryMap.get(targetBox);
  if (!src || !dst || moveQty <= 0 || !supplyPublicId) return inventoryMap;

  const next = new Map(inventoryMap);
  let rem = moveQty;
  const newSrc = [];

  for (const it of src.inventory) {
    if (
      rem <= 0 ||
      it.supplyPublicId !== supplyPublicId ||
      !shelvesMatchForMove(it.shelf, sourceShelf)
    ) {
      newSrc.push({ ...it });
      continue;
    }
    const take = Math.min(rem, it.qty);
    if (it.qty > take) {
      newSrc.push({ ...it, qty: it.qty - take });
    }
    rem -= take;
  }

  const dstInv = dst.inventory.map((i) => ({ ...i }));
  let merged = false;
  for (let i = 0; i < dstInv.length; i++) {
    const it = dstInv[i];
    if (it.supplyPublicId === supplyPublicId && shelvesMatchForMove(it.shelf, targetShelf)) {
      dstInv[i] = { ...it, qty: it.qty + moveQty };
      merged = true;
      break;
    }
  }
  if (!merged) {
    const shelfVal = targetShelf === undefined || targetShelf === null ? undefined : targetShelf;
    dstInv.push({
      name: itemName,
      qty: moveQty,
      shelf: shelfVal,
      supplyId: numericSupplyId,
      supplyPublicId
    });
  }

  next.set(sourceBox, { ...src, inventory: newSrc });
  next.set(targetBox, { ...dst, inventory: dstInv });
  return next;
}

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
  /** Selected master row: supplies.public_id (UUID string), not display name */
  const [selectedMasterItem, setSelectedMasterItem] = useState(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(300);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [masterFilterLocation, setMasterFilterLocation] = useState(null); // Location to filter master table by

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [conflictError, setConflictError] = useState(null);
  
  // Add Mode state
  const [addModeItem, setAddModeItem] = useState(null);
  const [addModeQtyPerClick, setAddModeQtyPerClick] = useState(1);
  const [addModePending, setAddModePending] = useState(new Map()); // Map<boxTitle, qty>
  const addModePreviewRef = useRef(null);
  const addModeItemRef = useRef(null);
  const addModePendingRef = useRef(new Map());
  const addModeQtyPerClickRef = useRef(1);
  
  // Subtract Mode state (removes items from boxes, not the master entry)
  const [subtractModeItem, setSubtractModeItem] = useState(null);
  const [subtractModeQtyPerClick, setSubtractModeQtyPerClick] = useState(1);
  const [subtractModePending, setSubtractModePending] = useState(new Map()); // Map<boxTitle, qty>
  const subtractModePreviewRef = useRef(null);
  const subtractModeItemRef = useRef(null);
  const subtractModePendingRef = useRef(new Map());
  const subtractModeQtyPerClickRef = useRef(1);
  
  // Move Mode state
  const [moveModeItem, setMoveModeItem] = useState(null);
  const [moveModeDragging, setMoveModeDragging] = useState(null); // { boxTitle, shelf, qty, x, y }
  const [moveModePending, setMoveModePending] = useState([]); // Box moves queued until Apply Move (no API until then)
  /** Pending floor-dot positions in move mode (applied on Finish; discarded on Cancel). */
  const [moveModeFreeCoordById, setMoveModeFreeCoordById] = useState(() => new Map());
  /** Live world coords during floor-dot drag (React state updates only on drag end so D3 is not torn down). */
  const moveModeDotDragLiveByIdRef = useRef(new Map());
  const moveModeItemRef = useRef(null);
  const moveModePendingRef = useRef([]); // Ref version for callbacks
  const isDraggingMoveBoxRef = useRef(false); // Synchronous ref for D3 filter

  const [freePlaceModeItem, setFreePlaceModeItem] = useState(null);
  const freePlaceModeItemRef = useRef(null);
  const [freePlacementsBySupplyPublicId, setFreePlacementsBySupplyPublicId] = useState(new Map());
  const [freePlacePendingDeletes, setFreePlacePendingDeletes] = useState(() => new Set());
  const [freePlacePendingCoordById, setFreePlacePendingCoordById] = useState(() => new Map());
  const [freePlacePendingAdds, setFreePlacePendingAdds] = useState([]);
  
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
    subtractModeItemRef.current = subtractModeItem;
  }, [subtractModeItem]);
  
  useEffect(() => {
    subtractModePendingRef.current = subtractModePending;
  }, [subtractModePending]);

  useEffect(() => {
    subtractModeQtyPerClickRef.current = subtractModeQtyPerClick;
  }, [subtractModeQtyPerClick]);
  
  useEffect(() => {
    moveModeItemRef.current = moveModeItem;
  }, [moveModeItem]);

  useEffect(() => {
    freePlaceModeItemRef.current = freePlaceModeItem;
  }, [freePlaceModeItem]);
  
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

      const locationMap = new Map();
      const freeMap = new Map();

      supplyLocations.forEach((sl) => {
        const pid =
          sl.supply_public_id ||
          (sl.supply_id != null ? `__legacy_id_${sl.supply_id}` : '');
        if (sl.free_place || (sl.coord_x != null && sl.coord_y != null)) {
          if (!pid) return;
          if (!freeMap.has(pid)) freeMap.set(pid, []);
          freeMap.get(pid).push({
            id: sl.id,
            x: sl.coord_x,
            y: sl.coord_y,
            qty: sl.qty || 0
          });
          return;
        }
        const key = sl.location;
        if (key == null || key === '') return;
        if (!locationMap.has(key)) {
          locationMap.set(key, []);
        }
        locationMap.get(key).push({
          id: sl.id,
          name: sl.supply_name || '',
          supplyId: sl.supply_id,
          supplyPublicId: sl.supply_public_id || null,
          qty: sl.qty,
          shelf: sl.shelf !== null ? sl.shelf : undefined
        });
      });

      setFreePlacementsBySupplyPublicId(freeMap);

      setInventoryData((prev) => {
        const next = new Map(prev);
        prev.forEach((boxData, locationName) => {
          const items = locationMap.get(locationName) || [];
          next.set(locationName, {
            ...boxData,
            inventory: items
          });
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
          const svgMarkup = LOCATION_SVG_MARKUP_BY_NAME[location.name];
          const boxData = {
            title: location.name,
            x: location.x,
            y: location.y,
            width: location.width,
            height: location.height,
            fill: getFillForType(location.type),
            type: location.type,
            shelf_count: Math.max(0, parseInt(location.shelf_count, 10) || 0),
            inventory: [], // Will be populated from supply locations API
            ...(svgMarkup ? { svgMarkup } : {})
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
        // Don't intercept events from interactive HTML elements inside foreignObject
        // (e.g. buttons, inputs, selects inside BoxInventoryOverlay)
        if (event.target && event.target.closest && event.target.closest('button, input, select, a, textarea')) return false;
        // Don't intercept scroll (wheel) or mousedown events inside scrollable containers —
        // otherwise D3 steals the scroll and the native scrollbar drag never fires
        if (event.target && event.target.closest && event.target.closest('.box-inventory-content')) return false;
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

        supplies.forEach((supply) => {
          const rowKey =
            supply.public_id || (supply.id != null ? `__legacy_id_${supply.id}` : null);
          if (!rowKey) return;

          const locations = locationsListFromSupplyLocs(supply.locations);

          newMasterItems.set(rowKey, {
            public_id: supply.public_id || null,
            name: supply.name,
            description: supply.description || '',
            image: supply.image || null,
            locations: locations,
            teams: supply.teams || [],
            categories: supply.categories || [],
            custom_fields: supply.custom_fields || {},
            supply_type_id: supply.supply_type_id ?? null,
            type_name: supply.type_name || null,
            type_has_template_image: Boolean(supply.type_has_template_image),
            lastModified: supply.lastModified || null,
            last_modified_by: supply.last_modified_by || null,
            last_modified_by_name: supply.last_modified_by_name || null,
            id: supply.id
          });
        });

        setMasterInventoryItems(newMasterItems);
      } catch (error) {
        console.error('Error loading Master inventory items from API:', error);
        if (error.message === 'Authentication required') {
          setError('Authentication required. Please login.');
        }
        setMasterInventoryItems(new Map());
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
    if (savedLeftWidth) {
      const w = parseInt(savedLeftWidth, 10);
      if (!Number.isNaN(w)) {
        setLeftPaneWidth(Math.max(LEFT_PANE_MIN_WIDTH, Math.min(LEFT_PANE_MAX_WIDTH, w)));
      }
    }
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
    try {
      // Get current supply locations for this box
      const currentLocations = await api.getLocationSupplies(boxTitle);
      
      // Build maps for comparison
      const currentMap = new Map();
      currentLocations.forEach((sl) => {
        const rowPid = sl.supply_public_id || `__legacy_id_${sl.supply_id}`;
        const key = `${rowPid}||${sl.shelf !== null ? sl.shelf : 'null'}`;
        currentMap.set(key, { id: sl.id, qty: sl.qty });
      });

      const newMap = new Map();
      newInventory.forEach((item) => {
        const rowPid =
          item.supplyPublicId ||
          (item.supplyId != null ? `__legacy_id_${item.supplyId}` : null);
        if (!rowPid) return;
        const key = `${rowPid}||${item.shelf !== undefined ? item.shelf : 'null'}`;
        const supplyId =
          item.supplyId != null
            ? item.supplyId
            : masterInventoryItems.get(rowPid)?.id;
        if (supplyId != null) {
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
      
      // Reload supply locations to ensure UI reflects actual server state
      await reloadSupplyLocations();
    } catch (error) {
      console.error('Error syncing inventory to API:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message || 'Failed to sync inventory changes');
        }
      }
    }
  }, [masterInventoryItems, reloadSupplyLocations]);

  // Function to reload master items from API
  const reloadMasterItems = useCallback(async () => {
    try {
      const supplies = await api.getSupplies();

      const newMasterItems = new Map();

      supplies.forEach((supply) => {
        const rowKey =
          supply.public_id || (supply.id != null ? `__legacy_id_${supply.id}` : null);
        if (!rowKey) return;

        const locations = locationsListFromSupplyLocs(supply.locations);
        newMasterItems.set(rowKey, {
          public_id: supply.public_id || null,
          name: supply.name,
          description: supply.description || '',
          image: supply.image || null,
          locations: locations,
          teams: supply.teams || [],
          categories: supply.categories || [],
          custom_fields: supply.custom_fields || {},
          supply_type_id: supply.supply_type_id ?? null,
          type_name: supply.type_name || null,
          type_has_template_image: Boolean(supply.type_has_template_image),
          lastModified: supply.lastModified || null,
          last_modified_by: supply.last_modified_by || null,
          last_modified_by_name: supply.last_modified_by_name || null,
          id: supply.id
        });
      });

      setMasterInventoryItems(newMasterItems);
    } catch (error) {
      console.error('Error reloading Master inventory items:', error);
    }
  }, []);

  // Other tabs (e.g. /admin) can bump this key so the catalog refetches without a full reload
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'milventory-master-catalog-bump') {
        reloadMasterItems();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reloadMasterItems]);

  // Add Mode functions
  const startAddMode = useCallback((itemName) => {
    setFreePlaceModeItem(null);
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

    const restorePreviewItem = () => {
      if (currentItem) setSelectedMasterItem(currentItem);
    };

    const supplyId = masterInventoryItems.get(currentItem)?.id;
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
      restorePreviewItem();
      return;
    }

    try {
      // Use bulk-add API endpoint
      await api.bulkAddSupplyLocations({
        supply_id: supplyId,
        additions: additions
      });

      // Reload supply locations to ensure UI reflects actual server state
      await reloadSupplyLocations();
      
      // Reload master items to update last_modified timestamp
      await reloadMasterItems();

      // Clear add mode
      setAddModeItem(null);
      setAddModeQtyPerClick(1);
      setAddModePending(new Map());
      restorePreviewItem();
    } catch (error) {
      console.error('Error finishing add mode:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message);
        }
      }
    }
  }, [masterInventoryItems, reloadSupplyLocations, reloadMasterItems]);

  const cancelAddMode = useCallback(() => {
    const restore = addModeItemRef.current;
    setAddModeItem(null);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
    if (restore) setSelectedMasterItem(restore);
  }, []);

  // Subtract Mode functions (removes items from boxes, not the master entry)
  const startSubtractMode = useCallback((itemName) => {
    setFreePlaceModeItem(null);
    setSubtractModeItem(itemName);
    setSubtractModeQtyPerClick(1);
    setSubtractModePending(new Map());
    setSelectedBox(null); // Clear box selection when entering subtract mode
    setSelectedMasterItem(null); // Clear Master preview when entering subtract mode
  }, []);

  // shelf is optional — undefined for non-shelf boxes, number for Tall Cabinet shelves
  const handleBoxClickSubtractMode = useCallback((boxTitle, shelf) => {
    const qty = subtractModeQtyPerClickRef.current;
    const key = shelf !== undefined ? `${boxTitle}||${shelf}` : boxTitle;
    
    // Get current quantity in this location
        const boxData = inventoryData.get(boxTitle);
        if (!boxData) return;

    const pid = subtractModeItemRef.current;
    const matchingItems = boxData.inventory.filter((item) => {
      const itemPid =
        item.supplyPublicId ||
        (item.supplyId != null ? `__legacy_id_${item.supplyId}` : null);
      if (itemPid !== pid) return false;
      if (shelf !== undefined) return (item.shelf ?? 0) === shelf;
      return item.shelf === undefined;
    });

    const currentQty = matchingItems.reduce((sum, item) => sum + (item.qty || 0), 0);
    const existingPending = subtractModePendingRef.current.get(key) || 0;
    
    // Don't allow subtracting more than what's available
    const maxSubtractable = currentQty - existingPending;
    const toSubtract = Math.min(qty, maxSubtractable);
    
    if (toSubtract <= 0) return; // Nothing to subtract
    
    setSubtractModePending(prev => {
      const next = new Map(prev);
      const existing = next.get(key) || 0;
      next.set(key, existing + toSubtract);
      return next;
    });
  }, [inventoryData]);

  // Check if any pending subtraction belongs to a given box (handles compound keys)
  const boxHasAnySubtractPending = useCallback((boxTitle) => {
    for (const key of subtractModePending.keys()) {
      if (key === boxTitle || key.startsWith(boxTitle + '||')) return true;
    }
    return false;
  }, [subtractModePending]);

  const handleSubtractFreeDotClick = useCallback(
    (supplyLocationId) => {
      const itemName = subtractModeItemRef.current;
      if (!itemName) return;
      const qty = subtractModeQtyPerClickRef.current;
      setSubtractModePending((prev) => {
        const placements = freePlacementsBySupplyPublicId.get(itemName) || [];
        const dot = placements.find((p) => p.id === supplyLocationId);
        if (!dot) return prev;
        const key = `${FREE_SUBTRACT_DOT_PREFIX}||${supplyLocationId}`;
        const existing = prev.get(key) || 0;
        const maxSubtractable = (dot.qty || 0) - existing;
        const toSubtract = Math.min(qty, maxSubtractable);
        if (toSubtract <= 0) return prev;
        const next = new Map(prev);
        next.set(key, existing + toSubtract);
        return next;
      });
    },
    [freePlacementsBySupplyPublicId]
  );

  const finishSubtractMode = useCallback(async () => {
    const currentItem = subtractModeItemRef.current;
    const pending = subtractModePendingRef.current;
    
    if (!currentItem) {
      setSubtractModeItem(null);
      setSubtractModeQtyPerClick(1);
      setSubtractModePending(new Map());
      return;
    }

    const restorePreviewItem = () => setSelectedMasterItem(currentItem);

    const supplyId = masterInventoryItems.get(currentItem)?.id;
    if (!supplyId) {
      console.error(`Supply ID not found for item: ${currentItem}`);
      setError(`Supply ID not found for item: ${currentItem}`);
      return;
    }

    // Convert pending map to subtractions
    // Use functional update to get latest inventoryData
    const subtractions = [];
    let currentInventoryData = inventoryData;
    
    pending.forEach((pendingQty, key) => {
      const parts = key.split('||');
      if (parts[0] === FREE_SUBTRACT_DOT_PREFIX && parts[1] != null && parts[1] !== '') {
        const locId = parseInt(parts[1], 10);
        const floorDots = freePlacementsBySupplyPublicId.get(currentItem) || [];
        const dot = floorDots.find((d) => d.id === locId);
        if (!dot || pendingQty <= 0) return;
        subtractions.push({
          id: locId,
          kind: 'free',
          amount: pendingQty,
          currentQty: dot.qty || 0
        });
        return;
      }

      const boxTitle = parts[0];
      const shelf = parts.length > 1 ? parseInt(parts[1], 10) : null;

      // Find the supply_location_id for this item at this location
      const boxData = currentInventoryData.get(boxTitle);
      if (!boxData) return;
      
      const matchingItems = boxData.inventory.filter((item) => {
        const itemPid =
          item.supplyPublicId ||
          (item.supplyId != null ? `__legacy_id_${item.supplyId}` : null);
        if (itemPid !== currentItem) return false;
        if (shelf !== null && shelf !== undefined) return (item.shelf ?? 0) === shelf;
        return item.shelf === undefined;
      });
      
      // For each matching item, we need to subtract or reduce it
      let remainingToSubtract = pendingQty;
      matchingItems.forEach(item => {
        if (item.id && remainingToSubtract > 0) {
          const subtractQty = Math.min(remainingToSubtract, item.qty);
          subtractions.push({
            id: item.id,
            kind: 'box',
            location: boxTitle,
            shelf: shelf,
            amount: subtractQty
          });
          remainingToSubtract -= subtractQty;
        }
        });
      });

    if (subtractions.length === 0) {
      setSubtractModeItem(null);
      setSubtractModeQtyPerClick(1);
      setSubtractModePending(new Map());
      restorePreviewItem();
      return;
    }

    try {
      // Subtract items via API
      for (const subtraction of subtractions) {
        if (subtraction.kind === 'free') {
          const qty = subtraction.currentQty;
          if (qty <= subtraction.amount) {
            await api.deleteSupplyLocation(subtraction.id);
          } else {
            await api.updateSupplyLocation(subtraction.id, { amount: qty - subtraction.amount });
          }
          continue;
        }

        const boxData = currentInventoryData.get(subtraction.location);
        const item = boxData?.inventory.find((i) => i.id === subtraction.id);

        if (!item) continue;

        if (item.qty <= subtraction.amount) {
          await api.deleteSupplyLocation(subtraction.id);
        } else {
          await api.updateSupplyLocation(subtraction.id, { amount: item.qty - subtraction.amount });
        }
      }

      // Reload supply locations to ensure UI reflects actual server state
      await reloadSupplyLocations();
      
      // Reload master items to update last_modified timestamp
      await reloadMasterItems();

      // Clear subtract mode
      setSubtractModeItem(null);
      setSubtractModeQtyPerClick(1);
      setSubtractModePending(new Map());
      restorePreviewItem();
    } catch (error) {
      console.error('Error finishing subtract mode:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message || 'Failed to subtract items');
        }
      }
    }
  }, [inventoryData, masterInventoryItems, reloadSupplyLocations, reloadMasterItems, freePlacementsBySupplyPublicId]);

  const cancelSubtractMode = useCallback(() => {
    const restore = subtractModeItemRef.current;
    setSubtractModeItem(null);
    setSubtractModeQtyPerClick(1);
    setSubtractModePending(new Map());
    if (restore) setSelectedMasterItem(restore);
  }, []);

  // Move Mode functions
  const startMoveMode = useCallback((itemName) => {
    setFreePlaceModeItem(null);
    moveModeDotDragLiveByIdRef.current.clear();
    setMoveModeItem(itemName);
    setMoveModeDragging(null);
    setMoveModePending([]);
    moveModePendingRef.current = [];
    setMoveModeFreeCoordById(new Map());
    setSelectedBox(null); // Clear box selection when entering move mode
  }, []);

  const finishMoveMode = useCallback(async () => {
    try {
      const pending = [...moveModePendingRef.current];
      for (const move of pending) {
        await api.moveSupplyLocations({
          from_location: move.from,
          to_location: move.to,
          supply_id: move.supplyId,
          shelf_from: move.shelfFrom,
          shelf_to: move.shelfTo,
          amount: move.qty
        });
      }
      if (moveModeFreeCoordById.size > 0) {
        for (const [id, { x, y }] of moveModeFreeCoordById) {
          await api.updateSupplyLocation(id, { coord_x: x, coord_y: y });
        }
      }
      if (pending.length > 0 || moveModeFreeCoordById.size > 0) {
        await reloadSupplyLocations();
      }
      await reloadMasterItems();
    } catch (error) {
      console.error('Error finishing move mode:', error);
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) setConflictError(errorInfo);
        else setError(errorInfo.message || 'Failed to save moves');
      }
      return;
    }

    moveModeDotDragLiveByIdRef.current.clear();
    setMoveModeFreeCoordById(new Map());
    setMoveModeItem(null);
    setMoveModeDragging(null);
    setMoveModePending([]);
    moveModePendingRef.current = [];
    setCurrentDragOverBox(null);
    isDraggingMoveBoxRef.current = false;
  }, [moveModeFreeCoordById, reloadMasterItems, reloadSupplyLocations]);

  const cancelMoveMode = useCallback(async () => {
    moveModeDotDragLiveByIdRef.current.clear();
    setMoveModeFreeCoordById(new Map());
    setMoveModeItem(null);
    setMoveModeDragging(null);
    setMoveModePending([]);
    moveModePendingRef.current = [];
    setCurrentDragOverBox(null);
    isDraggingMoveBoxRef.current = false;
    try {
      await reloadSupplyLocations();
    } catch (error) {
      console.error('Error reloading after cancel move mode:', error);
    }
  }, [reloadSupplyLocations]);

  const requestMasterArrowsRedraw = useCallback(() => {
    window.dispatchEvent(new CustomEvent(MASTER_ARROWS_REDRAW_EVENT));
  }, []);

  const updateMoveModeDotDragLiveForArrows = useCallback((id, worldX, worldY) => {
    const { x, y } = clampPointToRoom(worldX, worldY);
    moveModeDotDragLiveByIdRef.current.set(id, { x, y });
    window.dispatchEvent(new CustomEvent(MASTER_ARROWS_REDRAW_EVENT));
  }, []);

  const updateMoveModeFreeDotPosition = useCallback((id, worldX, worldY) => {
    const { x, y } = clampPointToRoom(worldX, worldY);
    setMoveModeFreeCoordById((prev) => {
      const next = new Map(prev);
      next.set(id, { x, y });
      return next;
    });
  }, []);

  const freePlaceVisualDots = useMemo(() => {
    if (!freePlaceModeItem) return null;
    const server = freePlacementsBySupplyPublicId.get(freePlaceModeItem) || [];
    const visible = server
      .filter((d) => !freePlacePendingDeletes.has(d.id))
      .map((d) => {
        const o = freePlacePendingCoordById.get(d.id);
        return o ? { ...d, x: o.x, y: o.y } : d;
      });
    const adds = freePlacePendingAdds.map((a) => ({
      id: a.tempId,
      x: a.x,
      y: a.y,
      qty: a.qty
    }));
    return [...visible, ...adds];
  }, [
    freePlaceModeItem,
    freePlacementsBySupplyPublicId,
    freePlacePendingDeletes,
    freePlacePendingCoordById,
    freePlacePendingAdds
  ]);

  /** Floor dots for arrows in subtract mode (hides fully pending-removed markers). */
  const subtractModeVisualFreeDots = useMemo(() => {
    if (!subtractModeItem) return null;
    const server = freePlacementsBySupplyPublicId.get(subtractModeItem) || [];
    return server
      .map((d) => {
        const key = `${FREE_SUBTRACT_DOT_PREFIX}||${d.id}`;
        const pending = subtractModePending.get(key) || 0;
        if ((d.qty || 0) - pending <= 0) return null;
        return d;
      })
      .filter(Boolean);
  }, [subtractModeItem, subtractModePending, freePlacementsBySupplyPublicId]);

  /** Floor dots for arrows in move mode (follows pending coord drags). */
  const moveModeVisualFreeDots = useMemo(() => {
    if (!moveModeItem) return null;
    const server = freePlacementsBySupplyPublicId.get(moveModeItem) || [];
    return server.map((d) => {
      const o = moveModeFreeCoordById.get(d.id);
      return o ? { ...d, x: o.x, y: o.y } : d;
    });
  }, [moveModeItem, freePlacementsBySupplyPublicId, moveModeFreeCoordById]);

  const clearFreePlaceSession = useCallback(() => {
    setFreePlacePendingDeletes(new Set());
    setFreePlacePendingCoordById(new Map());
    setFreePlacePendingAdds([]);
    setFreePlaceModeItem(null);
  }, []);

  const startFreePlaceMode = useCallback(
    (itemName) => {
      cancelAddMode();
      cancelSubtractMode();
      void cancelMoveMode();
      setFreePlacePendingDeletes(new Set());
      setFreePlacePendingCoordById(new Map());
      setFreePlacePendingAdds([]);
      setFreePlaceModeItem(itemName);
      setSelectedBox(null);
    },
    [cancelMoveMode, cancelAddMode, cancelSubtractMode]
  );

  const cancelFreePlaceMode = useCallback(() => {
    clearFreePlaceSession();
  }, [clearFreePlaceSession]);

  const finishFreePlaceMode = useCallback(async () => {
    const name = freePlaceModeItemRef.current;
    if (!name) {
      clearFreePlaceSession();
      return;
    }

    const hasWork =
      freePlacePendingDeletes.size > 0 ||
      freePlacePendingCoordById.size > 0 ||
      freePlacePendingAdds.length > 0;

    if (!hasWork) {
      clearFreePlaceSession();
      return;
    }

    const supplyId = masterInventoryItems.get(name)?.id;
    if (!supplyId) {
      setError(`Supply ID not found for item: ${name}`);
      return;
    }

    try {
      for (const id of freePlacePendingDeletes) {
        await api.deleteSupplyLocation(id);
      }
      for (const [id, { x, y }] of freePlacePendingCoordById) {
        if (freePlacePendingDeletes.has(id)) continue;
        await api.updateSupplyLocation(id, { coord_x: x, coord_y: y });
      }
      for (const a of freePlacePendingAdds) {
        await api.addSupplyLocation({
          supply_id: supplyId,
          coord_x: a.x,
          coord_y: a.y,
          amount: 1
        });
      }
      await reloadSupplyLocations();
      await reloadMasterItems();
    } catch (error) {
      console.error('Error finishing free place mode:', error);
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) setConflictError(errorInfo);
        else setError(errorInfo.message || 'Failed to save floor placements');
      }
      return;
    }

    clearFreePlaceSession();
  }, [
    masterInventoryItems,
    reloadSupplyLocations,
    reloadMasterItems,
    freePlacePendingDeletes,
    freePlacePendingCoordById,
    freePlacePendingAdds,
    clearFreePlaceSession
  ]);

  const handleFreePlaceWorldClick = useCallback(
    (worldX, worldY) => {
      const name = freePlaceModeItemRef.current;
      if (!name) return;
      const sid = masterInventoryItems.get(name)?.id;
      if (!sid) return;
      const { x, y } = clampPointToRoom(worldX, worldY);
      setFreePlacePendingAdds((prev) => {
        const existing = freePlacementsBySupplyPublicId.get(name) || [];
        const onServer = existing.some(
          (p) => Math.round(p.x) === x && Math.round(p.y) === y
        );
        const pendingDup = prev.some((a) => a.x === x && a.y === y);
        if (onServer || pendingDup) {
          setError('That floor coordinate already has a marker for this item (one unit per coordinate).');
          return prev;
        }
        return [...prev, { tempId: newTempFreePlaceId(), x, y, qty: 1 }];
      });
    },
    [masterInventoryItems, freePlacementsBySupplyPublicId, setError]
  );

  const updateFreePlaceSessionCoord = useCallback((id, worldX, worldY) => {
    const { x, y } = clampPointToRoom(worldX, worldY);
    if (typeof id === 'string' && id.startsWith('fp-')) {
      setFreePlacePendingAdds((prev) =>
        prev.map((a) => (a.tempId === id ? { ...a, x, y } : a))
      );
      return;
    }
    setFreePlacePendingCoordById((prev) => {
      const next = new Map(prev);
      next.set(id, { x, y });
      return next;
    });
  }, []);

  const handleFreePlaceSessionDotDelete = useCallback((id) => {
    if (typeof id === 'string' && id.startsWith('fp-')) {
      setFreePlacePendingAdds((prev) => prev.filter((a) => a.tempId !== id));
      return;
    }
    setFreePlacePendingDeletes((prev) => new Set([...prev, id]));
    setFreePlacePendingCoordById((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updateFreePlacementCoords = useCallback(
    async (id, worldX, worldY) => {
      const { x, y } = clampPointToRoom(worldX, worldY);
      try {
        await api.updateSupplyLocation(id, { coord_x: x, coord_y: y });
        await reloadSupplyLocations();
        await reloadMasterItems();
      } catch (error) {
        if (!isPanningRef.current) {
          const errorInfo = await handleApiError(error);
          if (errorInfo.isConflict) setConflictError(errorInfo);
          else setError(errorInfo.message || 'Failed to move placement');
        }
      }
    },
    [reloadSupplyLocations, reloadMasterItems]
  );

  const deleteFreePlacement = useCallback(
    async (id) => {
      try {
        await api.deleteSupplyLocation(id);
        await reloadSupplyLocations();
        await reloadMasterItems();
      } catch (error) {
        if (!isPanningRef.current) {
          const errorInfo = await handleApiError(error);
          if (errorInfo.isConflict) setConflictError(errorInfo);
          else setError(errorInfo.message || 'Failed to delete placement');
        }
      }
    },
    [reloadSupplyLocations, reloadMasterItems]
  );
  
  const clearMoveModeDragging = useCallback(() => {
    setMoveModeDragging(null);
    setCurrentDragOverBox(null);
    isDraggingMoveBoxRef.current = false;
  }, []);

  const handleMoveModeDragStart = useCallback((boxTitle, shelf, qty, x, y) => {
    isDraggingMoveBoxRef.current = true;
    const supplyPublicId = moveModeItemRef.current;
    const meta = supplyPublicId ? masterInventoryItems.get(supplyPublicId) : null;
    setMoveModeDragging({
      boxTitle,
      shelf,
      qty,
      x,
      y,
      originalX: x,
      originalY: y,
      supplyPublicId,
      itemName: meta?.name || ''
    });
  }, [masterInventoryItems]);
  
  const handleMoveModeDragMove = useCallback((x, y) => {
    if (moveModeDragging) {
      setMoveModeDragging(prev => ({ ...prev, x, y }));
    }
  }, [moveModeDragging]);

  const handleMoveModeDrop = useCallback((targetBoxTitle, targetShelf) => {
    if (!moveModeDragging || !moveModeItemRef.current) return;

    const supplyPublicId = moveModeDragging.supplyPublicId || moveModeItemRef.current;
    const itemName = moveModeDragging.itemName || '';
    const { boxTitle: sourceBoxTitle, shelf: sourceShelf, qty } = moveModeDragging;

    if (sourceBoxTitle === targetBoxTitle && sourceShelf === targetShelf) {
      setMoveModeDragging(null);
      isDraggingMoveBoxRef.current = false;
      return;
    }

    const supplyId = masterInventoryItems.get(supplyPublicId)?.id;
    if (!supplyId) {
      console.error(`Supply ID not found for item: ${supplyPublicId}`);
      setError(`Supply ID not found for item: ${supplyPublicId}`);
      setMoveModeDragging(null);
      isDraggingMoveBoxRef.current = false;
      return;
    }

    setInventoryData((prev) =>
      applyOptimisticMoveBetweenBoxes(
        prev,
        supplyPublicId,
        itemName,
        sourceBoxTitle,
        sourceShelf,
        targetBoxTitle,
        targetShelf,
        qty,
        supplyId
      )
    );

    const moveEntry = {
      from: sourceBoxTitle,
      to: targetBoxTitle,
      shelfFrom: sourceShelf !== undefined ? sourceShelf : null,
      shelfTo: targetShelf !== undefined ? targetShelf : null,
      qty,
      supplyId
    };
    setMoveModePending((prev) => [...prev, moveEntry]);
    moveModePendingRef.current = [...moveModePendingRef.current, moveEntry];

    setMoveModeDragging(null);
    isDraggingMoveBoxRef.current = false;
  }, [moveModeDragging, masterInventoryItems]);

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
          const supplyId =
            item.supplyId ??
            masterInventoryItems.get(
              item.supplyPublicId ||
                (item.supplyId != null ? `__legacy_id_${item.supplyId}` : '')
            )?.id;
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
        const it = draggedItemData.item;
        const supplyId =
          it.supplyId ??
          masterInventoryItems.get(
            it.supplyPublicId ||
              (it.supplyId != null ? `__legacy_id_${it.supplyId}` : '')
          )?.id;
        if (!supplyId) {
          throw new Error(`Supply ID not found for item: ${it.name}`);
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

      // Reload supply locations to ensure UI reflects actual server state
      await reloadSupplyLocations();

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
        const errorInfo = await handleApiError(error);
      if (errorInfo.isConflict) {
        setConflictError(errorInfo);
      } else {
        setError(errorInfo.message || 'Failed to move items');
      }
      }
    }
  }, [draggedItemData, masterInventoryItems, reloadSupplyLocations]);

  // Master Item helper functions (lookup by supplies.public_id)
  const resolveMasterItem = useCallback((supplyPublicId) => {
    return masterInventoryItems.get(supplyPublicId) || null;
  }, [masterInventoryItems]);

  const computeMasterQuantities = useCallback(() => {
    const quantities = new Map();
    inventoryData.forEach((boxData) => {
      boxData.inventory.forEach((item) => {
        const rowKey =
          item.supplyPublicId ||
          (item.supplyId != null ? `__legacy_id_${item.supplyId}` : item.name);
        const currentQty = quantities.get(rowKey) || 0;
        quantities.set(rowKey, currentQty + (item.qty || 0));
      });
    });
    freePlacementsBySupplyPublicId.forEach((placements, pid) => {
      let list = placements;
      if (freePlaceModeItem === pid && freePlaceVisualDots != null) {
        list = freePlaceVisualDots;
      }
      const sum = list.reduce((s, p) => s + (p.qty || 0), 0);
      quantities.set(pid, (quantities.get(pid) || 0) + sum);
    });
    return quantities;
  }, [inventoryData, freePlacementsBySupplyPublicId, freePlaceModeItem, freePlaceVisualDots]);

  const getItemLocations = useCallback((supplyPublicId) => {
    const locations = [];
    inventoryData.forEach((boxData, boxTitle) => {
      const hasItem = boxData.inventory.some((item) => {
        const k =
          item.supplyPublicId ||
          (item.supplyId != null ? `__legacy_id_${item.supplyId}` : null);
        return k === supplyPublicId;
      });
      if (hasItem) {
        locations.push(boxTitle);
      }
    });
    return locations;
  }, [inventoryData]);

  const createMasterItem = useCallback(async (item) => {
    try {
      const created = await api.createSupply({
        name: item.name,
        description: item.description || '',
        image: item.image || null,
        teams: item.teams || [],
        categories: item.categories || [],
        custom_fields: item.custom_fields && Object.keys(item.custom_fields).length > 0 ? item.custom_fields : undefined,
        supply_type_id: item.supply_type_id != null ? item.supply_type_id : undefined
      });
      
      const rowKey =
        created.public_id || (created.id != null ? `__legacy_id_${created.id}` : null);
      if (!rowKey) {
        throw new Error('Created supply missing public_id');
      }

      setMasterInventoryItems((prev) => {
        const next = new Map(prev);
        const locations = locationsListFromSupplyLocs(created.locations);
        next.set(rowKey, {
          public_id: created.public_id || null,
          name: created.name,
          description: created.description || '',
          image: created.image || null,
          locations,
          teams: created.teams || [],
          categories: created.categories || [],
          custom_fields: created.custom_fields || {},
          supply_type_id: created.supply_type_id ?? null,
          type_name: created.type_name || null,
          type_has_template_image: Boolean(created.type_has_template_image),
          lastModified: created.lastModified || null,
          last_modified_by: created.last_modified_by || null,
          last_modified_by_name: created.last_modified_by_name || null,
          id: created.id
        });
        return next;
      });
    } catch (error) {
      console.error('Error creating Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message);
        }
      }
      throw error;
    }
  }, []);

  const updateMasterItem = useCallback(async (supplyPublicId, newItem) => {
    try {
      const oldItem = masterInventoryItems.get(supplyPublicId);
      if (!oldItem || !oldItem.id) {
        throw new Error(`Item ${supplyPublicId} not found or missing ID`);
      }

      const payload = {
        name: newItem.name,
        description: newItem.description || '',
        image: newItem.image || null,
        teams: newItem.teams || [],
        categories: newItem.categories || [],
        custom_fields: newItem.custom_fields && Object.keys(newItem.custom_fields).length > 0 ? newItem.custom_fields : {}
      };
      if (newItem.unlink_from_type) {
        payload.unlink_from_type = true;
      }
      if (newItem.supply_type_id !== undefined) {
        payload.supply_type_id = newItem.supply_type_id;
      }
      const updated = await api.updateSupply(oldItem.id, payload);

      setMasterInventoryItems((prev) => {
        const next = new Map(prev);
        const locations = locationsListFromSupplyLocs(updated.locations);
        next.set(supplyPublicId, {
          public_id: updated.public_id || oldItem.public_id || null,
          name: updated.name,
          description: updated.description || '',
          image: updated.image || null,
          locations,
          teams: updated.teams || [],
          categories: updated.categories || [],
          custom_fields: updated.custom_fields || {},
          supply_type_id: updated.supply_type_id ?? null,
          type_name: updated.type_name || null,
          type_has_template_image: Boolean(updated.type_has_template_image),
          lastModified: updated.lastModified || null,
          last_modified_by: updated.last_modified_by || null,
          last_modified_by_name: updated.last_modified_by_name || null,
          id: updated.id
        });
        return next;
      });

      // Reload supply locations to get updated item names in boxes
      // (supply locations API JOINs with supplies table, so names will be updated)
      await reloadSupplyLocations();
    } catch (error) {
      console.error('Error updating Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message);
        }
      }
      throw error;
    }
  }, [masterInventoryItems, reloadSupplyLocations]);

  const deleteMasterItem = useCallback(async (supplyPublicId) => {
    try {
      const item = masterInventoryItems.get(supplyPublicId);
      if (!item || !item.id) {
        throw new Error(`Item ${supplyPublicId} not found or missing ID`);
      }

      await api.deleteSupply(item.id);

      setMasterInventoryItems((prev) => {
        const next = new Map(prev);
        next.delete(supplyPublicId);
        return next;
      });

      await reloadSupplyLocations();

      if (selectedMasterItem === supplyPublicId) {
        setSelectedMasterItem(null);
      }
    } catch (error) {
      console.error('Error deleting Master item:', error);
      // Only set error if not panning (to avoid breaking pan)
      if (!isPanningRef.current) {
        const errorInfo = await handleApiError(error);
        if (errorInfo.isConflict) {
          setConflictError(errorInfo);
        } else {
          setError(errorInfo.message);
        }
      }
      throw error;
    }
  }, [selectedMasterItem, masterInventoryItems, reloadSupplyLocations]);

  const clearSelectedMasterItem = useCallback(() => {
    setSelectedMasterItem(null);
  }, []);

  /** Close master preview (clears selection), add/subtract/move/free-place modes, and box add/edit UI. */
  const dismissMasterWorkbenchUI = useCallback(async () => {
    try {
      await cancelMoveMode();
    } catch (e) {
      console.error('dismissMasterWorkbenchUI: cancelMoveMode', e);
    }
    clearFreePlaceSession();
    setAddModeItem(null);
    setAddModeQtyPerClick(1);
    setAddModePending(new Map());
    setSubtractModeItem(null);
    setSubtractModeQtyPerClick(1);
    setSubtractModePending(new Map());
    setSelectedMasterItem(null);
    setSelectedBox(null);
    setCurrentEditingBox(null);
    setCurrentEditingIndex(null);
    setCurrentAddingBox(null);
    setCurrentAddingIndex(null);
    setTooltip({ visible: false, title: '', x: 0, y: 0 });
  }, [cancelMoveMode, clearFreePlaceSession]);

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
    conflictError,
    setConflictError,
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
    createMasterItem,
    updateMasterItem,
    deleteMasterItem,
    clearSelectedMasterItem,
    dismissMasterWorkbenchUI,
    reloadMasterItems,
    reloadSupplyLocations,
    // Master Table Filter
    masterFilterLocation,
    setMasterFilterLocation,
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
    // Subtract Mode (removes items from boxes, not the master entry)
    subtractModeItem,
    subtractModeQtyPerClick,
    setSubtractModeQtyPerClick,
    subtractModePending,
    subtractModePreviewRef,
    startSubtractMode,
    finishSubtractMode,
    cancelSubtractMode,
    handleBoxClickSubtractMode,
    handleSubtractFreeDotClick,
    boxHasAnySubtractPending,
    // Move Mode
    moveModeItem,
    moveModeDragging,
    startMoveMode,
    finishMoveMode,
    cancelMoveMode,
    clearMoveModeDragging,
    handleMoveModeDragStart,
    handleMoveModeDragMove,
    handleMoveModeDrop,
    isDraggingMoveBoxRef,
    moveModeFreeCoordById,
    moveModeDotDragLiveByIdRef,
    updateMoveModeFreeDotPosition,
    updateMoveModeDotDragLiveForArrows,
    requestMasterArrowsRedraw,
    freePlaceModeItem,
    freePlacementsBySupplyPublicId,
    startFreePlaceMode,
    cancelFreePlaceMode,
    finishFreePlaceMode,
    handleFreePlaceWorldClick,
    freePlaceVisualDots,
    subtractModeVisualFreeDots,
    moveModeVisualFreeDots,
    updateFreePlaceSessionCoord,
    handleFreePlaceSessionDotDelete,
    updateFreePlacementCoords,
    deleteFreePlacement,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};