import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';

const AddModal = () => {
  const { currentAddingBox, currentAddingIndex, setCurrentAddingBox, setCurrentAddingIndex, inventoryData, updateInventory, sotInventoryItems } = useInventory();
  
  const [selectedItemName, setSelectedItemName] = useState('');
  const [qty, setQty] = useState(1);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const nameInputRef = useRef(null);

  // Check if this is a Tall Cabinet
  const isFileCabinet = currentAddingBox && currentAddingBox.startsWith('Tall Cabinet');
  
  // Shelf definitions for file cabinets
  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  const filteredSOTItems = useMemo(() => {
    const itemsArray = Array.from(sotInventoryItems.keys());
    if (!searchQuery.trim()) {
      return itemsArray;
    }
    const query = searchQuery.toLowerCase();
    return itemsArray.filter(name => name.toLowerCase().includes(query));
  }, [sotInventoryItems, searchQuery]);

  useEffect(() => {
    if (currentAddingBox) {
      setSelectedItemName('');
      setQty(1);
      setSearchQuery('');
      // Set default shelf to first one if Tall Cabinet
      if (isFileCabinet) {
        setSelectedShelf(0);
      } else {
        setSelectedShelf(null);
      }
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [currentAddingBox, isFileCabinet]);

  const handleSave = () => {
    if (currentAddingBox && selectedItemName.trim()) {
      const boxData = inventoryData.get(currentAddingBox);
      if (boxData) {
        const newItem = {
          name: selectedItemName.trim(),
          qty: parseInt(qty) || 1
        };
        
        // Tag item with shelf number if Tall Cabinet
        if (isFileCabinet && selectedShelf !== null) {
          newItem.shelf = selectedShelf;
        }
        
        const newInventory = [...boxData.inventory];
        
        // For file cabinets, insert after the last item in the same shelf
        if (isFileCabinet && selectedShelf !== null) {
          let lastIndexInShelf = -1;
          for (let i = newInventory.length - 1; i >= 0; i--) {
            if ((newInventory[i].shelf ?? 0) === selectedShelf) {
              lastIndexInShelf = i;
              break;
            }
          }
          newInventory.splice(lastIndexInShelf + 1, 0, newItem);
        } else if (currentAddingIndex !== null) {
          newInventory.splice(currentAddingIndex, 0, newItem);
        } else {
          newInventory.push(newItem);
        }
        
        updateInventory(currentAddingBox, newInventory);
        setCurrentAddingBox(null);
        setCurrentAddingIndex(null);
        setSelectedShelf(null);
      }
    }
  };

  const handleCancel = () => {
    setCurrentAddingBox(null);
    setCurrentAddingIndex(null);
    setSelectedShelf(null);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.target === nameInputRef.current) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      className={`modal-overlay ${currentAddingBox ? 'visible' : ''}`}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Add Item</h3>
        {isFileCabinet && (
          <select
            value={selectedShelf !== null ? selectedShelf : 0}
            onChange={(e) => setSelectedShelf(parseInt(e.target.value))}
            className="modal-select"
          >
            {SHELF_NAMES.map((name, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>
        )}
        <div>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Search SOT items..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value && filteredSOTItems.length > 0 && !selectedItemName) {
                setSelectedItemName(filteredSOTItems[0]);
              }
            }}
            list="sot-items-list"
          />
          <datalist id="sot-items-list">
            {filteredSOTItems.map(itemName => (
              <option key={itemName} value={itemName} />
            ))}
          </datalist>
          {filteredSOTItems.length === 0 && searchQuery && (
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              No items found. Create item in SOT table first.
            </div>
          )}
        </div>
        <select
          value={selectedItemName}
          onChange={(e) => setSelectedItemName(e.target.value)}
          className="modal-select"
        >
          <option value="">Select SOT item...</option>
          {filteredSOTItems.map(itemName => (
            <option key={itemName} value={itemName}>
              {itemName}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Quantity"
          value={qty}
          min="1"
          onChange={(e) => setQty(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleSave} disabled={!selectedItemName}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddModal;

