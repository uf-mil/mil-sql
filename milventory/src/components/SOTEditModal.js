import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const SOTEditModal = ({ isOpen, onClose, itemName }) => {
  const { updateSOTItem, resolveSOTItem, sotInventoryItems } = useInventory();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null); // base64 data URI or null
  const [imagePreview, setImagePreview] = useState(null);
  const nameInputRef = useRef(null);

  const originalItem = itemName ? resolveSOTItem(itemName) : null;

  useEffect(() => {
    if (isOpen && originalItem) {
      setName(originalItem.name || '');
      setDescription(originalItem.description || '');
      setImage(originalItem.image || null);
      setImagePreview(originalItem.image || null);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [isOpen, originalItem]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      // Keep existing image if no new file selected
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image file size must be less than 10MB');
      e.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      e.target.value = '';
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      setImage(base64Data);
      setImagePreview(base64Data);
    };
    reader.onerror = () => {
      alert('Error reading image file');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
  };

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
        image: image || null, // base64 data URI or null
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
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Image (optional, max 10MB)
          </label>
          {imagePreview && (
            <div style={{ marginBottom: '0.5rem' }}>
              <img
                src={imagePreview}
                alt="Current"
                style={{
                  maxWidth: '200px',
                  maxHeight: '200px',
                  borderRadius: '4px',
                  border: '1px solid var(--stroke)',
                  marginBottom: '0.5rem',
                }}
              />
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ marginBottom: '0.5rem' }}
          />
          {imagePreview && (
            <button
              type="button"
              onClick={handleRemoveImage}
              style={{
                background: 'var(--files)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Remove Image
            </button>
          )}
        </div>
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

