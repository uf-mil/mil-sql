import React, { useState, useEffect, useCallback, useRef } from 'react';
import { admin, api } from '../../api';
import { useBlockingDialog } from '../Common/BlockingDialogContext';
import { useInventory } from '../../context/InventoryContext';

const areNumberCustomFieldsValid = (customFields, customFieldDefinitions) => {
  const numberDefs = customFieldDefinitions.filter(d => d.type === 'number');
  for (const d of numberDefs) {
    const value = customFields[d.name];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isNaN(n) || !Number.isFinite(n)) return false;
  }
  return true;
};

/** Build API payload: every key in typeCustomFields is required; defaults only include nonempty presets. */
const buildCustomFieldsPayload = (typeCustomFields, definitions) => {
  const locked_custom_field_keys = Object.keys(typeCustomFields).sort();
  const default_custom_fields = {};
  for (const k of locked_custom_field_keys) {
    const v = typeCustomFields[k];
    const def = definitions.find(d => d.name === k);
    const t = def ? def.type : 'text';
    if (t === 'number') {
      if (v !== '' && v !== null && v !== undefined) {
        const n = Number(v);
        if (!Number.isNaN(n) && Number.isFinite(n)) default_custom_fields[k] = n;
      }
    } else if (v !== '' && v !== null && v !== undefined) {
      default_custom_fields[k] = v;
    }
  }
  return { default_custom_fields, locked_custom_field_keys };
};

const typeCustomFieldsFromTypeRow = (t) => {
  const locked = Array.isArray(t.locked_custom_field_keys) ? t.locked_custom_field_keys : [];
  const defs = t.default_custom_fields || {};
  const cf = {};
  for (const k of locked) {
    const raw = Object.prototype.hasOwnProperty.call(defs, k) ? defs[k] : undefined;
    if (raw === undefined || raw === null) cf[k] = '';
    else if (typeof raw === 'number') cf[k] = raw;
    else cf[k] = String(raw);
  }
  return cf;
};

const emptyForm = () => ({
  name: '',
  template_description: '',
  item_name_prefix: '',
  item_description_prefix: '',
  image: null,
  typeCustomFields: {},
  is_unique: false
});

const TypeFormBody = ({
  form,
  setForm,
  imageLabel,
  onImagePick,
  customFieldDefinitions,
  addFieldDropdownOpen,
  setAddFieldDropdownOpen,
  addFieldDropdownRef
}) => (
  <>
    <input
      type="text"
      placeholder="Type name (shown in Type column)"
      value={form.name}
      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
    />
    <textarea
      placeholder="Template notes (admin only, optional)"
      value={form.template_description}
      onChange={(e) => setForm((f) => ({ ...f, template_description: e.target.value }))}
      rows={2}
    />
    <input
      type="text"
      placeholder="Item name prefix (readonly on item; user adds suffix)"
      value={form.item_name_prefix}
      onChange={(e) => setForm((f) => ({ ...f, item_name_prefix: e.target.value }))}
    />
    <input
      type="text"
      placeholder="Item description prefix (optional)"
      value={form.item_description_prefix}
      onChange={(e) => setForm((f) => ({ ...f, item_description_prefix: e.target.value }))}
    />
    <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
      {imageLabel}
      <input
        type="file"
        accept="image/*"
        onChange={onImagePick}
        style={{ marginLeft: '0.5rem' }}
      />
    </label>
    {form.image && (
      <div className="edit-form-image-container">
        <img src={form.image} alt="" />
      </div>
    )}

    <label style={{ display: 'block', marginTop: '0.5rem', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
      Required custom fields
    </label>
    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
      Same as Create Item: add definitions below. Every listed field is required for this type. Enter a default to prefill new items; leave empty so users fill it in.
    </p>
    <div style={{ marginTop: '0.25rem' }}>
      {Object.entries(form.typeCustomFields || {}).map(([key, value]) => {
        const def = customFieldDefinitions.find(d => d.name === key);
        const fieldType = def ? def.type : 'text';
        const displayValue = value === undefined || value === null ? '' : String(value);
        return (
          <div
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', marginBottom: '0.5rem' }}
          >
            {fieldType === 'text' && (
              <input
                type="text"
                placeholder={`${key} (optional default)`}
                value={displayValue}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    typeCustomFields: { ...f.typeCustomFields, [key]: e.target.value }
                  }))
                }
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
            {fieldType === 'number' && (
              <input
                type="number"
                step="any"
                placeholder={`${key} (optional default)`}
                value={displayValue}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    typeCustomFields: {
                      ...f.typeCustomFields,
                      [key]: e.target.value === '' ? '' : Number(e.target.value)
                    }
                  }))
                }
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
            {fieldType === 'date' && (
              <input
                type="date"
                value={displayValue}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    typeCustomFields: { ...f.typeCustomFields, [key]: e.target.value }
                  }))
                }
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
            <button
              type="button"
              onClick={() =>
                setForm((f) => {
                  const n = { ...f.typeCustomFields };
                  delete n[key];
                  return { ...f, typeCustomFields: n };
                })
              }
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                padding: '0.25rem',
                fontSize: '1.25rem',
                lineHeight: 1
              }}
              title="Remove field"
            >
              ×
            </button>
          </div>
        );
      })}
      <div ref={addFieldDropdownRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setAddFieldDropdownOpen((prev) => !prev)}
          style={{
            padding: '0.5rem',
            fontSize: '0.85rem',
            background: 'rgba(0,0,0,.2)',
            color: 'var(--muted)',
            fontWeight: 400,
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: '6px',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left'
          }}
        >
          + Add custom field
        </button>
        {addFieldDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10,
              marginTop: '2px',
              background: 'var(--panel)',
              border: '1px solid rgba(255,255,255,.15)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              maxHeight: '200px',
              overflowY: 'auto'
            }}
          >
            {customFieldDefinitions
              .filter((d) => !Object.prototype.hasOwnProperty.call(form.typeCustomFields || {}, d.name))
              .map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      typeCustomFields: { ...(f.typeCustomFields || {}), [d.name]: '' }
                    }));
                    setAddFieldDropdownOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    fontWeight: 400,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {d.name} ({d.type})
                </button>
              ))}
            {customFieldDefinitions.filter((d) => !Object.prototype.hasOwnProperty.call(form.typeCustomFields || {}, d.name))
              .length === 0 && (
              <div style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                No more fields to add
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)', marginTop: '0.75rem' }}>
      <input
        type="checkbox"
        checked={form.is_unique}
        onChange={(e) => setForm((f) => ({ ...f, is_unique: e.target.checked }))}
      />
      Unique qty on map (each master item of this type may have at most 1 total quantity across locations)
    </label>
  </>
);

