import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { escapeHtml } from '../utils';

const InventoryTable = () => {
  const { selectedBox, inventoryData, lastSelectedIndex, setCurrentEditingBox, setCurrentEditingIndex, setLastSelectedIndex, setCurrentAddingBox, setCurrentAddingIndex, updateInventory, handleDragStart } = useInventory();
  
  const boxData = selectedBox ? inventoryData.get(selectedBox) : null;
  const inventory = boxData ? boxData.inventory : [];
  const boxTitle = selectedBox;
  
  // Check if this is a Tall Cabinet
  const isFileCabinet = boxTitle && boxTitle.startsWith('Tall Cabinet');

  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [draggedRow, setDraggedRow] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const isInternalUpdateRef = useRef(false);
  
  // Shelf names for file cabinets
  const SHELF_NAMES = [
    'Shelf 6 (Top)',
    'Shelf 5',
    'Shelf 4',
    'Shelf 3',
    'Shelf 2',
    'Shelf 1 (Bottom)'
  ];

  // Group inventory items by their shelf tag for file cabinets
  const shelves = useMemo(() => {
    if (!isFileCabinet) {
      return null;
    }
    
    return SHELF_NAMES.map((name, shelfNum) => {
      // Collect items that belong to this shelf, tracking their original array index
      const items = [];
      inventory.forEach((item, arrayIndex) => {
        if ((item.shelf ?? 0) === shelfNum) {
          items.push({ ...item, _globalIndex: arrayIndex });
        }
      });
      return { name, shelfNum, items };
    });
  }, [inventory, isFileCabinet]);

  useEffect(() => {
    // Only sync selectedIndices when lastSelectedIndex is cleared (null)
    // handleNameClick manages selectedIndices for all other cases
    if (lastSelectedIndex === null && !isInternalUpdateRef.current) {
      setSelectedIndices(new Set());
    }
    isInternalUpdateRef.current = false;
  }, [lastSelectedIndex]);

  const handleNameClick = (e, globalIndex) => {
    e.stopPropagation();
    
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

  const handleDragStartRow = (e, globalIndex) => {
    if (e.target.closest('.name-cell')) {
      e.preventDefault();
      return;
    }

    const isMultiple = selectedIndices.size > 1 && selectedIndices.has(globalIndex);
    
    if (isMultiple) {
      const indices = Array.from(selectedIndices).sort((a, b) => a - b);
      handleDragStart(boxTitle, globalIndex, true, indices);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(globalIndex);
      e.currentTarget.classList.add('dragging');
      selectedIndices.forEach(idx => {
        const row = document.querySelector(`tr[data-index="${idx}"]`);
        if (row) row.classList.add('dragging');
      });
    } else {
      handleDragStart(boxTitle, globalIndex, false, []);
      setDraggedRow(e.currentTarget);
      setDraggedIndex(globalIndex);
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
    if (draggedIndex === null) return;
    
    const targetGlobalIndex = parseInt(e.currentTarget.dataset.index);
    const targetShelfNum = parseInt(e.currentTarget.dataset.shelf);
    
    const items = [...inventory];
    const draggedItem = items[draggedIndex];
    
    // Dropping on an empty shelf placeholder
    if (!isNaN(targetShelfNum) && isNaN(targetGlobalIndex)) {
      draggedItem.shelf = targetShelfNum;
      items.splice(draggedIndex, 1);
      items.push(draggedItem);
      updateInventory(boxTitle, items);
      return;
    }
    
    if (isNaN(targetGlobalIndex)) return; // header row
    if (draggedRow === e.currentTarget) return;
    
    // If Tall Cabinet, adopt the drop target's shelf tag
    if (isFileCabinet) {
      draggedItem.shelf = items[targetGlobalIndex].shelf ?? 0;
    }
    
    let dropIndex = targetGlobalIndex;
    items.splice(draggedIndex, 1);
    if (draggedIndex < dropIndex) dropIndex--;
    items.splice(dropIndex, 0, draggedItem);
    updateInventory(boxTitle, items);
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

  // Render combined table with shelf sections
  const renderCombinedShelfTable = () => {
    if (!shelves) return null;
    
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
            {shelves.map((shelf) => (
              <React.Fragment key={`shelf-${shelf.shelfNum}`}>
                <tr className="shelf-header-row">
                  <td colSpan="2" className="shelf-header-cell">
                    {shelf.name}
                  </td>
                </tr>
                {shelf.items.length === 0 && (
                  <tr
                    className="shelf-empty-row"
                    data-shelf={shelf.shelfNum}
                    onDragOver={handleDragOver}
                    onDrop={handleDropRow}
                  >
                    <td colSpan="2" className="shelf-empty-cell">Empty</td>
                  </tr>
                )}
                {shelf.items.map((item) => (
                  <tr
                    key={item._globalIndex}
                    data-index={item._globalIndex}
                    draggable="true"
                    className={`${selectedIndices.has(item._globalIndex) ? 'selected' : ''}`}
                    onDragStart={(e) => handleDragStartRow(e, item._globalIndex)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDropRow}
                  >
                    <td className="name-cell" onClick={(e) => handleNameClick(e, item._globalIndex)}>
                      <span>{escapeHtml(item.name)}</span>
                    </td>
                    <td className="qty-cell readonly">{escapeHtml(String(item.qty))}</td>
                  </tr>
                ))}
              </React.Fragment>
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

  // Render Tall Cabinet with combined table (even if empty, show all shelves)
  if (isFileCabinet && shelves) {
    return renderCombinedShelfTable();
  }

  // Render regular single table for non-file cabinets (always show table, even if empty)
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
          {(!inventory || inventory.length === 0) ? (
            <tr>
              <td colSpan="2" className="inventory-empty-cell">Empty</td>
            </tr>
          ) : (
            inventory.map((item, index) => (
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
            ))
          )}
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

