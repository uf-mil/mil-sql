import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useInventory } from '../context/InventoryContext';
import HistoryTableRow from './HistoryTableRow';
import './HistoryModal.css';

const HistoryModal = ({ isOpen, onClose }) => {
  const { reloadMasterItems, reloadSupplyLocations } = useInventory();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    action_type: '',
    search: '',
    limit: 100,
    offset: 0
  });
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, filters]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getSupplyHistory({
        action_type: filters.action_type || undefined,
        limit: filters.limit,
        offset: filters.offset
      });
      
      let filtered = response.history;
      
      // Client-side search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(entry => 
          entry.supply_name?.toLowerCase().includes(searchLower)
        );
      }
      
      setHistory(filtered);
      setTotal(response.total);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (historyId) => {
    try {
      const response = await api.undoSupplyHistory(historyId);
      // Reload history after undo (the undone entry will disappear)
      await loadHistory();
      // Reload master inventory to reflect changes
      await reloadMasterItems();
      // Reload supply locations to update quantities on the map
      // This is especially important when restoring a deleted supply (DELETE undo)
      if (reloadSupplyLocations) {
        await reloadSupplyLocations();
      }
    } catch (err) {
      setError(err.message || 'Failed to undo action');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="history-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-modal">
        <div className="history-modal-header">
          <h2>Item History</h2>
          <button className="history-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="history-modal-filters">
          <select
            value={filters.action_type}
            onChange={(e) => setFilters({ ...filters, action_type: e.target.value, offset: 0 })}
            className="history-filter-select"
          >
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
          
          <input
            type="text"
            placeholder="Search by item name..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, offset: 0 })}
            className="history-filter-search"
          />
        </div>

        {error && (
          <div className="history-error">
            {error}
          </div>
        )}

        <div className="history-modal-content">
          {loading ? (
            <div className="history-loading">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="history-empty">No history entries found</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th className="history-th-timestamp">Timestamp</th>
                  <th className="history-th-action">Action</th>
                  <th className="history-th-item">Item Name</th>
                  <th className="history-th-changes">Changes</th>
                  <th className="history-th-user">Changed By</th>
                  <th className="history-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map(entry => (
                  <HistoryTableRow
                    key={entry.id}
                    entry={entry}
                    onUndo={handleUndo}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > filters.limit && (
          <div className="history-modal-pagination">
            <button
              onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - filters.limit) })}
              disabled={filters.offset === 0}
              className="history-pagination-btn"
            >
              Previous
            </button>
            <span className="history-pagination-info">
              Showing {filters.offset + 1} - {Math.min(filters.offset + filters.limit, total)} of {total}
            </span>
            <button
              onClick={() => setFilters({ ...filters, offset: filters.offset + filters.limit })}
              disabled={filters.offset + filters.limit >= total}
              className="history-pagination-btn"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryModal;
