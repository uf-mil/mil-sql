import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterTableRow from './MasterTableRow';
import MasterCreateModal from './MasterCreateModal';
import { getCategories } from '../api';

const MasterInventoryTable = () => {
  const {
    masterInventoryItems,
    computeMasterQuantities,
    getItemLocations,
    setSelectedMasterItem,
    selectedMasterItem,
    inventoryData
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

  const quantities = computeMasterQuantities();

  // Get all available locations from inventoryData
  const availableLocations = useMemo(() => {
    return Array.from(inventoryData.keys()).sort();
  }, [inventoryData]);

  // Fetch categories when filter menu opens and category filter is selected
  useEffect(() => {
    if (showFilterMenu && filterType === 'category' && availableCategories.length === 0) {
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
  }, [showFilterMenu, filterType, availableCategories.length]);

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

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
  }, [filteredItems]);

  const handleRowClick = (itemName) => {
    setSelectedMasterItem(itemName);
  };

  const handleAddItem = () => {
    setShowAddModal(true);
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', position: 'relative' }} ref={filterButtonRef}>
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
                  <th>Name</th>
                  <th className="qty-cell">Qty</th>
                  <th className="location-cell">Location</th>
                  <th className="modified-cell">Last Modified</th>
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




