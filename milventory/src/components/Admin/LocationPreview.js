import React, { useRef, useState, useEffect, useCallback } from 'react';
import { admin } from '../../api';
import { useBlockingDialog } from '../Common/BlockingDialogContext';

const LOCATION_TYPES = [
  { value: 'drawer', label: 'Drawer' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'tall_cabinet', label: 'Tall Cabinet' },
  { value: 'table', label: 'Table' },
  { value: 'other', label: 'Other' },
  { value: 'special', label: 'Special' },
  { value: 'external', label: 'External' }
];

const LocationPreview = ({ location, onClose, onDelete, leftPaneWidth, leftPaneCollapsed, onEditStart, onEditEnd, onPreviewUpdate, onEdgeDrag }) => {
  const { showAlert, showConfirm } = useBlockingDialog();
  const previewRef = useRef(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editTopY, setEditTopY] = useState('');
  const [editBottomY, setEditBottomY] = useState('');
  const [editLeftX, setEditLeftX] = useState('');
  const [editRightX, setEditRightX] = useState('');
  const [editHasShelves, setEditHasShelves] = useState(false);
  const [editShelfCount, setEditShelfCount] = useState(0);

  // Calculate position to the right of left pane
  const leftPaneActualWidth = leftPaneCollapsed ? 40 : leftPaneWidth;
  const positionX = leftPaneActualWidth + 20;
  const positionY = 20;

  const isProtected = location?.protected || false;

  // Reset edit mode when location changes
  useEffect(() => {
    if (editing) {
      handleCancelEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.name]);

  // Expose edge drag handler to parent so map can update our form fields
  useEffect(() => {
    if (onEdgeDrag && editing) {
      onEdgeDrag.current = (edges) => {
        setEditTopY(String(edges.topY));
        setEditBottomY(String(edges.bottomY));
        setEditLeftX(String(edges.leftX));
        setEditRightX(String(edges.rightX));
      };
    }
    return () => {
      if (onEdgeDrag) {
        onEdgeDrag.current = null;
      }
    };
  }, [onEdgeDrag, editing]);

  // Update preview box on map when edge values change during editing
  useEffect(() => {
    if (!editing || !onPreviewUpdate) return;
    const topY = parseFloat(editTopY);
    const bottomY = parseFloat(editBottomY);
    const leftX = parseFloat(editLeftX);
    const rightX = parseFloat(editRightX);

    if (!isNaN(topY) && !isNaN(bottomY) && !isNaN(leftX) && !isNaN(rightX) &&
        bottomY > topY && rightX > leftX) {
      onPreviewUpdate({
        x: leftX,
        y: topY,
        width: rightX - leftX,
        height: bottomY - topY
      });
    }
  }, [editTopY, editBottomY, editLeftX, editRightX, editing, onPreviewUpdate]);

  const handleStartEdit = useCallback(() => {
    if (!location) return;
    setEditing(true);
    setError(null);
    setEditName(location.name);
    setEditType(location.type || 'other');
    setEditTopY(String(location.y));
    setEditBottomY(String(location.y + location.height));
    setEditLeftX(String(location.x));
    setEditRightX(String(location.x + location.width));
    const currentShelfCount = Math.max(0, parseInt(location.shelf_count, 10) || 0);
    setEditHasShelves(currentShelfCount > 0);
    setEditShelfCount(currentShelfCount > 0 ? currentShelfCount : 6);

    // Show preview box on map at current location
    if (onPreviewUpdate) {
      onPreviewUpdate({
        x: location.x,
        y: location.y,
        width: location.width,
        height: location.height
      });
    }
    if (onEditStart) {
      onEditStart();
    }
  }, [location, onPreviewUpdate, onEditStart]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
    if (onPreviewUpdate) {
      onPreviewUpdate(null);
    }
    if (onEditEnd) {
      onEditEnd();
    }
  }, [onPreviewUpdate, onEditEnd]);

  const handleSave = useCallback(async () => {
    if (!location) return;
    setError(null);
    setSaving(true);

    try {
      if (!editName.trim()) {
        setError('Location name is required');
        setSaving(false);
        return;
      }

      const topY = parseFloat(editTopY);
      const bottomY = parseFloat(editBottomY);
      const leftX = parseFloat(editLeftX);
      const rightX = parseFloat(editRightX);

      if (isNaN(topY) || isNaN(bottomY) || isNaN(leftX) || isNaN(rightX)) {
        setError('All edge values must be valid numbers');
        setSaving(false);
        return;
      }
      if (bottomY <= topY) {
        setError('Bottom Y must be greater than Top Y');
        setSaving(false);
        return;
      }
      if (rightX <= leftX) {
        setError('Right X must be greater than Left X');
        setSaving(false);
        return;
      }

      const x = leftX;
      const y = topY;
      const width = rightX - leftX;
      const height = bottomY - topY;

      // Resolve the desired shelf_count from the toggle + numeric input.
      let nextShelfCount = 0;
      if (editHasShelves) {
        const parsed = parseInt(editShelfCount, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          setError('Shelf count must be at least 1 when "Has shelves" is checked');
          setSaving(false);
          return;
        }
        if (parsed > 15) {
          setError('Shelf count cannot exceed 15');
          setSaving(false);
          return;
        }
        nextShelfCount = parsed;
      }

      const updateData = {
        x, y, width, height,
        type: editType,
        shelf_count: nextShelfCount
      };

      // Include name if it changed
      if (editName.trim() !== location.name) {
        updateData.name = editName.trim();
      }

      try {
        await admin.updateLocation(location.name, updateData);
      } catch (apiErr) {
        // Surface the API's orphan-count message from a 409 response as-is; it
        // already tells the admin how many placements are blocking the change.
        if (apiErr && apiErr.response && apiErr.response.status === 409) {
          setError(apiErr.message || 'Cannot reduce shelf count while placements use the removed shelves.');
          setSaving(false);
          return;
        }
        throw apiErr;
      }

      // Clear preview and exit edit mode
      if (onPreviewUpdate) {
        onPreviewUpdate(null);
      }
      if (onEditEnd) {
        onEditEnd();
      }
      setEditing(false);

      // Reload to reflect changes
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      setError(err.message || 'Failed to update location');
    } finally {
      setSaving(false);
    }
  }, [location, editName, editType, editTopY, editBottomY, editLeftX, editRightX, editHasShelves, editShelfCount, onPreviewUpdate, onEditEnd]);

  const handleDelete = async () => {
    if (!location) return;
    
    if (isProtected) {
      await showAlert(
        `This location is protected and is a permanent inventory location. ` +
        `To delete it, you must edit the database directly to set protected = FALSE.`,
        { title: 'Protected location' }
      );
      return;
    }
    
    const confirmed = await showConfirm(
      `Are you sure you want to delete "${location.name}"? This action cannot be undone.`,
      { title: 'Delete location', danger: true, confirmLabel: 'Delete', cancelLabel: 'Cancel' }
    );
    
    if (!confirmed) return;

    try {
      setDeleting(true);
      await admin.deleteLocation(location.name);
      if (onDelete) {
        onDelete(location.name);
      }
      if (onClose) {
        onClose();
      }
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err) {
      await showAlert(`Failed to delete location: ${err.message}`, { title: 'Error' });
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (editing) {
      handleCancelEdit();
    }
    onClose();
  };

  if (!location) return null;

  const typeDisplay = location.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  const inputStyle = {
    width: '100%',
    fontSize: '0.85rem',
    padding: '0.35rem',
    background: '#27292E',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text)'
  };

  return (
    <div
      ref={previewRef}
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
          <h3>{editing ? 'Edit Location' : location.name}</h3>
          <button
            className="master-preview-pane-close"
            onClick={handleClose}
            title="Close preview"
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
            marginBottom: '0.75rem',
            marginTop: '0.5rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        {editing ? (
          /* ========== EDIT MODE ========== */
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                Name
              </div>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, width: '90%' }}
              />
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                Type
              </div>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                disabled={saving}
                style={{ ...inputStyle, width: '90%' }}
              >
                {LOCATION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text)', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editHasShelves}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setError(null);

                      // Unchecking an already-shelved location on disk is a
                      // destructive action: every placement's shelf index will
                      // be flattened to NULL on save. Confirm explicitly.
                      const wasConfiguredWithShelves = Boolean(
                        location && location.shelf_count && location.shelf_count > 0
                      );
                      if (!checked && wasConfiguredWithShelves) {
                        // Optimistically reflect the click so the dialog lines
                        // up with what the user just toggled, then revert if
                        // they cancel.
                        setEditHasShelves(false);
                        setEditShelfCount(0);
                        const confirmed = await showConfirm(
                          'All Shelf Locations for items in the location will be lost. They will just belong to the location without shelves now. Proceed?',
                          { title: 'Remove shelves?', danger: true, confirmLabel: 'Yes', cancelLabel: 'Cancel' }
                        );
                        if (!confirmed) {
                          setEditHasShelves(true);
                          setEditShelfCount(location.shelf_count);
                        }
                        return;
                      }

                      setEditHasShelves(checked);
                      setEditShelfCount(checked ? Math.max(1, parseInt(editShelfCount, 10) || 6) : 0);
                    }}
                    disabled={saving}
                  />
                  Has shelves
                </label>
                {editHasShelves && (
                  <input
                    type="number"
                    min="1"
                    max="15"
                    step="1"
                    aria-label="Number of shelves"
                    value={editShelfCount}
                    onChange={(e) => { setEditShelfCount(e.target.value); setError(null); }}
                    disabled={saving}
                    style={{ ...inputStyle, width: '70px', padding: '0.3rem 0.4rem' }}
                  />
                )}
                {editHasShelves && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text)', opacity: 0.7 }}>
                    top = 1, bottom = {Math.max(1, parseInt(editShelfCount, 10) || 1)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text)', opacity: 0.55, marginTop: '0.25rem' }}>
                Reducing shelf count is blocked while supplies sit on removed shelves — move them first.
              </div>
            </div>

            <div style={{ marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--text)', opacity: 0.8 }}>
              Position & Size <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(drag edges on map)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                  Top Y
                </div>
                <input
                  type="number"
                  value={editTopY}
                  onChange={(e) => setEditTopY(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                  Bottom Y
                </div>
                <input
                  type="number"
                  value={editBottomY}
                  onChange={(e) => setEditBottomY(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                  Left X
                </div>
                <input
                  type="number"
                  value={editLeftX}
                  onChange={(e) => setEditLeftX(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text)', opacity: 0.7, fontWeight: '600' }}>
                  Right X
                </div>
                <input
                  type="number"
                  value={editRightX}
                  onChange={(e) => setEditRightX(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                />
              </div>
            </div>

            <div className="master-preview-actions" style={{ marginTop: '1rem' }}>
              <div className="master-preview-actions-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="master-action-button"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="master-action-button"
                  style={{
                    flex: 1,
                    background: 'var(--accent)',
                    color: 'white'
                  }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ========== VIEW MODE ========== */
          <>
            <div className="master-preview-description">
              <strong>Type:</strong>
              <p style={{ margin: '0.25rem 0', textTransform: 'capitalize' }}>{typeDisplay}</p>
            </div>

            <div className="master-preview-locations">
              <strong>Position:</strong>
              <div className="master-preview-location-item">
                X: {location.x}, Y: {location.y}
              </div>
            </div>

            <div className="master-preview-locations" style={{ marginTop: '0.75rem' }}>
              <strong>Size:</strong>
              <div className="master-preview-location-item">
                Width: {location.width}, Height: {location.height}
              </div>
            </div>

            <div className="master-preview-locations" style={{ marginTop: '0.75rem' }}>
              <strong>Shelves:</strong>
              <div className="master-preview-location-item">
                {location.shelf_count && location.shelf_count > 0
                  ? `${location.shelf_count} (top = Shelf 1, bottom = Shelf ${location.shelf_count})`
                  : 'None'}
              </div>
            </div>

            {isProtected && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: 'rgba(255, 193, 7, 0.2)',
                border: '1px solid rgba(255, 193, 7, 0.5)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontSize: '0.85rem'
              }}>
                <strong>⚠ Protected Location</strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
                  This location is protected and cannot be deleted. Edit the database to change protection status.
                </p>
              </div>
            )}

            <div className="master-preview-actions" style={{ marginTop: '1rem' }}>
              <strong>Actions:</strong>
              <div className="master-preview-actions-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="master-action-button"
                  onClick={handleStartEdit}
                  title="Edit location"
                  style={{
                    flex: 1,
                    background: 'var(--accent)',
                    color: 'white'
                  }}
                >
                  Edit
                </button>
                <button 
                  className="master-action-button delete-button" 
                  onClick={handleDelete} 
                  title={isProtected ? "This location is protected" : "Delete location"}
                  disabled={deleting || isProtected}
                  style={isProtected ? { flex: 1, opacity: 0.5, cursor: 'not-allowed' } : { flex: 1 }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LocationPreview;
