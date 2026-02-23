import React, { useState } from 'react';
import { admin } from '../api';

const LOCATION_TYPES = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'tall_cabinet', label: 'Tall Cabinet' },
  { value: 'table', label: 'Table' },
  { value: 'workbench', label: 'Workbench' }
];

const AddLocationModal = ({ isOpen, onClose, onSuccess, initialBox }) => {
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

  // Update form data when initialBox changes (from drawn box)
  React.useEffect(() => {
    if (initialBox && isOpen) {
      setFormData(prev => ({
        ...prev,
        x: initialBox.x,
        y: initialBox.y,
        width: initialBox.width,
        height: initialBox.height
      }));
    }
  }, [initialBox, isOpen]);

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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay visible" onClick={handleCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add New Location</h3>

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

        <input
          type="text"
          placeholder="Location Name *"
          value={formData.name}
          name="name"
          onChange={handleChange}
          required
          disabled={submitting}
        />
        <select
          value={formData.type}
          name="type"
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="number"
            placeholder="X Position"
            value={formData.x}
            name="x"
            onChange={handleChange}
            min="0"
            disabled={submitting || !!initialBox}
            readOnly={!!initialBox}
            style={{ flex: 1, ...(initialBox ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
          />
          <input
            type="number"
            placeholder="Y Position"
            value={formData.y}
            name="y"
            onChange={handleChange}
            min="0"
            disabled={submitting || !!initialBox}
            readOnly={!!initialBox}
            style={{ flex: 1, ...(initialBox ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="number"
            placeholder="Width"
            value={formData.width}
            name="width"
            onChange={handleChange}
            min="1"
            required
            disabled={submitting || !!initialBox}
            readOnly={!!initialBox}
            style={{ flex: 1, ...(initialBox ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
          />
          <input
            type="number"
            placeholder="Height"
            value={formData.height}
            name="height"
            onChange={handleChange}
            min="1"
            required
            disabled={submitting || !!initialBox}
            readOnly={!!initialBox}
            style={{ flex: 1, ...(initialBox ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
          />
        </div>
        <div className="modal-actions">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !formData.name.trim()}
            className="save"
          >
            {submitting ? 'Creating...' : 'Create Location'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLocationModal;

