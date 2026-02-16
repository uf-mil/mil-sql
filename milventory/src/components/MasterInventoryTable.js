import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import MasterTableRow from './MasterTableRow';
import MasterAddModal from './MasterAddModal';

const MasterInventoryTable = () => {
  const {
    masterInventoryItems,
    computeMasterQuantities,
    getItemLocations,
    setSelectedMasterItem,
    selectedMasterItem
  } = useInventory();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const quantities = computeMasterQuantities();

  const filteredItems = useMemo(() => {
    const itemsArray = Array.from(masterInventoryItems.entries());
    if (!searchQuery.trim()) {
      return itemsArray;
    }
    const query = searchQuery.toLowerCase();
    return itemsArray.filter(([name]) => name.toLowerCase().includes(query));
  }, [masterInventoryItems, searchQuery]);

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
        </div>
        <div className="master-table-content">
          {sortedItems.length === 0 ? (
            <div className="master-table-empty">
              {searchQuery ? 'No items found' : 'No Master items. Click "+ Add Item" to create one.'}
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
            + Add Item
          </button>
        </div>
      </div>
      <MasterAddModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </>
  );
};

export default MasterInventoryTable;




