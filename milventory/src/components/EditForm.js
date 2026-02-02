import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';

const EditForm = () => {
  const { currentEditingBox, currentEditingIndex, inventoryData, setCurrentEditingBox, setCurrentEditingIndex, setLastSelectedIndex, updateInventory, editFormHeight, setEditFormHeight } = useInventory();
  
  const boxData = currentEditingBox ? inventoryData.get(currentEditingBox) : null;
  const item = boxData && currentEditingIndex !== null ? boxData.inventory[currentEditingIndex] : null;
  
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [isResizingEditForm, setIsResizingEditForm] = useState(false);
  const nameInputRef = useRef(null);
  const editFormResizeRef = useRef(null);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setQty(item.qty || 1);
      setDescription(item.description || '');
      setImage(item.image || null);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    } else {
      setName('');
      setQty(1);
      setDescription('');
      setImage(null);
    }
  }, [item]);

  const handleSave = () => {
    if (currentEditingBox !== null && currentEditingIndex !== null && name.trim()) {
      const boxData = inventoryData.get(currentEditingBox);
      if (boxData) {
        const newInventory = [...boxData.inventory];
        newInventory[currentEditingIndex] = {
          ...newInventory[currentEditingIndex],
          name: name.trim(),
          qty: parseInt(qty) || 1,
          description: description.trim(),
          image: image
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
    setImage(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.target === nameInputRef.current) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleResizeStart = (e) => {
    setIsResizingEditForm(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingEditForm && editFormResizeRef.current) {
        const startY = editFormResizeRef.current.getBoundingClientRect().top;
        const diff = startY - e.clientY;
        const newHeight = Math.max(250, Math.min(800, editFormHeight + diff));
        setEditFormHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingEditForm(false);
    };

    if (isResizingEditForm) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingEditForm, editFormHeight, setEditFormHeight]);

  const isVisible = currentEditingBox !== null && currentEditingIndex !== null;

  return (
    <div className={`edit-form ${isVisible ? 'visible' : ''}`} onKeyDown={handleKeyDown}>
      <div className="edit-form-resize-wrapper">
        <div
          ref={editFormResizeRef}
          className={`edit-form-resize ${isResizingEditForm ? 'dragging' : ''}`}
          onMouseDown={handleResizeStart}
        />
      </div>
      {!isVisible ? (
        <div className="edit-form-placeholder">Select Item to Edit It</div>
      ) : (
        <div className="edit-form-content">
          <h3>Edit Item</h3>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="edit-form-image-container">
            {image ? (
              <img src={image} alt="Item image" />
            ) : (
              <div className="edit-form-image-placeholder">No image</div>
            )}
          </div>
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
          <div className="edit-form-actions">
            <button type="button" className="cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className="save" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditForm;

