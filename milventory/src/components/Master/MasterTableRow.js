import React from 'react';
import {
  easternCalendarDayKey,
  formatEasternDateShort,
  formatEasternDateOnly,
  formatEasternTimeShort,
} from '../../utils/appTimeZone';

const formatDate = (isoString) => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  const now = new Date();
  const isToday = easternCalendarDayKey(date) === easternCalendarDayKey(now);

  const timeStr = formatEasternTimeShort(date);

  if (isToday) {
    return timeStr;
  }

  const dateStr = formatEasternDateShort(date);
  return `${dateStr}, ${timeStr}`;
};

export const formatCustomValue = (value, type) => {
  if (value === undefined || value === null || value === '') return '—';
  if (type === 'date') {
    try {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : formatEasternDateOnly(d);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const MasterTableRow = ({ itemName, itemData, quantity, locations, categories, teams, showType, showQty, showLocation, showCategory, showTeam, showLastModified, visibleCustomColumns, customFieldDefinitions, isSelected, onClick }) => {
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
      {showType && (
        <td className="type-cell" title={itemData.type_name || ''}>
          {itemData.type_name || '—'}
        </td>
      )}
      <td className="name-cell">{itemData?.name ?? itemName}</td>
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
      {customFieldDefinitions?.filter(d => visibleCustomColumns?.has(d.name)).map(d => (
        <td key={d.id} className="custom-field-cell">
          {formatCustomValue(itemData.custom_fields?.[d.name], d.type)}
        </td>
      ))}
    </tr>
  );
};

export default MasterTableRow;
