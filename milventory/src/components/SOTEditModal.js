import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const SOTEditModal = ({ isOpen, onClose, itemName }) => {
  const { updateSOTItem, resolveSOTItem, sotInventoryItems } = useInventory();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const nameInputRef = useRef(null);

  const originalItem = itemName ? resolveSOTItem(itemName) : null;

  useEffect(() => {
    if (isOpen && originalItem) {
      setName(originalItem.name || '');
      setDescription(originalItem.description || '');
      setImage(originalItem.image || '');
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [isOpen, originalItem]);

  const handleSave = () => {
    if (name.trim() && itemName) {
      // Check if name changed and new name already exists
      if (name.trim() !== itemName && sotInventoryItems.has(name.trim())) {
        alert('An item with this name already exists. Please use a different name.');
        return;
      }

      const updatedItem = {
        name: name.trim(),
        description: description.trim() || null,
        image: image.trim() || null,
        locations: originalItem?.locations || [] // Preserve locations
      };
      
      updateSOTItem(itemName, updatedItem);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!isOpen || !originalItem) return null;

  return (
    <div
      className="modal-overlay visible"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Edit SOT Item</h3>
        <input
          ref={nameInputRef}
          type="text"
          placeholder="Item name (required, must be unique)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows="3"
        />
        <input
          type="text"
          placeholder="Image URL (optional)"
          value={image}
          onChange={(e) => setImage(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleSave} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SOTEditModal;

