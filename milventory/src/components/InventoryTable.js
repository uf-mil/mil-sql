import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { escapeHtml } from '../utils';

const InventoryTable = () => {
  const { selectedBox, inventoryData, lastSelectedIndex, setCurrentEditingBox, setCurrentEditingIndex, setLastSelectedIndex, setCurrentAddingBox, setCurrentAddingIndex, updateInventory, handleDragStart } = useInventory();
  
  const boxData = selectedBox ? inventoryData.get(selectedBox) : null;
  const inventory = boxData ? boxData.inventory : [];
  const boxTitle = selectedBox;
  
  // Check if this is a file cabinet
  const isFileCabinet = boxTitle && boxTitle.startsWith('File Cabinet');

  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [draggedRow, setDraggedRow] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draggedShelf, setDraggedShelf] = useState(null);
  const isInternalUpdateRef = useRef(false);
  
  // Split inventory into 3 shelves for file cabinets
  const shelves = useMemo(() => {
    if (!isFileCabinet || !inventory.length) {
      return null;
    }
    
    const totalItems = inventory.length;
    const itemsPerShelf = Math.ceil(totalItems / 3);
    
    return [
      {
        name: 'Top Shelf',
        items: inventory.slice(0, itemsPerShelf),
        startIndex: 0
      },
      {
        name: 'Middle Shelf',
        items: inventory.slice(itemsPerShelf, itemsPerShelf * 2),
        startIndex: itemsPerShelf
      },
      {
        name: 'Bottom Shelf',
        items: inventory.slice(itemsPerShelf * 2),
        startIndex: itemsPerShelf * 2
      }
    ];
  }, [inventory, isFileCabinet]);
  
  // Helper to get global index from shelf and shelf-local index
  const getGlobalIndex = (shelfIndex, shelfLocalIndex) => {
    if (!shelves) return shelfLocalIndex;
    return shelves[shelfIndex].startIndex + shelfLocalIndex;
  };
  
  // Helper to get shelf info from global index
  const getShelfInfo = (globalIndex) => {
    if (!shelves) return { shelfIndex: 0, shelfLocalIndex: globalIndex };
    
    for (let i = 0; i < shelves.length; i++) {
      const shelf = shelves[i];
      if (globalIndex >= shelf.startIndex && globalIndex < shelf.startIndex + shelf.items.length) {
        return {
          shelfIndex: i,
          shelfLocalIndex: globalIndex - shelf.startIndex
        };
      }
    }
    return { shelfIndex: 0, shelfLocalIndex: 0 };
  };

  useEffect(() => {
    // Only sync selectedIndices when lastSelectedIndex is cleared (null)
    // handleNameClick manages selectedIndices for all other cases
    if (lastSelectedIndex === null && !isInternalUpdateRef.current) {
      setSelectedIndices(new Set());
    }
    isInternalUpdateRef.current = false;
  }, [lastSelectedIndex]);

  const handleNameClick = (e, index, shelfIndex = null) => {
    e.stopPropagation();
    
    // Convert shelf-local index to global index if needed
    const globalIndex = shelfIndex !== null ? getGlobalIndex(shelfIndex, index) : index;
    
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, globalIndex);
      const end = Math.max(lastSelectedIndex, globalIndex);
      const newSelected = new Set();
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
      isInternalUpdateRef.current = true;
      setSelectedIndices(newSelected);
      setLastSelectedIndex(globalIndex);
      setCurrentEditingBox(boxTitle);
      setCurrentEditingIndex(globalIndex);
    } else {
      isInternalUpdateRef.current = true;
      setSelectedIndices(new Set([globalIndex]));
      setCurrentEditingBox(boxTitle);
      setCurrentEditingIndex(globalIndex);
      setLastSelectedIndex(globalIndex);
    }
  };

  const handleDragStartRow = (e, index, shelfIndex = null) => {
    if (e.target.closest('.name-cell')) {
      e.preventDefault();
      return;
    }

    // Convert shelf-local index to global index if needed
    const globalIndex = shelfIndex !== null ? getGlobalIndex(shelfIndex, index) : index;
    const isMultiple = selectedIndices.size > 1 && selectedIndices.has(globalIndex);
    
    if (isMultiple) {
      const indices = Array.from(selectedIndices).sort((a, b) => a - b);
      handleDragStart(boxTitle, globalIndex, true, indices);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(globalIndex);
      setDraggedShelf(shelfIndex);
      e.currentTarget.classList.add('dragging');
      selectedIndices.forEach(idx => {
        const row = document.querySelector(`tr[data-index="${idx}"]`);
        if (row) row.classList.add('dragging');
      });
    } else {
      handleDragStart(boxTitle, globalIndex, false, []);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(globalIndex);
      setDraggedShelf(shelfIndex);
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
    setDraggedShelf(null);
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

  const handleDropRow = (e, dropShelfIndex = null, dropShelfLocalIndex = null) => {
    e.preventDefault();
    if (draggedRow !== e.currentTarget && draggedIndex !== null) {
      const items = [...inventory];
      const draggedItem = items[draggedIndex];
      
      // Calculate drop index
      let dropIndex;
      if (dropShelfIndex !== null && dropShelfLocalIndex !== null) {
        // Dropping in a shelf table
        dropIndex = getGlobalIndex(dropShelfIndex, dropShelfLocalIndex);
      } else {
        // Dropping in regular table
        const allRows = Array.from(e.currentTarget.parentElement.children);
        dropIndex = allRows.indexOf(e.currentTarget);
      }
      
      // Remove dragged item first
      items.splice(draggedIndex, 1);
      
      // Adjust drop index if dragging from before the drop position
      if (draggedIndex < dropIndex) {
        dropIndex--;
      }
      
      // Insert at new position
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

  // Handle adding item to a specific shelf
  const handleAddToShelf = (shelfIndex) => {
    if (!shelves) return;
    const shelf = shelves[shelfIndex];
    // Set the target index to the end of this shelf
    const targetIndex = shelf.startIndex + shelf.items.length;
    setCurrentAddingBox(boxTitle);
    setCurrentAddingIndex(targetIndex);
  };

  // Render a single shelf table
  const renderShelfTable = (shelf, shelfIndex) => {
    return (
      <div key={shelfIndex} className="shelf-section">
        <div className="shelf-header">{shelf.name}</div>
        <table className="inventory-table shelf-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="qty-cell">Qty</th>
            </tr>
          </thead>
          <tbody>
            {shelf.items.map((item, shelfLocalIndex) => {
              const globalIndex = getGlobalIndex(shelfIndex, shelfLocalIndex);
              return (
                <tr
                  key={shelfLocalIndex}
                  data-index={globalIndex}
                  draggable="true"
                  className={`${selectedIndices.has(globalIndex) ? 'selected' : ''}`}
                  onDragStart={(e) => handleDragStartRow(e, shelfLocalIndex, shelfIndex)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    const allRows = Array.from(e.currentTarget.parentElement.children);
                    const dropShelfLocalIndex = allRows.indexOf(e.currentTarget);
                    handleDropRow(e, shelfIndex, dropShelfLocalIndex);
                  }}
                >
                  <td className="name-cell" onClick={(e) => handleNameClick(e, shelfLocalIndex, shelfIndex)}>
                    <span>{escapeHtml(item.name)}</span>
                  </td>
                  <td className="qty-cell readonly">{escapeHtml(String(item.qty))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button 
          className="add-item-button shelf-add-button" 
          onClick={() => handleAddToShelf(shelfIndex)}
        >
          Add Item
        </button>
      </div>
    );
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

  // Render file cabinet with 3 shelves
  if (isFileCabinet && shelves) {
    return (
      <>
        {shelves.map((shelf, shelfIndex) => renderShelfTable(shelf, shelfIndex))}
      </>
    );
  }

  // Render regular single table for non-file cabinets
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

