import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInventory } from '../../context/InventoryContext';
import MasterTableRow from './MasterTableRow';
import MasterCreateModal from './MasterCreateModal';
import { getCategories, api } from '../../api';

/** Sentinel for filter: items with no template type */
const TYPE_FILTER_NONE = '__NO_TYPE__';

const MasterInventoryTable = () => {
  const {
    masterInventoryItems,
    computeMasterQuantities,
    getItemLocations,
    setSelectedMasterItem,
    selectedMasterItem,
    dismissMasterWorkbenchUI,
    inventoryData,
    masterFilterLocation,
    setMasterFilterLocation
  } = useInventory();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [createFromType, setCreateFromType] = useState(true);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterType, setFilterType] = useState('location'); // 'location' | 'category' | 'type'
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [selectedTypes, setSelectedTypes] = useState(new Set());
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoryIdToName, setCategoryIdToName] = useState(new Map());
  const [categoryNameToId, setCategoryNameToId] = useState(new Map());
  const filterButtonRef = React.useRef(null);
  const columnButtonRef = React.useRef(null);
  const groupButtonRef = React.useRef(null);
  
  // Column visibility state - default hide category and team, show others
  const [showTypeColumn, setShowTypeColumn] = useState(false);
  const [showQtyColumn, setShowQtyColumn] = useState(true);
  const [showLocationColumn, setShowLocationColumn] = useState(true);
  const [showCategoryColumn, setShowCategoryColumn] = useState(false);
  const [showTeamColumn, setShowTeamColumn] = useState(false);
  const [showLastModifiedColumn, setShowLastModifiedColumn] = useState(true);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [visibleCustomColumns, setVisibleCustomColumns] = useState(new Set());

  // Grouping state - null (no grouping) or 'type'
  const [groupBy, setGroupBy] = useState(null);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [supplyTypes, setSupplyTypes] = useState([]);
  
  // Sorting state - default to lastModified ascending (earliest first)
  const [sortColumn, setSortColumn] = useState('lastModified');
  const [sortDirection, setSortDirection] = useState('asc');

  const quantities = computeMasterQuantities();

  const filterHasSelection =
    (filterType === 'location' && selectedLocations.size > 0) ||
    (filterType === 'category' && selectedCategories.size > 0) ||
    (filterType === 'type' && selectedTypes.size > 0);

  const filterSelectionCount =
    filterType === 'location'
      ? selectedLocations.size
      : filterType === 'category'
        ? selectedCategories.size
        : selectedTypes.size;

  // Get all available locations from inventoryData
  const availableLocations = useMemo(() => {
    return Array.from(inventoryData.keys()).sort();
  }, [inventoryData]);

  // Helper function to get item categories (convert IDs to names)
  const getItemCategories = useCallback((supplyPublicId) => {
    const itemData = masterInventoryItems.get(supplyPublicId);
    if (!itemData || !itemData.categories || itemData.categories.length === 0) {
      return [];
    }
    return itemData.categories
      .map(catId => categoryIdToName.get(catId))
      .filter(name => name !== undefined)
      .sort(); // Sort alphabetically for consistency
  }, [masterInventoryItems, categoryIdToName]);

  // Helper function to get item teams (capitalize first letter)
  const getItemTeams = useCallback((supplyPublicId) => {
    const itemData = masterInventoryItems.get(supplyPublicId);
    if (!itemData || !itemData.teams || itemData.teams.length === 0) {
      return [];
    }
    // Capitalize first letter of each team name
    return [...itemData.teams]
      .map(team => team.charAt(0).toUpperCase() + team.slice(1).toLowerCase())
      .sort(); // Sort alphabetically for consistency
  }, [masterInventoryItems]);

  const availableTemplateTypes = useMemo(() => {
    const names = new Set();
    let hasUntyped = false;
    for (const [, item] of masterInventoryItems.entries()) {
      if (item.type_name) names.add(item.type_name);
      else hasUntyped = true;
    }
    const sorted = Array.from(names).sort();
    if (hasUntyped) sorted.unshift(TYPE_FILTER_NONE);
    return sorted;
  }, [masterInventoryItems]);

  const typeFilterLabel = (key) => (key === TYPE_FILTER_NONE ? '(No type)' : key);

  // Sync with context filter location
  useEffect(() => {
    if (masterFilterLocation) {
      setFilterType('location');
      setSelectedLocations(new Set([masterFilterLocation]));
      setSelectedTypes(new Set());
      // Clear the context filter after applying it
      setMasterFilterLocation(null);
    }
  }, [masterFilterLocation, setMasterFilterLocation]);

  // Fetch categories on mount (needed for both filtering and display)
  useEffect(() => {
    if (availableCategories.length === 0) {
      getCategories()
        .then(categories => {
          const categoryList = categories.map(c => typeof c === 'string' ? c : c.name);
          setAvailableCategories(categoryList);
          
          // Build ID-to-name and name-to-ID mappings
          const idToName = new Map();
          const nameToId = new Map();
          categories.forEach(cat => {
            if (typeof cat === 'object' && cat.id && cat.name) {
              idToName.set(cat.id, cat.name);
              nameToId.set(cat.name, cat.id);
            }
          });
          setCategoryIdToName(idToName);
          setCategoryNameToId(nameToId);
        })
        .catch(err => {
          console.error('Failed to fetch categories:', err);
          setAvailableCategories([]);
          setCategoryIdToName(new Map());
          setCategoryNameToId(new Map());
        });
    }
  }, [availableCategories.length]);

  // Fetch custom field definitions for column options
  useEffect(() => {
    api.getCustomFieldDefinitions()
      .then(setCustomFieldDefinitions)
      .catch(() => setCustomFieldDefinitions([]));
  }, []);

  // Lazy-fetch supply types when grouping by type is activated
  useEffect(() => {
    if (groupBy !== 'type') return;
    if (!api.getSupplyTypes) return;
    let cancelled = false;
    api.getSupplyTypes()
      .then((data) => { if (!cancelled) setSupplyTypes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setSupplyTypes([]); });
    return () => { cancelled = true; };
  }, [groupBy]);

  const toggleCustomColumn = useCallback((fieldName) => {
    setVisibleCustomColumns(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  }, []);

  const filteredItems = useMemo(() => {
    const itemsArray = Array.from(masterInventoryItems.entries());
    
    // Filter by search query
    let filtered = itemsArray;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(([, itemData]) => {
        const nm = (itemData?.name || '').toLowerCase();
        if (nm.includes(query)) return true;
        const tn = (itemData?.type_name || '').toLowerCase();
        return tn.includes(query);
      });
    }
    
    // Filter by location OR category (not both)
    if (filterType === 'location' && selectedLocations.size > 0) {
      filtered = filtered.filter(([supplyPublicId]) => {
        const itemLocations = getItemLocations(supplyPublicId);
        // Show item if it appears in at least one selected location
        return itemLocations.some(loc => selectedLocations.has(loc));
      });
    } else if (filterType === 'category' && selectedCategories.size > 0) {
      filtered = filtered.filter(([, itemData]) => {
        if (!itemData.categories || itemData.categories.length === 0) {
          return false; // Item has no categories, exclude if categories are selected
        }
        // Convert item's category IDs to names and check if any match selected categories
        const itemCategoryNames = itemData.categories
          .map(catId => categoryIdToName.get(catId))
          .filter(name => name !== undefined);
        // Show item if it has at least one selected category
        return itemCategoryNames.some(catName => selectedCategories.has(catName));
      });
    } else if (filterType === 'type' && selectedTypes.size > 0) {
      filtered = filtered.filter(([, itemData]) => {
        const key = itemData.type_name ? itemData.type_name : TYPE_FILTER_NONE;
        return selectedTypes.has(key);
      });
    }
    
    return filtered;
  }, [masterInventoryItems, searchQuery, filterType, selectedLocations, selectedCategories, selectedTypes, getItemLocations, categoryIdToName]);

  const handleLocationToggle = (location) => {
    setSelectedLocations(prev => {
      const next = new Set(prev);
      if (next.has(location)) {
        next.delete(location);
      } else {
        next.add(location);
      }
      return next;
    });
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleClearFilters = () => {
    setSelectedLocations(new Set());
    setSelectedCategories(new Set());
    setSelectedTypes(new Set());
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    if (type === 'location') {
      setSelectedCategories(new Set());
      setSelectedTypes(new Set());
    } else if (type === 'category') {
      setSelectedLocations(new Set());
      setSelectedTypes(new Set());
    } else if (type === 'type') {
      setSelectedLocations(new Set());
      setSelectedCategories(new Set());
    }
  };

  const handleTypeToggle = (typeKey) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(typeKey)) next.delete(typeKey);
      else next.add(typeKey);
      return next;
    });
  };

  // Close filter menu when clicking outside
  useEffect(() => {
    if (!showFilterMenu) return;
    
    const handleClickOutside = (event) => {
      if (filterButtonRef.current && !filterButtonRef.current.contains(event.target)) {
        setShowFilterMenu(false);
      }
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterMenu]);

  // Close column menu when clicking outside
  useEffect(() => {
    if (!showColumnMenu) return;
    
    const handleClickOutside = (event) => {
      if (columnButtonRef.current && !columnButtonRef.current.contains(event.target)) {
        setShowColumnMenu(false);
      }
    };

    // Use a small delay to avoid closing immediately when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnMenu]);

  // Close group menu when clicking outside
  useEffect(() => {
    if (!showGroupMenu) return;

    const handleClickOutside = (event) => {
      if (groupButtonRef.current && !groupButtonRef.current.contains(event.target)) {
        setShowGroupMenu(false);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGroupMenu]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    
    if (items.length === 0) return items;
    
    return items.sort(([pidA, itemDataA], [pidB, itemDataB]) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'name': {
          comparison = (itemDataA?.name || '').localeCompare(itemDataB?.name || '');
          if (comparison === 0) comparison = pidA.localeCompare(pidB);
          break;
        }
        case 'qty':
          const qtyA = quantities.get(pidA) || 0;
          const qtyB = quantities.get(pidB) || 0;
          comparison = qtyA - qtyB;
          break;
        case 'location':
          const locsA = getItemLocations(pidA);
          const locsB = getItemLocations(pidB);
          // Sort by first location name, or by count if no locations
          if (locsA.length === 0 && locsB.length === 0) {
            comparison = 0;
          } else if (locsA.length === 0) {
            comparison = 1; // Items with no locations go to end
          } else if (locsB.length === 0) {
            comparison = -1;
          } else {
            comparison = locsA[0].localeCompare(locsB[0]);
          }
          break;
        case 'category':
          const catsA = getItemCategories(pidA);
          const catsB = getItemCategories(pidB);
          // Sort by first category name, or by count if no categories
          if (catsA.length === 0 && catsB.length === 0) {
            comparison = 0;
          } else if (catsA.length === 0) {
            comparison = 1; // Items with no categories go to end
          } else if (catsB.length === 0) {
            comparison = -1;
          } else {
            comparison = catsA[0].localeCompare(catsB[0]);
          }
          break;
        case 'team':
          const teamsA = getItemTeams(pidA);
          const teamsB = getItemTeams(pidB);
          // Sort by first team name, or by count if no teams
          if (teamsA.length === 0 && teamsB.length === 0) {
            comparison = 0;
          } else if (teamsA.length === 0) {
            comparison = 1; // Items with no teams go to end
          } else if (teamsB.length === 0) {
            comparison = -1;
          } else {
            comparison = teamsA[0].localeCompare(teamsB[0]);
          }
          break;
        case 'lastModified':
          const dateA = itemDataA.lastModified ? new Date(itemDataA.lastModified).getTime() : 0;
          const dateB = itemDataB.lastModified ? new Date(itemDataB.lastModified).getTime() : 0;
          comparison = dateA - dateB;
          break;
        default: {
          const customDef = customFieldDefinitions.find(d => d.name === sortColumn);
          if (customDef) {
            const valA = itemDataA.custom_fields?.[sortColumn];
            const valB = itemDataB.custom_fields?.[sortColumn];
            if (customDef.type === 'number') {
              const nA = valA !== undefined && valA !== null && valA !== '' ? Number(valA) : NaN;
              const nB = valB !== undefined && valB !== null && valB !== '' ? Number(valB) : NaN;
              comparison = (Number.isNaN(nA) ? 1 : 0) - (Number.isNaN(nB) ? 1 : 0) || nA - nB;
            } else if (customDef.type === 'date') {
              const tA = valA ? new Date(valA).getTime() : 0;
              const tB = valB ? new Date(valB).getTime() : 0;
              comparison = tA - tB;
            } else {
              const sA = valA != null ? String(valA) : '';
              const sB = valB != null ? String(valB) : '';
              comparison = sA.localeCompare(sB);
            }
          } else {
            comparison = 0;
          }
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredItems, sortColumn, sortDirection, quantities, getItemLocations, getItemCategories, getItemTeams, customFieldDefinitions]);

  const handleRowClick = (itemName) => {
    setSelectedMasterItem(itemName);
  };

  const handleAddItem = () => {
    void dismissMasterWorkbenchUI().then(() => setShowAddModal(true));
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const standardColumnCount = 6;

  const handleShowAllColumns = () => {
    setShowTypeColumn(true);
    setShowQtyColumn(true);
    setShowLocationColumn(true);
    setShowCategoryColumn(true);
    setShowTeamColumn(true);
    setShowLastModifiedColumn(true);
    setVisibleCustomColumns(new Set(customFieldDefinitions.map(d => d.name)));
  };

  const handleHideAllColumns = () => {
    setShowTypeColumn(false);
    setShowQtyColumn(false);
    setShowLocationColumn(false);
    setShowCategoryColumn(false);
    setShowTeamColumn(false);
    setShowLastModifiedColumn(false);
    setVisibleCustomColumns(new Set());
  };

  // Count visible columns (excluding Name which is always visible)
  const visibleColumnCount = [
    showTypeColumn,
    showQtyColumn,
    showLocationColumn,
    showCategoryColumn,
    showTeamColumn,
    showLastModifiedColumn
  ].filter(Boolean).length + visibleCustomColumns.size;

  // Total columns including the always-visible Name column (used for group-header colSpan)
  const totalVisibleColumns = 1 + visibleColumnCount;

  const TYPE_GROUP_UNTYPED = '__NO_TYPE__';

  const summarizeType = useCallback((typeRow) => {
    if (!typeRow) return '';
    const parts = [];
    if (typeRow.item_name_prefix) parts.push(`Prefix "${typeRow.item_name_prefix}"`);
    if (typeRow.item_description_prefix) parts.push(`Desc prefix "${typeRow.item_description_prefix}"`);
    const locked = Array.isArray(typeRow.locked_custom_field_keys) ? typeRow.locked_custom_field_keys : [];
    if (locked.length > 0) parts.push(`Required fields: ${locked.join(', ')}`);
    const catIds = Array.isArray(typeRow.locked_category_ids) ? typeRow.locked_category_ids : [];
    if (catIds.length > 0) {
      const names = catIds.map((id) => categoryIdToName.get(id)).filter(Boolean);
      if (names.length > 0) parts.push(`Categories: ${names.join(', ')}`);
    }
    const teamNames = Array.isArray(typeRow.locked_team_names) ? typeRow.locked_team_names : [];
    if (teamNames.length > 0) parts.push(`Teams: ${teamNames.join(', ')}`);
    if (typeRow.is_unique) parts.push('Unique');
    if (typeRow.prevent_user_edit) parts.push('Admin-only edits');
    return parts.join(' \u2022 ');
  }, [categoryIdToName]);

  const groupedRows = useMemo(() => {
    if (groupBy !== 'type') return null;
    const byName = new Map((supplyTypes || []).map((t) => [t.name, t]));
    const buckets = new Map();
    for (const entry of sortedItems) {
      const [, itemData] = entry;
      const key = itemData.type_name || TYPE_GROUP_UNTYPED;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => {
      if (a === TYPE_GROUP_UNTYPED) return 1;
      if (b === TYPE_GROUP_UNTYPED) return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({
      key,
      label: key === TYPE_GROUP_UNTYPED ? '(No type)' : key,
      typeRow: key === TYPE_GROUP_UNTYPED ? null : byName.get(key) || null,
      items: buckets.get(key),
    }));
  }, [groupBy, supplyTypes, sortedItems]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column) {
      // Show neutral sort icon when not active
      return (
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.3, marginLeft: '0.25rem' }}
        >
          <path d="M3 4.5L6 1.5L9 4.5" />
          <path d="M3 7.5L6 10.5L9 7.5" />
        </svg>
      );
    }
    
    // Show active sort icon
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginLeft: '0.25rem' }}
      >
        {sortDirection === 'asc' ? (
          <path d="M3 4.5L6 1.5L9 4.5" />
        ) : (
          <path d="M3 7.5L6 10.5L9 7.5" />
        )}
      </svg>
    );
  };

  return (
    <>
      <div className="master-inventory-table">
        <div className="master-table-header">
          <h2>Master Inventory</h2>
        </div>
        <div className="master-table-search">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="master-search-input"
          />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }} ref={filterButtonRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterMenu(!showFilterMenu);
                }}
                style={{
                  padding: '0.4rem',
                  fontSize: '1rem',
                  background: filterHasSelection ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--stroke)',
                color: filterHasSelection ? 'white' : 'var(--text)',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                position: 'relative',
                transition: 'all 0.2s'
              }}
              title="Filter items"
              onMouseEnter={(e) => {
                if (!filterHasSelection) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!filterHasSelection) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 4h12M4 8h8M6 12h4" />
              </svg>
              {filterHasSelection && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  background: 'var(--accent)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  fontSize: '0.65rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  border: '2px solid var(--panel, #0e1116)'
                }}>
                  {filterSelectionCount}
                </span>
              )}
            </button>
            {filterHasSelection && (
              <button
                onClick={handleClearFilters}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  background: 'transparent',
                  border: '1px solid var(--stroke)',
                  color: 'var(--text)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Clear filter"
              >
                Clear
              </button>
            )}
            
            {/* Filter Dropdown Menu */}
            {showFilterMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.5rem',
                  background: '#0a0d12',
                  border: '1px solid var(--stroke)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                  zIndex: 1000,
                  minWidth: '300px',
                  maxWidth: '400px',
                  maxHeight: '500px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  animation: 'slideDown 0.15s ease-out',
                  transformOrigin: 'top'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--stroke)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: 'var(--text)' }}>
                    Filter
                  </h4>
                  <select
                    value={filterType}
                    onChange={(e) => handleFilterTypeChange(e.target.value)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.85rem',
                      background: 'var(--panel, #0e1116)',
                      border: '1px solid var(--stroke)',
                      color: 'var(--text)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      flex: '0 0 auto'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="location">Location</option>
                    <option value="category">Category</option>
                    <option value="type">Type</option>
                  </select>
                </div>
                
                {filterType === 'location' ? (
                  /* Locations Section */
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {availableLocations.length === 0 ? (
                      <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        No locations available
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setSelectedLocations(new Set(availableLocations))}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Select All
                          </button>
                          <button
                            onClick={() => setSelectedLocations(new Set())}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '0.25rem',
                          flex: 1
                        }}>
                          {availableLocations.map(location => (
                            <label
                              key={location}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                background: selectedLocations.has(location) ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (!selectedLocations.has(location)) {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!selectedLocations.has(location)) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedLocations.has(location)}
                                onChange={() => handleLocationToggle(location)}
                                style={{
                                  marginRight: '0.75rem',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer'
                                }}
                              />
                              <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>{location}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : filterType === 'category' ? (
                  /* Categories Section */
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {availableCategories.length === 0 ? (
                      <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        No categories available
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setSelectedCategories(new Set(availableCategories))}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Select All
                          </button>
                          <button
                            onClick={() => setSelectedCategories(new Set())}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '0.25rem',
                          flex: 1
                        }}>
                          {availableCategories.map(category => (
                            <label
                              key={category}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                background: selectedCategories.has(category) ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (!selectedCategories.has(category)) {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!selectedCategories.has(category)) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCategories.has(category)}
                                onChange={() => handleCategoryToggle(category)}
                                style={{
                                  marginRight: '0.75rem',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer'
                                }}
                              />
                              <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>{category}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : filterType === 'type' ? (
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    {availableTemplateTypes.length === 0 ? (
                      <div style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        No types in inventory
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedTypes(new Set(availableTemplateTypes))}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTypes(new Set())}
                            style={{
                              padding: '0.3rem 0.6rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid var(--stroke)',
                              color: 'var(--text)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              flex: 1
                            }}
                          >
                            Clear
                          </button>
                        </div>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '0.25rem',
                          flex: 1
                        }}>
                          {availableTemplateTypes.map((typeKey) => (
                            <label
                              key={typeKey}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                background: selectedTypes.has(typeKey) ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => {
                                if (!selectedTypes.has(typeKey)) {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!selectedTypes.has(typeKey)) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedTypes.has(typeKey)}
                                onChange={() => handleTypeToggle(typeKey)}
                                style={{
                                  marginRight: '0.75rem',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer'
                                }}
                              />
                              <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>
                                {typeFilterLabel(typeKey)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
                
                {/* Status Footer */}
                <div style={{ 
                  padding: '0.75rem', 
                  borderTop: '1px solid var(--stroke)', 
                  background: 'rgba(0, 0, 0, 0.2)', 
                  fontSize: '0.8rem', 
                  color: 'var(--muted)' 
                }}>
                  {filterType === 'location' 
                    ? (selectedLocations.size === 0
                        ? 'No locations selected - showing all items'
                        : `${selectedLocations.size} location${selectedLocations.size === 1 ? '' : 's'} selected`)
                    : filterType === 'category'
                      ? (selectedCategories.size === 0
                          ? 'No categories selected - showing all items'
                          : `${selectedCategories.size} categor${selectedCategories.size === 1 ? 'y' : 'ies'} selected`)
                      : (selectedTypes.size === 0
                          ? 'No types selected - showing all items'
                          : `${selectedTypes.size} type${selectedTypes.size === 1 ? '' : 's'} selected`)}
                </div>
              </div>
            )}
            </div>
            {/* Column Visibility Button */}
            <div style={{ position: 'relative' }} ref={columnButtonRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColumnMenu(!showColumnMenu);
                }}
                style={{
                  padding: '0.4rem',
                  fontSize: '1rem',
                  background: visibleColumnCount < (standardColumnCount + customFieldDefinitions.length) ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--stroke)',
                  color: visibleColumnCount < (standardColumnCount + customFieldDefinitions.length) ? 'white' : 'var(--text)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  position: 'relative',
                  transition: 'all 0.2s'
                }}
                title="Show/hide columns"
                onMouseEnter={(e) => {
                  if (visibleColumnCount === standardColumnCount + customFieldDefinitions.length) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (visibleColumnCount === standardColumnCount + customFieldDefinitions.length) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 2h12M2 6h12M2 10h12M2 14h12" />
                </svg>
                {visibleColumnCount < standardColumnCount + customFieldDefinitions.length && (
                  <span style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'var(--accent)',
                    color: 'white',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    border: '2px solid var(--panel, #0e1116)'
                  }}>
                    {standardColumnCount + customFieldDefinitions.length - visibleColumnCount}
                  </span>
                )}
              </button>
              
              {/* Column Visibility Dropdown Menu */}
              {showColumnMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.5rem',
                    background: '#0a0d12',
                    border: '1px solid var(--stroke)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    zIndex: 1000,
                    minWidth: '200px',
                    padding: '0.75rem',
                    animation: 'slideDown 0.15s ease-out',
                    transformOrigin: 'top'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text)' }}>
                    Show Columns
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button
                      onClick={handleShowAllColumns}
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        background: 'rgba(100, 150, 255, 0.2)',
                        border: '1px solid var(--stroke)',
                        color: 'var(--text)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(100, 150, 255, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(100, 150, 255, 0.2)';
                      }}
                    >
                      Show All
                    </button>
                    <button
                      onClick={handleHideAllColumns}
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: '1px solid var(--stroke)',
                        color: 'var(--text)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Hide All
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showTypeColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showTypeColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showTypeColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showTypeColumn}
                        onChange={() => setShowTypeColumn(!showTypeColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Type</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showQtyColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showQtyColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showQtyColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showQtyColumn}
                        onChange={() => setShowQtyColumn(!showQtyColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Qty</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showLocationColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showLocationColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showLocationColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showLocationColumn}
                        onChange={() => setShowLocationColumn(!showLocationColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Location</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showCategoryColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showCategoryColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showCategoryColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showCategoryColumn}
                        onChange={() => setShowCategoryColumn(!showCategoryColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Category</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showTeamColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showTeamColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showTeamColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showTeamColumn}
                        onChange={() => setShowTeamColumn(!showTeamColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Team</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: showLastModifiedColumn ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!showLastModifiedColumn) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showLastModifiedColumn) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showLastModifiedColumn}
                        onChange={() => setShowLastModifiedColumn(!showLastModifiedColumn)}
                        style={{
                          marginRight: '0.75rem',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Last Modified</span>
                    </label>
                    {customFieldDefinitions.length > 0 && (
                      <>
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--stroke)', fontSize: '0.8rem', color: 'var(--muted)' }}>
                          Custom fields
                        </div>
                        {customFieldDefinitions.map(d => (
                          <label
                            key={d.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0.5rem',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              background: visibleCustomColumns.has(d.name) ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              if (!visibleCustomColumns.has(d.name)) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!visibleCustomColumns.has(d.name)) {
                                e.currentTarget.style.background = 'transparent';
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={visibleCustomColumns.has(d.name)}
                              onChange={() => toggleCustomColumn(d.name)}
                              style={{
                                marginRight: '0.75rem',
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer'
                              }}
                            />
                            <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>{d.name}</span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Group Button */}
            <div style={{ position: 'relative' }} ref={groupButtonRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGroupMenu(!showGroupMenu);
                }}
                style={{
                  padding: '0.4rem',
                  fontSize: '1rem',
                  background: groupBy ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--stroke)',
                  color: groupBy ? 'white' : 'var(--text)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  position: 'relative',
                  transition: 'all 0.2s'
                }}
                title="Group rows"
                onMouseEnter={(e) => {
                  if (!groupBy) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!groupBy) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 1.5L2 4.5l6 3 6-3-6-3z" />
                  <path d="M2 8l6 3 6-3" />
                  <path d="M2 11.5l6 3 6-3" />
                </svg>
              </button>

              {/* Group Dropdown Menu */}
              {showGroupMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '0.5rem',
                    background: '#0a0d12',
                    border: '1px solid var(--stroke)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    zIndex: 1000,
                    minWidth: '200px',
                    padding: '0.75rem',
                    animation: 'slideDown 0.15s ease-out',
                    transformOrigin: 'top'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600', color: 'var(--text)' }}>
                    Group by
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: groupBy === null ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (groupBy !== null) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (groupBy !== null) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="master-group-by"
                        checked={groupBy === null}
                        onChange={() => {
                          setGroupBy(null);
                          setCollapsedGroups(new Set());
                        }}
                        style={{ marginRight: '0.75rem', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>None</span>
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        background: groupBy === 'type' ? 'rgba(100, 150, 255, 0.2)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (groupBy !== 'type') {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (groupBy !== 'type') {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="master-group-by"
                        checked={groupBy === 'type'}
                        onChange={() => {
                          setGroupBy('type');
                          setCollapsedGroups(new Set());
                        }}
                        style={{ marginRight: '0.75rem', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text)', fontSize: '0.85rem' }}>Type</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="master-table-content">
          {sortedItems.length === 0 ? (
            <div className="master-table-empty">
              {searchQuery || filterHasSelection
                ? 'No items found matching filters' 
                : 'No Master items. Click "+ Create Item" to create one.'}
            </div>
          ) : (
            <table className="master-table">
              <thead>
                <tr>
                  {showTypeColumn && (
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('typeName')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Type
                        <SortIcon column="typeName" />
                      </span>
                    </th>
                  )}
                  <th 
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('name')}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      Name
                      <SortIcon column="name" />
                    </span>
                  </th>
                  {showQtyColumn && (
                    <th 
                      className="qty-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('qty')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Qty
                        <SortIcon column="qty" />
                      </span>
                    </th>
                  )}
                  {showLocationColumn && (
                    <th 
                      className="location-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('location')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Location
                        <SortIcon column="location" />
                      </span>
                    </th>
                  )}
                  {showCategoryColumn && (
                    <th 
                      className="category-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('category')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Category
                        <SortIcon column="category" />
                      </span>
                    </th>
                  )}
                  {showTeamColumn && (
                    <th 
                      className="team-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('team')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Team
                        <SortIcon column="team" />
                      </span>
                    </th>
                  )}
                  {showLastModifiedColumn && (
                    <th 
                      className="modified-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort('lastModified')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        Last Modified
                        <SortIcon column="lastModified" />
                      </span>
                    </th>
                  )}
                  {customFieldDefinitions.filter(d => visibleCustomColumns.has(d.name)).map(d => (
                    <th
                      key={d.id}
                      className="custom-field-cell"
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleSort(d.name)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        {d.name}
                        <SortIcon column={d.name} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupBy === 'type' && groupedRows ? (
                  groupedRows.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.key);
                    const summary = summarizeType(group.typeRow);
                    return (
                      <React.Fragment key={`group-${group.key}`}>
                        <tr
                          className="master-group-header"
                          onClick={() => toggleGroup(group.key)}
                          style={{
                            background: 'rgba(100, 150, 255, 0.08)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            borderTop: '1px solid var(--stroke)',
                          }}
                        >
                          <td
                            colSpan={totalVisibleColumns}
                            style={{ padding: '0.5rem 0.75rem' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  flexShrink: 0,
                                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.15s',
                                }}
                              >
                                <path d="M3 4.5L6 7.5L9 4.5" />
                              </svg>
                              <strong style={{ color: 'var(--text)', fontSize: '0.9rem' }}>
                                {group.label}
                              </strong>
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                                ({group.items.length})
                              </span>
                              {summary && (
                                <span
                                  style={{
                                    color: 'var(--muted)',
                                    fontSize: '0.78rem',
                                    marginLeft: '0.75rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                    flex: 1,
                                  }}
                                  title={summary}
                                >
                                  {summary}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed && group.items.map(([itemName, itemData]) => (
                          <MasterTableRow
                            key={itemName}
                            itemName={itemName}
                            itemData={itemData}
                            quantity={quantities.get(itemName) || 0}
                            locations={getItemLocations(itemName)}
                            categories={getItemCategories(itemName)}
                            teams={getItemTeams(itemName)}
                            showType={showTypeColumn}
                            showQty={showQtyColumn}
                            showLocation={showLocationColumn}
                            showCategory={showCategoryColumn}
                            showTeam={showTeamColumn}
                            showLastModified={showLastModifiedColumn}
                            visibleCustomColumns={visibleCustomColumns}
                            customFieldDefinitions={customFieldDefinitions}
                            isSelected={selectedMasterItem === itemName}
                            onClick={() => handleRowClick(itemName)}
                          />
                        ))}
                      </React.Fragment>
                    );
                  })
                ) : (
                  sortedItems.map(([itemName, itemData]) => (
                    <MasterTableRow
                      key={itemName}
                      itemName={itemName}
                      itemData={itemData}
                      quantity={quantities.get(itemName) || 0}
                      locations={getItemLocations(itemName)}
                      categories={getItemCategories(itemName)}
                      teams={getItemTeams(itemName)}
                      showType={showTypeColumn}
                      showQty={showQtyColumn}
                      showLocation={showLocationColumn}
                      showCategory={showCategoryColumn}
                      showTeam={showTeamColumn}
                      showLastModified={showLastModifiedColumn}
                      visibleCustomColumns={visibleCustomColumns}
                      customFieldDefinitions={customFieldDefinitions}
                      isSelected={selectedMasterItem === itemName}
                      onClick={() => handleRowClick(itemName)}
                    />
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        <div
          className="master-table-actions"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}
        >
          <button className="add-item-button" onClick={handleAddItem}>
            + Create Item
          </button>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              color: 'var(--muted)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={createFromType}
              onChange={(e) => setCreateFromType(e.target.checked)}
            />
            Create from Type
          </label>
        </div>
      </div>
      <MasterCreateModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        showTypeSelector={createFromType}
      />
    </>
  );
};

export default MasterInventoryTable;




