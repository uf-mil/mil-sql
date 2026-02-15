import React from 'react';

const formatDate = (isoString) => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr}`;
};

const SOTTableRow = ({ itemName, itemData, quantity, locations, isSelected, onClick }) => {
  // Build a truncated location string that fits the cell
  const locationText = locations.length === 0
    ? '—'
    : locations.length === 1
      ? locations[0]
      : `${locations[0]}, ...+${locations.length - 1}`;

  return (
    <tr
      className={`sot-table-row ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <td className="name-cell">{itemName}</td>
      <td className="qty-cell">{quantity}</td>
      <td className="location-cell" title={locations.join(', ')}>
        {locationText}
      </td>
      <td className="modified-cell" title={itemData.lastModified || ''}>
        {formatDate(itemData.lastModified)}
      </td>
    </tr>
  );
};

export default SOTTableRow;
