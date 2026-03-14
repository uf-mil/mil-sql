import React, { useState } from 'react';
import './HistoryTableRow.css';

const HistoryTableRow = ({ entry, onUndo, index = 0, isAdmin = false }) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getActionBadgeClass = (actionType) => {
    switch (actionType) {
      case 'CREATE':
        return 'history-badge-create';
      case 'UPDATE':
        return 'history-badge-update';
      case 'DELETE':
        return 'history-badge-delete';
      case 'ADD':
        return 'history-badge-create';
      case 'REMOVE':
        return 'history-badge-delete';
      case 'MOVE':
        return 'history-badge-update';
      case 'CASCADED_SUBTRACT':
        return 'history-badge-default';
      default:
        return 'history-badge-default';
    }
  };

  const formatActionType = (actionType) => {
    switch (actionType) {
      case 'REMOVE':
        return 'SUBTRACT';
      default:
        return actionType;
    }
  };

  const formatChangesSummary = () => {
    // Handle location history entries
    if (entry.historyType === 'location') {
      const changes = [];
      
      if (entry.location_name) {
        let location = entry.location_name;
        if (entry.shelf !== null && entry.shelf !== undefined) {
          location += ` (Shelf ${entry.shelf})`;
        }
        changes.push(`Location: ${location}`);
      }
      
      if (entry.action_type === 'ADD') {
        const added = entry.new_amount - (entry.old_amount || 0);
        changes.push(`Added: +${added}`);
      } else if (entry.action_type === 'REMOVE') {
        const removed = entry.old_amount - (entry.new_amount || 0);
        changes.push(`Subtracted: -${removed}`);
      } else if (entry.action_type === 'UPDATE') {
        const diff = entry.new_amount - entry.old_amount;
        changes.push(`Amount: ${entry.old_amount || 0} → ${entry.new_amount || 0} (${diff >= 0 ? '+' : ''}${diff})`);
      } else if (entry.action_type === 'MOVE') {
        if (entry.related_location) {
          changes.push(`Moved to: ${entry.related_location}`);
        }
      }
      
      return changes.join('; ') || 'Location change';
    }
    
    // Handle supply history entries
    const changes = [];
    
    if (entry.old_name !== entry.new_name) {
      changes.push(`Name: "${entry.old_name || 'N/A'}" → "${entry.new_name || 'N/A'}"`);
    }
    
    if (entry.old_description !== entry.new_description) {
      changes.push('Description changed');
    }
    
    if (entry.old_image !== entry.new_image) {
      changes.push('Image changed');
    }
    
    if (entry.old_last_order_date !== entry.new_last_order_date) {
      changes.push('Last order date changed');
    }
    
    if (entry.team_changes && entry.team_changes.length > 0) {
      const added = entry.team_changes.filter(t => t.action === 'ADDED').map(t => t.team_name);
      const removed = entry.team_changes.filter(t => t.action === 'REMOVED').map(t => t.team_name);
      const teamChanges = [];
      if (added.length > 0) teamChanges.push(`${added.join(', ')} added`);
      if (removed.length > 0) teamChanges.push(`${removed.join(', ')} removed`);
      if (teamChanges.length > 0) {
        changes.push(`Teams: ${teamChanges.join(', ')}`);
      }
    }
    
    if (entry.category_changes && entry.category_changes.length > 0) {
      const added = entry.category_changes.filter(c => c.action === 'ADDED').map(c => c.category_id);
      const removed = entry.category_changes.filter(c => c.action === 'REMOVED').map(c => c.category_id);
      const catChanges = [];
      if (added.length > 0) catChanges.push(`Categories ${added.join(', ')} added`);
      if (removed.length > 0) catChanges.push(`Categories ${removed.join(', ')} removed`);
      if (catChanges.length > 0) {
        changes.push(catChanges.join(', '));
      }
    }
    
    if (changes.length === 0) {
      return entry.action_type === 'CREATE' ? 'Item created' : 'No changes detected';
    }
    
    return changes.join('; ');
  };

  const handleUndoClick = () => {
    if (showConfirm) {
      onUndo(entry.id);
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  // Determine if entry can be undone
  // Note: Undone entries are deleted entirely from the database, so we don't need to check undone status
  // For users: only last 5 items can be undone
  // For admins: all items can be undone
  const baseCanUndo = entry.historyType === 'location' 
    ? entry.action_type !== 'CASCADED_SUBTRACT'
    : entry.can_undo !== false;
  
  const canUndo = isAdmin 
    ? baseCanUndo  // Admins can undo all items
    : baseCanUndo && index < 5;  // Users can only undo last 5 items

  return (
    <tr className="history-row">
      <td className="history-timestamp">{formatDate(entry.changed_at)}</td>
      <td className="history-action">
        <span className={`history-badge ${getActionBadgeClass(entry.action_type)}`}>
          {formatActionType(entry.action_type)}
        </span>
      </td>
      <td className="history-item-name">
        {entry.supply_name || 'N/A'}
        {entry.historyType === 'location' && entry.location_name && (
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: '0.5rem' }}>
            @ {entry.location_name}
          </span>
        )}
      </td>
      <td className="history-changes">{formatChangesSummary()}</td>
      <td className="history-changed-by">
        <span title={entry.changed_by_email || ''}>
          {entry.changed_by_name || entry.changed_by || 'Unknown'}
        </span>
      </td>
      <td className="history-actions">
        {entry.action_type === 'CASCADED_SUBTRACT' ? (
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Use restore</span>
        ) : showConfirm ? (
          <div className="history-undo-confirm">
            <button
              className="history-undo-confirm-btn"
              onClick={handleUndoClick}
            >
              Confirm
            </button>
            <button
              className="history-undo-cancel-btn"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="history-undo-btn"
            onClick={handleUndoClick}
            disabled={!canUndo}
            title={!canUndo ? 'Cannot undo' : 'Undo this action'}
          >
            Undo
          </button>
        )}
      </td>
    </tr>
  );
};

export default HistoryTableRow;

