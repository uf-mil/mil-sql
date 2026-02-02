import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const AddModal = () => {
  const { currentAddingBox, setCurrentAddingBox, inventoryData, updateInventory } = useInventory();
  
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (currentAddingBox) {
      setName('');
      setQty(1);
      setDescription('');
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [currentAddingBox]);

  const handleSave = () => {
    if (currentAddingBox && name.trim()) {
      const boxData = inventoryData.get(currentAddingBox);
      if (boxData) {
        const newInventory = [...boxData.inventory, {
          name: name.trim(),
          qty: parseInt(qty) || 1,
          description: description.trim(),
          image: null
        }];
        updateInventory(currentAddingBox, newInventory);
        setCurrentAddingBox(null);
      }
    }
  };

  const handleCancel = () => {
    setCurrentAddingBox(null);
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

