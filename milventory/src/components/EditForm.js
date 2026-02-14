import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const EditModal = () => {
  const { currentEditingBox, currentEditingIndex, inventoryData, setCurrentEditingBox, setCurrentEditingIndex, setLastSelectedIndex, updateInventory, sotInventoryItems, resolveSOTItem } = useInventory();
  
  const boxData = currentEditingBox ? inventoryData.get(currentEditingBox) : null;
  const item = boxData && currentEditingIndex !== null ? boxData.inventory[currentEditingIndex] : null;
  const sotItem = item ? resolveSOTItem(item.name) : null;
  
  const [selectedItemName, setSelectedItemName] = useState('');
  const [qty, setQty] = useState(1);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (item) {
      setSelectedItemName(item.name || '');
      setQty(item.qty || 1);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    } else {
      setSelectedItemName('');
      setQty(1);
    }
  }, [item]);

  const handleSave = () => {
    if (currentEditingBox !== null && currentEditingIndex !== null && selectedItemName.trim()) {
      const boxData = inventoryData.get(currentEditingBox);
      if (boxData) {
        const newInventory = [...boxData.inventory];
        const existingItem = newInventory[currentEditingIndex];
        newInventory[currentEditingIndex] = {
          name: selectedItemName.trim(),
          qty: parseInt(qty) || 1,
          shelf: existingItem.shelf // Preserve shelf if it exists
        };
        updateInventory(currentEditingBox, newInventory);
        setCurrentEditingBox(null);
        setCurrentEditingIndex(null);
        setLastSelectedIndex(null);
      }
    }
  };

  const handleCancel = () => {
    setCurrentEditingBox(null);
    setCurrentEditingIndex(null);
    setLastSelectedIndex(null);
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

  const isVisible = currentEditingBox !== null && currentEditingIndex !== null;

  return (
    <div
      className={`modal-overlay ${isVisible ? 'visible' : ''}`}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Edit Item</h3>
        <select
          ref={nameInputRef}
          value={selectedItemName}
          onChange={(e) => setSelectedItemName(e.target.value)}
          className="modal-select"
        >
          <option value="">Select SOT item...</option>
          {Array.from(sotInventoryItems.keys()).map(itemName => (
            <option key={itemName} value={itemName}>
              {itemName}
            </option>
          ))}
        </select>
        {sotItem && (
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
            {sotItem.description && <div>{sotItem.description}</div>}
            {sotItem.image && (
              <div className="edit-form-image-container" style={{ marginTop: '0.5rem' }}>
                <img src={sotItem.image} alt={sotItem.name} />
              </div>
            )}
          </div>
        )}
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;

