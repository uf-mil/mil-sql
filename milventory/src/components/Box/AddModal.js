import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import {
  hasShelves,
  getShelfCount,
  getShelfLabel,
  getShelfIndicesTopToBottom
} from '../../utils/shelfLabels';

const AddModal = () => {
  const { currentAddingBox, currentAddingIndex, setCurrentAddingBox, setCurrentAddingIndex, inventoryData, updateInventory, masterInventoryItems } = useInventory();

  const [selectedSupplyPublicId, setSelectedSupplyPublicId] = useState('');
  const [qty, setQty] = useState(1);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const nameInputRef = useRef(null);

  const currentBox = currentAddingBox ? inventoryData.get(currentAddingBox) : null;
  const isShelved = hasShelves(currentBox);
  const shelfOptions = useMemo(() => {
    const shelfCount = getShelfCount(currentBox);
    return getShelfIndicesTopToBottom(shelfCount).map((shelfIdx) => ({
      value: shelfIdx,
      label: getShelfLabel(shelfIdx, shelfCount)
    }));
  }, [currentBox]);

  const masterRows = useMemo(
    () =>
      Array.from(masterInventoryItems.entries()).map(([pid, data]) => ({
        pid,
        data,
        label:
          data.type_name != null && String(data.type_name).length > 0
            ? `${data.name} (${data.type_name})`
            : `${data.name} (#${data.id})`
      })),
    [masterInventoryItems]
  );

  const filteredMasterItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return masterRows;
    }
    const query = searchQuery.toLowerCase();
    return masterRows.filter(
      (r) =>
        r.data.name.toLowerCase().includes(query) ||
        (r.data.type_name || '').toLowerCase().includes(query)
    );
  }, [masterRows, searchQuery]);

  useEffect(() => {
    if (currentAddingBox) {
      setSelectedSupplyPublicId('');
      setQty(1);
      setSearchQuery('');
      if (isShelved) {
        const shelfCount = getShelfCount(currentBox);
        setSelectedShelf(Math.max(0, shelfCount - 1));
      } else {
        setSelectedShelf(null);
      }
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [currentAddingBox, isShelved, currentBox]);

  const handleSave = () => {
    if (currentAddingBox && selectedSupplyPublicId) {
      const row = masterInventoryItems.get(selectedSupplyPublicId);
      if (!row) return;

      const boxData = inventoryData.get(currentAddingBox);
      if (boxData) {
        const newItem = {
          name: row.name,
          supplyId: row.id,
          supplyPublicId: row.public_id || selectedSupplyPublicId,
          qty: parseInt(qty, 10) || 1
        };

        if (isShelved && selectedShelf !== null) {
          newItem.shelf = selectedShelf;
        }

        const newInventory = [...boxData.inventory];

        if (isShelved && selectedShelf !== null) {
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
        {isShelved && (
          <select
            value={selectedShelf !== null ? selectedShelf : (shelfOptions[0]?.value ?? 0)}
            onChange={(e) => setSelectedShelf(parseInt(e.target.value, 10))}
            className="styled-select"
          >
            {shelfOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
        <div>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Search Master items..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value && filteredMasterItems.length > 0 && !selectedSupplyPublicId) {
                setSelectedSupplyPublicId(filteredMasterItems[0].pid);
              }
            }}
            list="master-items-list"
          />
          <datalist id="master-items-list">
            {filteredMasterItems.map((r) => (
              <option key={r.pid} value={r.label} />
            ))}
          </datalist>
          {filteredMasterItems.length === 0 && searchQuery && (
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              No items found. Create item in Master table first.
            </div>
          )}
        </div>
        <select
          value={selectedSupplyPublicId}
          onChange={(e) => setSelectedSupplyPublicId(e.target.value)}
          className="styled-select"
        >
          <option value="">Select Master item...</option>
          {filteredMasterItems.map((r) => (
            <option key={r.pid} value={r.pid}>
              {r.label}
            </option>
          ))}
        </select>
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
          <button type="button" className="save" onClick={handleSave} disabled={!selectedSupplyPublicId}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddModal;
