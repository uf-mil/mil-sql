import React, { useState, useEffect } from 'react';
import { getCategories, admin } from '../../api';

const CategoriesTable = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      setError('Category name cannot be empty');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await admin.createCategory(categoryName.trim());
      setCategoryName('');
      setShowAddForm(false);
      await loadCategories();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="master-table-empty">Loading categories...</div>;
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
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Category name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="master-search-input"
              disabled={submitting}
              style={{ marginBottom: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                className="add-item-button"
                disabled={submitting || !categoryName.trim()}
                style={{ flex: 1, marginTop: 0 }}
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setCategoryName('');
                  setError(null);
                }}
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

      {categories.length === 0 ? (
        <div className="master-table-empty">
          {showAddForm ? 'Enter a category name above' : 'No categories. Click "+ Add Category" to create one.'}
        </div>
      ) : (
        <table className="master-table">
          <thead>
            <tr>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(category => (
              <tr key={category.id} className="master-table-row">
                <td>{category.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!showAddForm && (
        <div className="master-table-actions">
          <button
            className="add-item-button"
            onClick={() => setShowAddForm(true)}
          >
            + Add Category
          </button>
        </div>
      )}
    </>
  );
};

export default CategoriesTable;

