import React from 'react';
import { useInventory } from '../context/InventoryContext';

const SOTTableRow = ({ itemName, itemData, quantity, isSelected, onClick, onEdit, onAdd }) => {
  const { deleteSOTItem, getItemLocations } = useInventory();

  const handleDelete = (e) => {
    e.stopPropagation();
    const locations = getItemLocations(itemName);
    if (locations.length > 0) {
      const confirmed = window.confirm(
        `This item is used in ${locations.length} box(es). Delete from all boxes?`
      );
      if (!confirmed) return;
    }
    deleteSOTItem(itemName);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit();
  };

  const handleAdd = (e) => {
    e.stopPropagation();
    onAdd();
  };

  return (
    <tr
      className={`sot-table-row ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <td className="name-cell">{itemName}</td>
      <td className="qty-cell">{quantity}</td>
      <td className="actions-cell">
        <button
          className="add-button"
          onClick={handleAdd}
          title="Add to boxes"
        >
          Add
        </button>
        <button
          className="edit-button"
          onClick={handleEdit}
          title="Edit item"
        >
          Edit
        </button>
        <button
          className="delete-button"
          onClick={handleDelete}
          title="Delete item"
        >
          Delete
        </button>
      </td>
    </tr>
  );
};

export default SOTTableRow;