const ItemTypesTable = () => {
  const { showConfirm } = useBlockingDialog();
  const { reloadMasterItems } = useInventory();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [addFieldDropdownOpen, setAddFieldDropdownOpen] = useState(false);
  const addFieldDropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (addFieldDropdownRef.current && !addFieldDropdownRef.current.contains(e.target)) {
        setAddFieldDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSupplyTypes();
      setTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      setTypes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  useEffect(() => {
    if (!showAddModal && editingId == null) return;
    api
      .getCustomFieldDefinitions()
      .then(setCustomFieldDefinitions)
      .catch(() => setCustomFieldDefinitions([]));
  }, [showAddModal, editingId]);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setForm(emptyForm());
    setError(null);
    setAddFieldDropdownOpen(false);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingId(null);
    setEditForm(null);
    setError(null);
    setAddFieldDropdownOpen(false);
  }, []);

  const handleAddOverlayClick = (e) => {
    if (e.target === e.currentTarget) closeAddModal();
  };

  const handleEditOverlayClick = (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  };

  const handleModalKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (showAddModal) closeAddModal();
      if (editingId != null) closeEditModal();
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Type name is required');
      return;
    }
    if (!areNumberCustomFieldsValid(form.typeCustomFields || {}, customFieldDefinitions)) {
      setError('Enter a valid number for number fields (or leave them empty).');
      return;
    }
    const { default_custom_fields, locked_custom_field_keys } = buildCustomFieldsPayload(
      form.typeCustomFields || {},
      customFieldDefinitions
    );
    try {
      setSubmitting(true);
      setError(null);
      await admin.createSupplyType({
        name: form.name.trim(),
        template_description: form.template_description.trim() || null,
        item_name_prefix: form.item_name_prefix.trim(),
        item_description_prefix: form.item_description_prefix.trim() || null,
        image: form.image || null,
        default_custom_fields,
        locked_custom_field_keys,
        is_unique: form.is_unique
      });
      closeAddModal();
      await loadTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t) => {
    setError(null);
    setEditingId(t.id);
    setEditForm({
      name: t.name,
      template_description: t.template_description || '',
      item_name_prefix: t.item_name_prefix || '',
      item_description_prefix: t.item_description_prefix || '',
      image: t.image || null,
      typeCustomFields: typeCustomFieldsFromTypeRow(t),
      is_unique: !!t.is_unique
    });
  };

  const handleUpdate = async () => {
    if (editingId == null || !editForm) return;
    if (!editForm.name.trim()) {
      setError('Type name is required');
      return;
    }
    if (!areNumberCustomFieldsValid(editForm.typeCustomFields || {}, customFieldDefinitions)) {
      setError('Enter a valid number for number fields (or leave them empty).');
      return;
    }
    const { default_custom_fields, locked_custom_field_keys } = buildCustomFieldsPayload(
      editForm.typeCustomFields || {},
      customFieldDefinitions
    );
    try {
      setError(null);
      await admin.updateSupplyType(editingId, {
        name: editForm.name.trim(),
        template_description: editForm.template_description.trim() || null,
        item_name_prefix: editForm.item_name_prefix.trim(),
        item_description_prefix: editForm.item_description_prefix.trim() || null,
        image: editForm.image,
        default_custom_fields,
        locked_custom_field_keys,
        is_unique: editForm.is_unique
      });
      await reloadMasterItems();
      try {
        localStorage.setItem('milventory-master-catalog-bump', String(Date.now()));
      } catch (_) { /* ignore */ }
      closeEditModal();
      await loadTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const ok = await showConfirm(
      'Delete this item type? Supplies linked to it will keep their data but will no longer be tied to this type.',
      { title: 'Delete item type', danger: true, confirmLabel: 'Delete', cancelLabel: 'Cancel' }
    );
    if (!ok) return;
    try {
      setError(null);
      await admin.deleteSupplyType(id);
      await reloadMasterItems();
      try {
        localStorage.setItem('milventory-master-catalog-bump', String(Date.now()));
      } catch (_) { /* ignore */ }
      await loadTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImagePick = (e, isEdit) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (isEdit && editForm) {
        setEditForm((prev) => ({ ...prev, image: reader.result }));
      } else {
        setForm((prev) => ({ ...prev, image: reader.result }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (loading && types.length === 0) {
    return <div className="master-table-empty">Loading item types...</div>;
  }

  return (
    <div className="master-table-content" style={{ padding: '0.5rem' }}>
      {error && !showAddModal && editingId == null && (
        <div style={{ color: '#f88', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{error}</div>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className="add-item-button"
          onClick={() => {
            setError(null);
            setForm(emptyForm());
            setShowAddModal(true);
          }}
        >
          + Add item type
        </button>
      </div>

      {showAddModal && (
        <div
          className="modal-overlay visible"
          onClick={handleAddOverlayClick}
          onKeyDown={handleModalKeyDown}
          role="presentation"
        >
          <div
            className="modal"
            style={{ maxWidth: '520px', maxHeight: 'min(90vh, 800px)', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="item-type-add-title"
          >
            <h3 id="item-type-add-title">Add item type</h3>
            {error && <div style={{ color: '#f88', fontSize: '0.85rem' }}>{error}</div>}
            <form onSubmit={handleAdd}>
              <TypeFormBody
                form={form}
                setForm={setForm}
                imageLabel="Default image (optional)"
                onImagePick={(e) => handleImagePick(e, false)}
                customFieldDefinitions={customFieldDefinitions}
                addFieldDropdownOpen={addFieldDropdownOpen}
                setAddFieldDropdownOpen={setAddFieldDropdownOpen}
                addFieldDropdownRef={addFieldDropdownRef}
              />
              <div className="modal-actions">
                <button type="button" className="cancel" onClick={closeAddModal}>
                  Cancel
                </button>
                <button type="submit" className="save" disabled={submitting}>
                  Create type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingId != null && editForm && (
        <div
          className="modal-overlay visible"
          onClick={handleEditOverlayClick}
          onKeyDown={handleModalKeyDown}
          role="presentation"
        >
          <div
            className="modal"
            style={{ maxWidth: '520px', maxHeight: 'min(90vh, 800px)', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="item-type-edit-title"
          >
            <h3 id="item-type-edit-title">Edit item type</h3>
            {error && <div style={{ color: '#f88', fontSize: '0.85rem' }}>{error}</div>}
            <TypeFormBody
              form={editForm}
              setForm={setEditForm}
              imageLabel="Replace image (optional)"
              onImagePick={(e) => handleImagePick(e, true)}
              customFieldDefinitions={customFieldDefinitions}
              addFieldDropdownOpen={addFieldDropdownOpen}
              setAddFieldDropdownOpen={setAddFieldDropdownOpen}
              addFieldDropdownRef={addFieldDropdownRef}
            />
            <div className="modal-actions">
              <button type="button" className="cancel" onClick={closeEditModal}>
                Cancel
              </button>
              <button type="button" className="save" onClick={handleUpdate}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {types.length === 0 ? (
        <div className="master-table-empty">No item types yet.</div>
      ) : (
        <table className="master-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th title="Each catalog item may have at most 1 total quantity across map locations">Is unique</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.item_name_prefix}>
                  {t.item_name_prefix || '—'}
                </td>
                <td title="Each item of this type is limited to one total quantity on the map">{t.is_unique ? 'Yes' : 'No'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    style={{
                      marginRight: '0.5rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      background: '#444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      background: '#dc3545',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ItemTypesTable;
