import React, { useState, useEffect } from 'react';
import { locationHistory } from '../api';
import { useInventory } from '../context/InventoryContext';

const HistoryTab = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [undoing, setUndoing] = useState(new Set()); // Track which IDs are being undone
  const { reloadSupplyLocations } = useInventory();

  useEffect(() => {
    loadHistory();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await locationHistory.getAll({ limit: 100 });
      setHistory(data);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (historyId) => {
    if (undoing.has(historyId)) return;
    
    try {
      setUndoing(prev => new Set(prev).add(historyId));
      await locationHistory.undo(historyId);
      // Reload history and inventory
      await loadHistory();
      if (reloadSupplyLocations) {
        await reloadSupplyLocations();
      }
    } catch (err) {
      alert(err.message || 'Failed to undo action');
    } finally {
      setUndoing(prev => {
        const next = new Set(prev);
        next.delete(historyId);
        return next;
      });
    }
  };

  const formatAction = (entry) => {
    switch (entry.action_type) {
      case 'ADD':
        return 'Added';
      case 'REMOVE':
        return 'Removed';
      case 'UPDATE':
        return 'Updated';
      case 'MOVE':
        return 'Moved';
      case 'CASCADED_SUBTRACT':
        return 'Cascaded Subtract';
      default:
        return entry.action_type;
    }
  };

  const formatAmount = (entry) => {
    if (entry.action_type === 'ADD') {
      const added = entry.new_amount - (entry.old_amount || 0);
      return `+${added}`;
    } else if (entry.action_type === 'REMOVE') {
      const removed = entry.old_amount - (entry.new_amount || 0);
      return `-${removed}`;
    } else if (entry.action_type === 'UPDATE') {
      const diff = entry.new_amount - entry.old_amount;
      return diff >= 0 ? `+${diff}` : `${diff}`;
    } else if (entry.action_type === 'MOVE') {
      if (entry.action_type === 'REMOVE') {
        // This is the REMOVE leg of a MOVE
        return `→ ${entry.related_location || ''}`;
      } else {
        // This is the ADD leg of a MOVE
        return `← ${entry.related_location || ''}`;
      }
    }
    return '';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const formatLocation = (entry) => {
    let loc = entry.location_name;
    if (entry.shelf !== null && entry.shelf !== undefined) {
      loc += ` (Shelf ${entry.shelf})`;
    }
    return loc;
  };

  if (loading && history.length === 0) {
    return (
      <div className="history-tab">
        <div className="master-table-content">
          <div className="master-table-empty">Loading history...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-tab">
        <div className="master-table-content">
          <div className="master-table-empty" style={{ color: '#dc3545' }}>
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="history-tab">
      <div className="master-table-content">
        {history.length === 0 ? (
          <div className="master-table-empty">No history available</div>
        ) : (
          <table className="master-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Item</th>
                <th>Action</th>
                <th>Location</th>
                <th>Amount</th>
                <th>By</th>
                <th>Undo</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTime(entry.changed_at)}</td>
                  <td>{entry.supply_name}</td>
                  <td>{formatAction(entry)}</td>
                  <td>{formatLocation(entry)}</td>
                  <td>{formatAmount(entry)}</td>
                  <td>{entry.changed_by_name || entry.changed_by || 'Unknown'}</td>
                  <td>
                    {entry.action_type === 'CASCADED_SUBTRACT' ? (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text)', opacity: 0.6 }}>
                        Use restore
                      </span>
                    ) : (
                      <button
                        className="undo-button"
                        onClick={() => handleUndo(entry.id)}
                        disabled={undoing.has(entry.id)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.85rem',
                          background: 'var(--accent)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: undoing.has(entry.id) ? 'not-allowed' : 'pointer',
                          opacity: undoing.has(entry.id) ? 0.6 : 1
                        }}
                      >
                        {undoing.has(entry.id) ? 'Undoing...' : 'Undo'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default HistoryTab;


