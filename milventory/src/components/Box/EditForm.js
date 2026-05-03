import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';

function rowPublicId(item) {
  if (!item) return null;
  return (
    item.supplyPublicId ||
    (item.supplyId != null ? `__legacy_id_${item.supplyId}` : null)
  );
}

const EditModal = () => {
  const {
    currentEditingBox,
    currentEditingIndex,
    inventoryData,
    setCurrentEditingBox,
    setCurrentEditingIndex,
    setLastSelectedIndex,
    updateInventory,
    masterInventoryItems,
    resolveMasterItem
  } = useInventory();

  const boxData = currentEditingBox ? inventoryData.get(currentEditingBox) : null;
  const item = boxData && currentEditingIndex !== null ? boxData.inventory[currentEditingIndex] : null;
  const itemPid = rowPublicId(item);
  const masterItem = itemPid ? resolveMasterItem(itemPid) : null;

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

  const [selectedSupplyPublicId, setSelectedSupplyPublicId] = useState('');
  const [qty, setQty] = useState(1);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (item) {
      setSelectedSupplyPublicId(itemPid || '');
      setQty(item.qty || 1);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    } else {
      setSelectedSupplyPublicId('');
      setQty(1);
    }
  }, [item, itemPid]);

  const previewMaster = selectedSupplyPublicId
    ? resolveMasterItem(selectedSupplyPublicId)
    : masterItem;

  const handleSave = () => {
    if (currentEditingBox !== null && currentEditingIndex !== null && selectedSupplyPublicId) {
      const boxDataInner = inventoryData.get(currentEditingBox);
      const row = masterInventoryItems.get(selectedSupplyPublicId);
      if (boxDataInner && row) {
        const newInventory = [...boxDataInner.inventory];
        const existingItem = newInventory[currentEditingIndex];
        newInventory[currentEditingIndex] = {
          name: row.name,
          supplyId: row.id,
          supplyPublicId: row.public_id || selectedSupplyPublicId,
          qty: parseInt(qty, 10) || 1,
          shelf: existingItem.shelf
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
          value={selectedSupplyPublicId}
          onChange={(e) => setSelectedSupplyPublicId(e.target.value)}
          className="styled-select"
        >
          <option value="">Select Master item...</option>
          {masterRows.map((r) => (
            <option key={r.pid} value={r.pid}>
              {r.label}
            </option>
          ))}
        </select>
        {previewMaster && (
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
            {previewMaster.description && <div>{previewMaster.description}</div>}
            {previewMaster.image && (
              <div className="edit-form-image-container" style={{ marginTop: '0.5rem' }}>
                <img src={previewMaster.image} alt={previewMaster.name} />
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
          <button type="button" className="save" onClick={handleSave} disabled={!selectedSupplyPublicId}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModal;
