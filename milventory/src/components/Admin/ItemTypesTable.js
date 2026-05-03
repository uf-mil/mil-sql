import React, { useState, useEffect, useCallback, useRef } from 'react';
import { admin, api, getCategories, getTeams } from '../../api';
import { useBlockingDialog } from '../Common/BlockingDialogContext';
import { useInventory } from '../../context/InventoryContext';
import {
  areNumberCustomFieldsValid,
  buildCustomFieldsPayload,
  typeCustomFieldsFromTypeRow,
  emptyForm,
  TypeFormBody
} from '../Master/ItemTypeFormFields';

const ItemTypesTable = () => {
  const { showConfirm } = useBlockingDialog();
  const { reloadMasterItems, setError: setToastError } = useInventory();
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
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);

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
    getCategories()
      .then((cats) => {
        const opts = (cats || [])
          .filter((c) => c && typeof c === 'object' && c.id != null && c.name)
          .map((c) => ({ id: c.id, name: c.name }));
        setCategoryOptions(opts);
      })
      .catch(() => setCategoryOptions([]));
    getTeams()
      .then((teams) => setTeamOptions((teams || []).map((t) => String(t).toLowerCase())))
      .catch(() => setTeamOptions([]));
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
        is_unique: form.is_unique,
        prevent_user_edit: !!form.prevent_user_edit,
        locked_category_ids: [...(form.locked_category_ids || [])].sort((a, b) => Number(a) - Number(b)),
        locked_team_names: form.locked_team_names || []
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
      is_unique: !!t.is_unique,
      prevent_user_edit: !!t.prevent_user_edit,
      locked_category_ids: Array.isArray(t.locked_category_ids) ? [...t.locked_category_ids] : [],
      locked_team_names: Array.isArray(t.locked_team_names)
        ? t.locked_team_names.map((x) => String(x).toLowerCase())
        : []
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
      await api.updateSupplyType(editingId, {
        name: editForm.name.trim(),
        template_description: editForm.template_description.trim() || null,
        item_name_prefix: editForm.item_name_prefix.trim(),
        item_description_prefix: editForm.item_description_prefix.trim() || null,
        image: editForm.image,
        default_custom_fields,
        locked_custom_field_keys,
        is_unique: editForm.is_unique,
        prevent_user_edit: !!editForm.prevent_user_edit,
        locked_category_ids: [...(editForm.locked_category_ids || [])].sort((a, b) => Number(a) - Number(b)),
        locked_team_names: editForm.locked_team_names || []
      });
      await reloadMasterItems();
      try {
        localStorage.setItem('milventory-master-catalog-bump', String(Date.now()));
      } catch (_) { /* ignore */ }
      closeEditModal();
      await loadTypes();
    } catch (err) {
      const message = err.message || 'Failed to update type';
      if (message.includes('Cannot mark this item type as unique')) {
        setToastError(message);
      } else {
        setError(message);
      }
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
                showPreventUserEditCheckbox
                categoryOptions={categoryOptions}
                teamOptions={teamOptions}
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
              showPreventUserEditCheckbox
              categoryOptions={categoryOptions}
              teamOptions={teamOptions}
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
              <th title="Yes = non-leaders may update this type; No = only leaders may update it">
                User Editable
              </th>
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
                <td
                  title={
                    t.prevent_user_edit
                      ? 'Only leaders may update this type'
                      : 'Non-leaders may update this type'
                  }
                >
                  {t.prevent_user_edit ? 'No' : 'Yes'}
                </td>
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
