import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import SOTTableRow from './SOTTableRow';
import SOTAddModal from './SOTAddModal';

const SOTInventoryTable = () => {
  const {
    sotInventoryItems,
    computeSOTQuantities,
    getItemLocations,
    setSelectedSOTItem,
    selectedSOTItem
  } = useInventory();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const quantities = computeSOTQuantities();

  const filteredItems = useMemo(() => {
    const itemsArray = Array.from(sotInventoryItems.entries());
    if (!searchQuery.trim()) {
      return itemsArray;
    }
    const query = searchQuery.toLowerCase();
    return itemsArray.filter(([name]) => name.toLowerCase().includes(query));
  }, [sotInventoryItems, searchQuery]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
  }, [filteredItems]);

  const handleRowClick = (itemName) => {
    setSelectedSOTItem(itemName);
  };

  const handleAddItem = () => {
    setShowAddModal(true);
  };

  return (
    <>
      <div className="sot-inventory-table">
        <div className="sot-table-header">
          <h2>SOT Inventory</h2>
        </div>
        <div className="sot-table-search">
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sot-search-input"
          />
        </div>
        <div className="sot-table-content">
          {sortedItems.length === 0 ? (
            <div className="sot-table-empty">
              {searchQuery ? 'No items found' : 'No SOT items. Click "+ Add Item" to create one.'}
            </div>
          ) : (
            <table className="sot-table">
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
                  <SOTTableRow
                    key={itemName}
                    itemName={itemName}
                    itemData={itemData}
                    quantity={quantities.get(itemName) || 0}
                    locations={getItemLocations(itemName)}
                    isSelected={selectedSOTItem === itemName}
                    onClick={() => handleRowClick(itemName)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="sot-table-actions">
          <button className="add-item-button" onClick={handleAddItem}>
            + Add Item
          </button>
        </div>
      </div>
      <SOTAddModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </>
  );
};

export default SOTInventoryTable;




