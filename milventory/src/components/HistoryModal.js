import React, { useState, useEffect } from 'react';
import { api, locationHistory } from '../api';
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
    limit: 200,
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
      // Fetch both supply history and location history in parallel
      const [supplyResponse, locationData] = await Promise.all([
        api.getSupplyHistory({
          action_type: filters.action_type || undefined,
          limit: filters.limit,
          offset: filters.offset
        }),
        locationHistory.getAll({
          limit: filters.limit,
          offset: filters.offset
        })
      ]);
      
      // Mark supply history entries
      const supplyHistory = supplyResponse.history.map(entry => ({
        ...entry,
        historyType: 'supply'
      }));
      
      // Mark location history entries
      const locHistory = Array.isArray(locationData) ? locationData.map(entry => ({
        ...entry,
        historyType: 'location'
      })) : [];
      
      // Combine and sort by timestamp (newest first)
      let combined = [...supplyHistory, ...locHistory].sort((a, b) => {
        const dateA = new Date(a.changed_at || 0);
        const dateB = new Date(b.changed_at || 0);
        return dateB - dateA;
      });
      
      // No need to filter undone entries - undone actions are deleted entirely from the database
      // See undo_location_history and undo_batch_history endpoints which DELETE entries instead of marking them undone
        
        // Filter by action type if specified
      if (filters.action_type) {
        combined = combined.filter(entry => {
          if (entry.historyType === 'location') {
            // Map location history action types
            if (filters.action_type === 'ADD') return entry.action_type === 'ADD';
            if (filters.action_type === 'SUBTRACT') return entry.action_type === 'REMOVE';
            if (filters.action_type === 'UPDATE') return entry.action_type === 'UPDATE';
            if (filters.action_type === 'MOVE') return entry.action_type === 'MOVE';
            return false;
          } else {
            return entry.action_type === filters.action_type;
          }
        });
      }
      
      // Client-side search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        combined = combined.filter(entry => 
          entry.supply_name?.toLowerCase().includes(searchLower) ||
          entry.location_name?.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply pagination
      const paginated = combined.slice(filters.offset, filters.offset + filters.limit);
      
      setHistory(paginated);
      setTotal(combined.length);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (historyId, historyType) => {
    try {
      if (historyType === 'location') {
        await locationHistory.undo(historyId);
        if (reloadSupplyLocations) {
          await reloadSupplyLocations();
        }
      } else {
        await api.undoSupplyHistory(historyId);
        await reloadMasterItems();
        if (reloadSupplyLocations) {
          await reloadSupplyLocations();
        }
      }
      // Reload history after undo
      await loadHistory();
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
            <option value="ADD">Add</option>
            <option value="SUBTRACT">Subtract</option>
            <option value="MOVE">Move</option>
          </select>
          
            <input
            type="text"
            placeholder="Search by item name or location..."
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
                    key={`${entry.historyType || 'supply'}-${entry.id}`}
                    entry={entry}
                    onUndo={(id) => handleUndo(id, entry.historyType)}
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
