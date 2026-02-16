import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const MasterAddModal = ({ isOpen, onClose }) => {
  const { addMasterItem, masterInventoryItems } = useInventory();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null); // base64 data URI or null
  const [imagePreview, setImagePreview] = useState(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setImage(null);
      setImagePreview(null);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setImage(null);
      setImagePreview(null);
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
      const base64Data = event.target.result; // Full data URI
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
    if (name.trim()) {
      // Check if name already exists
      if (masterInventoryItems.has(name.trim())) {
        alert('An item with this name already exists. Please use a different name.');
        return;
      }

      const newItem = {
        name: name.trim(),
        description: description.trim() || null,
        image: image || null, // base64 data URI or null
        locations: [] // Optional metadata, will be computed dynamically
      };
      
      addMasterItem(newItem);
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

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay visible"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Add Master Item</h3>
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
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ marginBottom: '0.5rem' }}
          />
          {imagePreview && (
            <div style={{ marginTop: '0.5rem', position: 'relative', display: 'inline-block' }}>
              <img
                src={imagePreview}
                alt="Preview"
                style={{
                  maxWidth: '200px',
                  maxHeight: '200px',
                  borderRadius: '4px',
                  border: '1px solid var(--stroke)',
                }}
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'var(--files)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleSave} disabled={!name.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterAddModal;

