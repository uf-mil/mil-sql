import React, { useState, useRef } from 'react';
import { admin } from '../api';

const LOCATION_TYPES = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'tall_cabinet', label: 'Tall Cabinet' },
  { value: 'table', label: 'Table' },
  { value: 'other', label: 'Other' }
];

const AddLocationModal = ({ isOpen, onClose, onSuccess, initialBox, leftPaneWidth, leftPaneCollapsed, onPreviewUpdate, previewBox, onEdgeDrag }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'drawer',
    topY: '',
    bottomY: '',
    leftX: '',
    rightX: ''
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Update form data when initialBox changes (from drawn box)
  React.useEffect(() => {
    if (initialBox && isOpen) {
      setFormData(prev => ({
        ...prev,
        topY: String(initialBox.y),
        bottomY: String(initialBox.y + initialBox.height),
        leftX: String(initialBox.x),
        rightX: String(initialBox.x + initialBox.width)
      }));
    }
  }, [initialBox, isOpen]);

  // Edge drag handler is set up via onEdgeDrag ref in useEffect below

  // Update preview on map when form data changes (only if valid)
  React.useEffect(() => {
    if (isOpen && onPreviewUpdate) {
      const topY = parseFloat(formData.topY);
      const bottomY = parseFloat(formData.bottomY);
      const leftX = parseFloat(formData.leftX);
      const rightX = parseFloat(formData.rightX);
      
      // Only show preview if all values are valid numbers and edges make sense
      if (!isNaN(topY) && !isNaN(bottomY) && !isNaN(leftX) && !isNaN(rightX) && 
          bottomY > topY && rightX > leftX) {
        onPreviewUpdate({
          x: leftX,
          y: topY,
          width: rightX - leftX,
          height: bottomY - topY
        });
      } else {
        // Hide preview if invalid
        onPreviewUpdate(null);
      }
    }
  }, [formData.topY, formData.bottomY, formData.leftX, formData.rightX, isOpen, onPreviewUpdate]);

  // Update form data when an edge value is changed
  const handleEdgeChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  };

  // Expose edge drag handler to parent
  React.useEffect(() => {
    if (onEdgeDrag) {
      onEdgeDrag.current = (edges) => {
        setFormData(prev => ({
          ...prev,
          topY: String(edges.topY),
          bottomY: String(edges.bottomY),
          leftX: String(edges.leftX),
          rightX: String(edges.rightX)
        }));
      };
    }
  }, [onEdgeDrag]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value // Store as string to allow empty values
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

      // Parse edge values and calculate x, y, width, height
      const topY = parseFloat(formData.topY);
      const bottomY = parseFloat(formData.bottomY);
      const leftX = parseFloat(formData.leftX);
      const rightX = parseFloat(formData.rightX);

      if (isNaN(topY) || isNaN(bottomY) || isNaN(leftX) || isNaN(rightX)) {
        setError('All edge values must be valid numbers');
        setSubmitting(false);
        return;
      }

      if (bottomY <= topY) {
        setError('Bottom Y must be greater than Top Y');
        setSubmitting(false);
        return;
      }

      if (rightX <= leftX) {
        setError('Right X must be greater than Left X');
        setSubmitting(false);
        return;
      }

      const x = leftX;
      const y = topY;
      const width = rightX - leftX;
      const height = bottomY - topY;

      await admin.createLocation({
        name: formData.name,
        type: formData.type,
        x: x,
        y: y,
        width: width,
        height: height
      });
      
      // Reset form
      setFormData({
        name: '',
        type: 'drawer',
        topY: '',
        bottomY: '',
        leftX: '',
        rightX: ''
      });
      
      // Clear preview
      if (onPreviewUpdate) {
        onPreviewUpdate(null);
      }
      
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
      topY: '',
      bottomY: '',
      leftX: '',
      rightX: ''
    });
    setError(null);
    // Clear preview
    if (onPreviewUpdate) {
      onPreviewUpdate(null);
    }
    onClose();
  };

  if (!isOpen) return null;

  // Calculate position to the right of left pane (same as LocationPreview)
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  return (
    <div
      className="master-preview-pane-overlay"
      style={{
        position: 'fixed',
        left: `${positionX}px`,
        top: `${positionY}px`,
        zIndex: 1000
      }}
    >
      <div className="master-preview-pane">
        <div className="master-preview-pane-header">
        <h3>Add New Location</h3>
          <button
            className="master-preview-pane-close"
            onClick={handleCancel}
            title="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            background: '#dc3545',
            color: 'white',
            padding: '0.75rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            marginTop: '0.5rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: '0.5rem' }}>
        <input
          type="text"
          placeholder="Location Name *"
          value={formData.name}
          name="name"
          onChange={handleChange}
          required
          disabled={submitting}
            style={{
              width: '70%',
              padding: '0.5rem',
              marginBottom: '0.5rem',
              background: '#27292E',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontSize: '0.9rem'
            }}
        />
        <select
          value={formData.type}
          name="type"
          onChange={handleChange}
          required
          disabled={submitting}
            style={{
              width: '70%',
              padding: '0.5rem',
              background: '#27292E',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontSize: '0.9rem'
            }}
        >
          {LOCATION_TYPES.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        </div>
        <div style={{ marginTop: '0.5rem', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--text)', opacity: 0.8 }}>
          Position & Size
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
              Top Y
            </div>
          <input
            type="number"
              placeholder="Top Y"
              value={formData.topY === '' ? '' : formData.topY}
              onChange={(e) => handleEdgeChange('topY', e.target.value)}
              disabled={submitting}
              style={{ 
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.35rem',
                background: '#27292E',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
              Bottom Y
            </div>
          <input
            type="number"
              placeholder="Bottom Y"
              value={formData.bottomY === '' ? '' : formData.bottomY}
              onChange={(e) => handleEdgeChange('bottomY', e.target.value)}
              disabled={submitting}
              style={{ 
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.35rem',
                background: '#27292E',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
          />
        </div>
          <div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
              Left X
            </div>
          <input
            type="number"
              placeholder="Left X"
              value={formData.leftX === '' ? '' : formData.leftX}
              onChange={(e) => handleEdgeChange('leftX', e.target.value)}
              disabled={submitting}
              style={{ 
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.35rem',
                background: '#27292E',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
              Right X
            </div>
          <input
            type="number"
              placeholder="Right X"
              value={formData.rightX === '' ? '' : formData.rightX}
              onChange={(e) => handleEdgeChange('rightX', e.target.value)}
              disabled={submitting}
              style={{ 
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.35rem',
                background: '#27292E',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text)'
              }}
          />
          </div>
        </div>
        <div className="master-preview-actions" style={{ marginTop: '1rem' }}>
          <div className="master-preview-actions-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
              className="master-action-button"
              style={{ flex: 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !formData.name.trim()}
              className="master-action-button"
              style={{ 
                flex: 1,
                background: 'var(--accent)',
                color: 'white'
              }}
          >
            {submitting ? 'Creating...' : 'Create Location'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddLocationModal;

