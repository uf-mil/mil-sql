import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInventory } from '../../context/InventoryContext';
import MasterTableRow from './MasterTableRow';
import MasterCreateModal from './MasterCreateModal';
import { getCategories, api } from '../../api';

const MasterInventoryTable = () => {
  const {
    masterInventoryItems,
    computeMasterQuantities,
    getItemLocations,
    setSelectedMasterItem,
    selectedMasterItem,
    inventoryData,
    masterFilterLocation,
    setMasterFilterLocation
  } = useInventory();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterType, setFilterType] = useState('location'); // 'location' or 'category', default is 'location'
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [availableCategories, setAvailableCategories] = useState([]);
  const [categoryIdToName, setCategoryIdToName] = useState(new Map());
  const [categoryNameToId, setCategoryNameToId] = useState(new Map());
  const filterButtonRef = React.useRef(null);
  const columnButtonRef = React.useRef(null);
  
  // Column visibility state - default hide category and team, show others
  const [showQtyColumn, setShowQtyColumn] = useState(true);
  const [showLocationColumn, setShowLocationColumn] = useState(true);
  const [showCategoryColumn, setShowCategoryColumn] = useState(false);
  const [showTeamColumn, setShowTeamColumn] = useState(false);
  const [showLastModifiedColumn, setShowLastModifiedColumn] = useState(true);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [visibleCustomColumns, setVisibleCustomColumns] = useState(new Set());
  
  // Sorting state - default to lastModified ascending (earliest first)
  const [sortColumn, setSortColumn] = useState('lastModified');
  const [sortDirection, setSortDirection] = useState('asc');

  const quantities = computeMasterQuantities();

  // Get all available locations from inventoryData
  const availableLocations = useMemo(() => {
    return Array.from(inventoryData.keys()).sort();
  }, [inventoryData]);

  // Helper function to get item categories (convert IDs to names)
  const getItemCategories = useCallback((itemName) => {
    const itemData = masterInventoryItems.get(itemName);
    if (!itemData || !itemData.categories || itemData.categories.length === 0) {
      return [];
    }
    return itemData.categories
      .map(catId => categoryIdToName.get(catId))
      .filter(name => name !== undefined)
      .sort(); // Sort alphabetically for consistency
  }, [masterInventoryItems, categoryIdToName]);

  // Helper function to get item teams (capitalize first letter)
  const getItemTeams = useCallback((itemName) => {
    const itemData = masterInventoryItems.get(itemName);
    if (!itemData || !itemData.teams || itemData.teams.length === 0) {
      return [];
    }
    // Capitalize first letter of each team name
    return [...itemData.teams]
      .map(team => team.charAt(0).toUpperCase() + team.slice(1).toLowerCase())
      .sort(); // Sort alphabetically for consistency
  }, [masterInventoryItems]);

  // Sync with context filter location
  useEffect(() => {
    if (masterFilterLocation) {
      setFilterType('location');
      setSelectedLocations(new Set([masterFilterLocation]));
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
      filtered = filtered.filter(([name]) => name.toLowerCase().includes(query));
    }
    
    // Filter by location OR category (not both)
    if (filterType === 'location' && selectedLocations.size > 0) {
      filtered = filtered.filter(([itemName]) => {
        const itemLocations = getItemLocations(itemName);
        // Show item if it appears in at least one selected location
        return itemLocations.some(loc => selectedLocations.has(loc));
      });
    } else if (filterType === 'category' && selectedCategories.size > 0) {
      filtered = filtered.filter(([itemName, itemData]) => {
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
    }
    
    return filtered;
  }, [masterInventoryItems, searchQuery, filterType, selectedLocations, selectedCategories, getItemLocations, categoryIdToName]);

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
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    // Clear the other filter type when switching
    if (type === 'location') {
      setSelectedCategories(new Set());
    } else if (type === 'category') {
      setSelectedLocations(new Set());
    }
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

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    
    if (items.length === 0) return items;
    
    return items.sort(([nameA, itemDataA], [nameB, itemDataB]) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'name':
          comparison = nameA.localeCompare(nameB);
          break;
        case 'qty':
          const qtyA = quantities.get(nameA) || 0;
          const qtyB = quantities.get(nameB) || 0;
          comparison = qtyA - qtyB;
          break;
        case 'location':
          const locsA = getItemLocations(nameA);
          const locsB = getItemLocations(nameB);
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
          const catsA = getItemCategories(nameA);
          const catsB = getItemCategories(nameB);
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
          const teamsA = getItemTeams(nameA);
          const teamsB = getItemTeams(nameB);
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
    setShowAddModal(true);
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

  const handleShowAllColumns = () => {
    setShowQtyColumn(true);
    setShowLocationColumn(true);
    setShowCategoryColumn(true);
    setShowTeamColumn(true);
    setShowLastModifiedColumn(true);
    setVisibleCustomColumns(new Set(customFieldDefinitions.map(d => d.name)));
  };

  const handleHideAllColumns = () => {
    setShowQtyColumn(false);
    setShowLocationColumn(false);
    setShowCategoryColumn(false);
    setShowTeamColumn(false);
    setShowLastModifiedColumn(false);
    setVisibleCustomColumns(new Set());
  };

  // Count visible columns (excluding Name which is always visible)
  const visibleColumnCount = [
    showQtyColumn,
    showLocationColumn,
    showCategoryColumn,
    showTeamColumn,
    showLastModifiedColumn
  ].filter(Boolean).length + visibleCustomColumns.size;

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
                  background: (filterType === 'location' && selectedLocations.size > 0) || (filterType === 'category' && selectedCategories.size > 0) ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--stroke)',
                color: (filterType === 'location' && selectedLocations.size > 0) || (filterType === 'category' && selectedCategories.size > 0) ? 'white' : 'var(--text)',
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
              title="Filter by location"
              onMouseEnter={(e) => {
                if ((filterType === 'location' && selectedLocations.size === 0) || (filterType === 'category' && selectedCategories.size === 0)) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if ((filterType === 'location' && selectedLocations.size === 0) || (filterType === 'category' && selectedCategories.size === 0)) {
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
              {((filterType === 'location' && selectedLocations.size > 0) || (filterType === 'category' && selectedCategories.size > 0)) && (
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
                  {filterType === 'location' ? selectedLocations.size : selectedCategories.size}
                </span>
              )}
            </button>
            {((filterType === 'location' && selectedLocations.size > 0) || (filterType === 'category' && selectedCategories.size > 0)) && (
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
                ) : (
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
                )}
                
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
                    : (selectedCategories.size === 0
                        ? 'No categories selected - showing all items'
                        : `${selectedCategories.size} categor${selectedCategories.size === 1 ? 'y' : 'ies'} selected`)}
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
                  background: visibleColumnCount < (5 + customFieldDefinitions.length) ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--stroke)',
                  color: visibleColumnCount < (5 + customFieldDefinitions.length) ? 'white' : 'var(--text)',
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
                  if (visibleColumnCount === 5 + customFieldDefinitions.length) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (visibleColumnCount === 5 + customFieldDefinitions.length) {
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
                {visibleColumnCount < 5 + customFieldDefinitions.length && (
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
                    {5 + customFieldDefinitions.length - visibleColumnCount}
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
          </div>
        </div>
        <div className="master-table-content">
          {sortedItems.length === 0 ? (
            <div className="master-table-empty">
              {searchQuery || (filterType === 'location' && selectedLocations.size > 0) || (filterType === 'category' && selectedCategories.size > 0)
                ? 'No items found matching filters' 
                : 'No Master items. Click "+ Create Item" to create one.'}
            </div>
          ) : (
            <table className="master-table">
              <thead>
                <tr>
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
                {sortedItems.map(([itemName, itemData]) => (
                  <MasterTableRow
                    key={itemName}
                    itemName={itemName}
                    itemData={itemData}
                    quantity={quantities.get(itemName) || 0}
                    locations={getItemLocations(itemName)}
                    categories={getItemCategories(itemName)}
                    teams={getItemTeams(itemName)}
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
              </tbody>
            </table>
          )}
        </div>
        <div className="master-table-actions">
          <button className="add-item-button" onClick={handleAddItem}>
            + Create Item
          </button>
        </div>
      </div>
      <MasterCreateModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </>
  );
};

export default MasterInventoryTable;




