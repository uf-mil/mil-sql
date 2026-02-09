import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const AddModal = () => {
  const { currentAddingBox, currentAddingIndex, setCurrentAddingBox, setCurrentAddingIndex, inventoryData, updateInventory } = useInventory();
  
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const nameInputRef = useRef(null);

  // Check if this is a file cabinet
  const isFileCabinet = currentAddingBox && currentAddingBox.startsWith('File Cabinet');
  
  // Shelf definitions for file cabinets
  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  useEffect(() => {
    if (currentAddingBox) {
      setName('');
      setQty(1);
      setDescription('');
      // Set default shelf to first one if file cabinet
      if (isFileCabinet) {
        setSelectedShelf(0);
      } else {
        setSelectedShelf(null);
      }
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [currentAddingBox, isFileCabinet]);

  const handleSave = () => {
    if (currentAddingBox && name.trim()) {
      const boxData = inventoryData.get(currentAddingBox);
      if (boxData) {
        const newItem = {
          name: name.trim(),
          qty: parseInt(qty) || 1,
          description: description.trim(),
          image: null
        };
        
        // Tag item with shelf number if file cabinet
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
        <input
          ref={nameInputRef}
          type="text"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          placeholder="Quantity"
          value={qty}
          min="0"
          onChange={(e) => setQty(e.target.value)}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleSave}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddModal;

