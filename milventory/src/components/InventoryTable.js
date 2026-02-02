import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { escapeHtml } from '../utils';

const InventoryTable = () => {
  const { selectedBox, inventoryData, lastSelectedIndex, setCurrentEditingBox, setCurrentEditingIndex, setLastSelectedIndex, setCurrentAddingBox, updateInventory, handleDragStart } = useInventory();
  
  const boxData = selectedBox ? inventoryData.get(selectedBox) : null;
  const inventory = boxData ? boxData.inventory : [];
  const boxTitle = selectedBox;

  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [draggedRow, setDraggedRow] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const isInternalUpdateRef = useRef(false);

  useEffect(() => {
    // Only sync selectedIndices when lastSelectedIndex is cleared (null)
    // handleNameClick manages selectedIndices for all other cases
    if (lastSelectedIndex === null && !isInternalUpdateRef.current) {
      setSelectedIndices(new Set());
    }
    isInternalUpdateRef.current = false;
  }, [lastSelectedIndex]);

  const handleNameClick = (e, index) => {
    e.stopPropagation();
    
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelected = new Set();
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
      isInternalUpdateRef.current = true;
      setSelectedIndices(newSelected);
      setLastSelectedIndex(index);
      setCurrentEditingBox(boxTitle);
      setCurrentEditingIndex(index);
    } else {
      isInternalUpdateRef.current = true;
      setSelectedIndices(new Set([index]));
      setCurrentEditingBox(boxTitle);
      setCurrentEditingIndex(index);
      setLastSelectedIndex(index);
    }
  };

  const handleDragStartRow = (e, index) => {
    if (e.target.closest('.name-cell')) {
      e.preventDefault();
      return;
    }

    const isMultiple = selectedIndices.size > 1 && selectedIndices.has(index);
    
    if (isMultiple) {
      const indices = Array.from(selectedIndices).sort((a, b) => a - b);
      handleDragStart(boxTitle, index, true, indices);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(index);
      e.currentTarget.classList.add('dragging');
      selectedIndices.forEach(idx => {
        const row = document.querySelector(`tr[data-index="${idx}"]`);
        if (row) row.classList.add('dragging');
      });
    } else {
      handleDragStart(boxTitle, index, false, []);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(index);
      e.currentTarget.classList.add('dragging');
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
  };

  const handleDragEnd = (e) => {
    document.querySelectorAll('tr').forEach(r => {
      r.classList.remove('dragging');
      r.classList.remove('drag-over');
    });
    setDraggedRow(null);
    setDraggedIndex(null);
    // Note: draggedItemData is cleared in context when drop happens
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const afterElement = getDragAfterElement(e.currentTarget.parentElement, e.clientY);
    e.currentTarget.parentElement.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
    if (afterElement == null || afterElement === e.currentTarget) {
      e.currentTarget.classList.add('drag-over');
    }
  };

  const handleDropRow = (e) => {
    e.preventDefault();
    if (draggedRow !== e.currentTarget && draggedIndex !== null) {
      const items = [...inventory];
      const draggedItem = items[draggedIndex];
      items.splice(draggedIndex, 1);
      
      const allRows = Array.from(e.currentTarget.parentElement.children);
      let dropIndex = allRows.indexOf(e.currentTarget);
      
      if (draggedIndex < dropIndex) {
        dropIndex--;
      }
      
      items.splice(dropIndex, 0, draggedItem);
      updateInventory(boxTitle, items);
    }
  };

  const getDragAfterElement = (container, y) => {
    const draggableElements = [...container.querySelectorAll('tr:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  };

  if (!inventory || inventory.length === 0) {
    return (
      <>
        <div className="inventory-list empty">No inventory listed.</div>
        <button className="add-item-button" onClick={() => setCurrentAddingBox(boxTitle)}>
          Add Item
        </button>
      </>
    );
  }

  return (
    <>
      <table className="inventory-table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="qty-cell">Qty</th>
          </tr>
        </thead>
        <tbody>
          {inventory.map((item, index) => (
            <tr
              key={index}
              data-index={index}
              draggable="true"
              className={`${selectedIndices.has(index) ? 'selected' : ''}`}
              onDragStart={(e) => handleDragStartRow(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDropRow}
            >
              <td className="name-cell" onClick={(e) => handleNameClick(e, index)}>
                <span>{escapeHtml(item.name)}</span>
              </td>
              <td className="qty-cell readonly">{escapeHtml(String(item.qty))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inventory-separator"></div>
      <button className="add-item-button" onClick={() => setCurrentAddingBox(boxTitle)}>
        Add Item
      </button>
    </>
  );
};

export default InventoryTable;

