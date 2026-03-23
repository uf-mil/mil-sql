import React, { useState, useEffect } from 'react';
import { admin } from '../../api';
import { useBlockingDialog } from '../Common/BlockingDialogContext';

const TYPES = ['text', 'number', 'date'];

const CustomFieldsTable = () => {
  const { showConfirm } = useBlockingDialog();
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('text');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('text');

  const loadDefinitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await admin.getCustomFieldDefinitions();
      setDefinitions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      setDefinitions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDefinitions();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addName.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await admin.createCustomFieldDefinition({
        name: addName.trim(),
        type: addType
      });
      setAddName('');
      setAddType('text');
      setShowAddForm(false);
      await loadDefinitions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (def) => {
    setEditingId(def.id);
    setEditName(def.name);
    setEditType(def.type);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditType('text');
  };

  const handleUpdate = async () => {
    if (editingId == null) return;
    try {
      setError(null);
      await admin.updateCustomFieldDefinition(editingId, { name: editName.trim(), type: editType });
      setEditingId(null);
      await loadDefinitions();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const ok = await showConfirm(
      'Delete this custom field definition? This will also remove this field and its value from all items that have it.',
      { title: 'Delete custom field', danger: true, confirmLabel: 'Delete', cancelLabel: 'Cancel' }
    );
    if (!ok) return;
    try {
      setError(null);
      await admin.deleteCustomFieldDefinition(id);
      await loadDefinitions();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="master-table-empty">Loading custom fields...</div>;
  }

  return (
    <>
      {error && (
        <div style={{
          background: '#dc3545',
          color: 'white',
          padding: '0.5rem',
          borderRadius: '4px',
          marginBottom: '0.5rem',
          fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      {showAddForm && (
        <div style={{
          background: 'rgba(0,0,0,.3)',
          padding: '1rem',
          borderRadius: '6px',
          marginBottom: '1rem',
          border: '1px solid rgba(255,255,255,.1)'
        }}>
          <form onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="Name (e.g. Part ID)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="master-search-input"
              disabled={submitting}
              style={{ marginBottom: '0.5rem', display: 'block', width: '100%' }}
            />
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="styled-select"
              disabled={submitting}
              style={{ marginBottom: '0.5rem', display: 'block', width: '100%' }}
            >
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                className="add-item-button"
                disabled={submitting || !addName.trim()}
                style={{ flex: 1, marginTop: 0 }}
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddName(''); setError(null); }}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'rgba(255,255,255,.1)',
                  color: 'var(--text)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {definitions.length === 0 ? (
        <div className="master-table-empty">
          {showAddForm ? 'Enter name and type above' : 'No custom fields. Click "+ Add Custom Field" to create one.'}
        </div>
      ) : (
        <table className="master-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map(def => (
              <tr key={def.id} className="master-table-row">
                {editingId === def.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="master-search-input"
                        style={{ width: '100%', padding: '0.25rem' }}
                      />
                    </td>
                    <td>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        className="styled-select"
                        style={{ padding: '0.25rem' }}
                      >
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={handleUpdate}
                        style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer', background: '#444', color: '#fff', border: 'none', borderRadius: '4px' }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer', background: '#444', color: '#fff', border: 'none', borderRadius: '4px' }}
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{def.name}</td>
                    <td>{def.type}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => startEdit(def)}
                        style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer', background: '#444', color: '#fff', border: 'none', borderRadius: '4px' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(def.id)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px' }}
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!showAddForm && (
        <div className="master-table-actions">
          <button
            className="add-item-button"
            onClick={() => { setShowAddForm(true); setError(null); }}
          >
            + Add Custom Field
          </button>
        </div>
      )}
    </>
  );
};

export default CustomFieldsTable;
