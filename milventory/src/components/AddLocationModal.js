import React, { useState } from 'react';
import { admin } from '../api';

const LOCATION_TYPES = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'tall_cabinet', label: 'Tall Cabinet' },
  { value: 'table', label: 'Table' },
  { value: 'workbench', label: 'Workbench' }
];

const AddLocationModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'drawer',
    x: 0,
    y: 0,
    width: 150,
    height: 150
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'name' || name === 'type' ? value : parseInt(value, 10) || 0
    }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Validate
      if (!formData.name.trim()) {
        setError('Location name is required');
        setSubmitting(false);
        return;
      }

      if (formData.width <= 0 || formData.height <= 0) {
        setError('Width and height must be greater than 0');
        setSubmitting(false);
        return;
      }

      await admin.createLocation(formData);
      
      // Reset form
      setFormData({
        name: '',
        type: 'drawer',
        x: 0,
        y: 0,
        width: 150,
        height: 150
      });
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create location');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      type: 'drawer',
      x: 0,
      y: 0,
      width: 150,
      height: 150
    });
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Location</h2>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>

        {error && (
          <div className="modal-error" style={{
            background: '#dc3545',
            color: 'white',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="name">Location Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g., Drawer A, Cabinet 5"
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="type">Type *</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              disabled={submitting}
            >
              {LOCATION_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="x">X Position</label>
              <input
                type="number"
                id="x"
                name="x"
                value={formData.x}
                onChange={handleChange}
                min="0"
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="y">Y Position</label>
              <input
                type="number"
                id="y"
                name="y"
                value={formData.y}
                onChange={handleChange}
                min="0"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="width">Width</label>
              <input
                type="number"
                id="width"
                name="width"
                value={formData.width}
                onChange={handleChange}
                min="1"
                required
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label htmlFor="height">Height</label>
              <input
                type="number"
                id="height"
                name="height"
                value={formData.height}
                onChange={handleChange}
                min="1"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="modal-button cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="modal-button submit"
            >
              {submitting ? 'Creating...' : 'Create Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLocationModal;

