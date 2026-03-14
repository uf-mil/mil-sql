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

const MasterTableRow = ({ itemName, itemData, quantity, locations, categories, teams, showQty, showLocation, showCategory, showTeam, showLastModified, isSelected, onClick }) => {
  // Build a truncated location string that fits the cell
  const locationText = locations.length === 0
    ? '—'
    : locations.length === 1
      ? locations[0]
      : `${locations[0]}, ...+${locations.length - 1}`;

  // Build a truncated category string that fits the cell (same strategy as locations)
  const categoryText = categories.length === 0
    ? '—'
    : categories.length === 1
      ? categories[0]
      : `${categories[0]}, ...+${categories.length - 1}`;

  // Build a truncated team string that fits the cell (same strategy as locations)
  const teamText = teams.length === 0
    ? '—'
    : teams.length === 1
      ? teams[0]
      : `${teams[0]}, ...+${teams.length - 1}`;

  return (
    <tr
      className={`master-table-row ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <td className="name-cell">{itemName}</td>
      {showQty && (
        <td className="qty-cell">{quantity}</td>
      )}
      {showLocation && (
        <td className="location-cell" title={locations.join(', ')}>
          {locationText}
        </td>
      )}
      {showCategory && (
        <td className="category-cell" title={categories.join(', ')}>
          {categoryText}
        </td>
      )}
      {showTeam && (
        <td className="team-cell" title={teams.join(', ')}>
          {teamText}
        </td>
      )}
      {showLastModified && (
        <td className="modified-cell" title={itemData.lastModified || ''}>
          {formatDate(itemData.lastModified)}
        </td>
      )}
    </tr>
  );
};

export default MasterTableRow;
