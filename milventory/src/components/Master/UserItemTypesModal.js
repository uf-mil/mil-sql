import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, getCategories, getTeams } from '../../api';
import { useInventory } from '../../context/InventoryContext';
import {
  areNumberCustomFieldsValid,
  buildCustomFieldsPayload,
  emptyForm,
  TypeFormBody
} from './ItemTypeFormFields';
import '../History/HistoryModal.css';
import './UserItemTypesModal.css';

function formatDefaultValue(v) {
  if (v === undefined || v === null || v === '') return '— (user fills in)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function TypeDetailPane({ typeRow, customFieldDefinitions, categoryOptions = [] }) {
  const locked = Array.isArray(typeRow.locked_custom_field_keys) ? typeRow.locked_custom_field_keys : [];
  const defaults = typeRow.default_custom_fields && typeof typeRow.default_custom_fields === 'object'
    ? typeRow.default_custom_fields
    : {};
  const lockedCatIds = Array.isArray(typeRow.locked_category_ids) ? typeRow.locked_category_ids : [];
  const lockedCatLabels = lockedCatIds.map((id) => {
    const c = categoryOptions.find((x) => Number(x.id) === Number(id));
    return c ? c.name : `ID ${id}`;
  });
  const lockedTeams = Array.isArray(typeRow.locked_team_names) ? typeRow.locked_team_names : [];

  return (
    <div className="user-types-detail user-types-right-inner">
      <h3>{typeRow.name}</h3>
      <dl className="user-types-detail-dl">
        <dt>Type name</dt>
        <dd>{typeRow.name}</dd>
        <dt>Template notes</dt>
        <dd>{typeRow.template_description?.trim() ? typeRow.template_description : '—'}</dd>
        <dt>Name prefix</dt>
        <dd>{typeRow.item_name_prefix?.trim() ? typeRow.item_name_prefix : '—'}</dd>
        <dt>Description prefix</dt>
        <dd>{typeRow.item_description_prefix?.trim() ? typeRow.item_description_prefix : '—'}</dd>
        <dt>Unique on map</dt>
        <dd>{typeRow.is_unique ? 'Yes' : 'No'}</dd>
        <dt>Admin-only edits</dt>
        <dd>{typeRow.prevent_user_edit ? 'Yes (only leaders can change this type)' : 'No'}</dd>
        <dt>Required categories</dt>
        <dd>{lockedCatLabels.length ? lockedCatLabels.join(', ') : '—'}</dd>
        <dt>Required teams</dt>
        <dd>{lockedTeams.length ? lockedTeams.join(', ') : '—'}</dd>
      </dl>
      {typeRow.image && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Default image</div>
          <img className="user-types-detail-image" src={typeRow.image} alt="" />
        </div>
      )}
      <div className="user-types-fields-section">
        <h4>Required custom fields</h4>
        {locked.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>None</p>
        ) : (
          locked.map((key) => {
            const def = customFieldDefinitions.find((d) => d.name === key);
            const fieldType = def ? def.type : 'unknown';
            const raw = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : undefined;
            return (
              <div key={key} className="user-types-field-row">
                <span className="user-types-field-name">{key}</span>
                <span className="user-types-field-meta">({fieldType})</span>
                <div className="user-types-field-default">Default: {formatDefaultValue(raw)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const UserItemTypesModal = ({ isOpen, onClose }) => {
  const { reloadMasterItems } = useInventory();
  const [types, setTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [panelMode, setPanelMode] = useState('idle');
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [addFieldDropdownOpen, setAddFieldDropdownOpen] = useState(false);
  const addFieldDropdownRef = useRef(null);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);

  const resetUi = useCallback(() => {
    setSearch('');
    setPanelMode('idle');
    setSelectedTypeId(null);
    setForm(emptyForm());
    setFormError(null);
    setLoadError(null);
    setAddFieldDropdownOpen(false);
  }, []);

  const loadTypes = useCallback(async (options = {}) => {
    const { silent = false } = options;
    if (!silent) setLoadingTypes(true);
    setLoadError(null);
    try {
      const data = await api.getSupplyTypes();
      setTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err.message || 'Failed to load types');
      setTypes([]);
    } finally {
      if (!silent) setLoadingTypes(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetUi();
      return;
    }
    loadTypes();
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
  }, [isOpen, loadTypes, resetUi]);

  useEffect(() => {
    const handler = (e) => {
      if (addFieldDropdownRef.current && !addFieldDropdownRef.current.contains(e.target)) {
        setAddFieldDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const pref = (t.item_name_prefix || '').toLowerCase();
      return name.includes(q) || pref.includes(q);
    });
  }, [types, search]);

  const selectedType = useMemo(
    () => (selectedTypeId != null ? types.find((t) => t.id === selectedTypeId) : null),
    [types, selectedTypeId]
  );

  const selectType = (id) => {
    setSelectedTypeId(id);
    setPanelMode('detail');
    setFormError(null);
    setAddFieldDropdownOpen(false);
  };

  const startCreate = () => {
    setSelectedTypeId(null);
    setPanelMode('create');
    setForm(emptyForm());
    setFormError(null);
    setAddFieldDropdownOpen(false);
  };

  const cancelCreate = () => {
    setPanelMode('idle');
    setForm(emptyForm());
    setFormError(null);
    setAddFieldDropdownOpen(false);
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Image must be under 10MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, image: reader.result }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Type name is required');
      return;
    }
    if (!areNumberCustomFieldsValid(form.typeCustomFields || {}, customFieldDefinitions)) {
      setFormError('Enter a valid number for number fields (or leave them empty).');
      return;
    }
    const { default_custom_fields, locked_custom_field_keys } = buildCustomFieldsPayload(
      form.typeCustomFields || {},
      customFieldDefinitions
    );
    try {
      setSubmitting(true);
      setFormError(null);
      const created = await api.createSupplyType({
        name: form.name.trim(),
        template_description: form.template_description.trim() || null,
        item_name_prefix: form.item_name_prefix.trim(),
        item_description_prefix: form.item_description_prefix.trim() || null,
        image: form.image || null,
        default_custom_fields,
        locked_custom_field_keys,
        is_unique: form.is_unique,
        locked_category_ids: [...(form.locked_category_ids || [])].sort((a, b) => Number(a) - Number(b)),
        locked_team_names: form.locked_team_names || []
      });
      await reloadMasterItems();
      try {
        localStorage.setItem('milventory-master-catalog-bump', String(Date.now()));
      } catch (_) {
        /* ignore */
      }
      await loadTypes({ silent: true });
      const newId = created?.id;
      if (newId != null) {
        setSelectedTypeId(newId);
        setPanelMode('detail');
      } else {
        setPanelMode('idle');
      }
      setForm(emptyForm());
    } catch (err) {
      setFormError(err.message || 'Failed to create type');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="history-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div className="history-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="user-types-title">
        <div className="history-modal-header">
          <h2 id="user-types-title">Item types</h2>
          <button type="button" className="history-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loadError && (
          <div className="history-error" style={{ margin: 0 }}>
            {loadError}
          </div>
        )}

        <div className="user-types-modal-body">
          <div className="user-types-left">
            <div className="user-types-search">
              <input
                type="search"
                placeholder="Search types…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search item types"
              />
            </div>
            <div className="user-types-list">
              {loadingTypes && types.length === 0 ? (
                <div className="user-types-loading">Loading…</div>
              ) : filteredTypes.length === 0 ? (
                <div className="user-types-idle">No matching types.</div>
              ) : (
                filteredTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`user-types-list-item ${
                      panelMode === 'detail' && selectedTypeId === t.id ? 'selected' : ''
                    }`}
                    onClick={() => selectType(t.id)}
                  >
                    <span className="user-types-list-name">{t.name}</span>
                    <span className="user-types-list-prefix" title={t.item_name_prefix || ''}>
                      {t.item_name_prefix?.trim() ? `Prefix: ${t.item_name_prefix}` : 'No prefix'}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="user-types-left-footer">
              <button type="button" className="user-types-create-btn" onClick={startCreate}>
                Create type
              </button>
            </div>
          </div>

          <div className="user-types-right">
            {panelMode === 'idle' && (
              <div className="user-types-idle user-types-right-inner">
                Select a type from the list, or use Create type to add one.
              </div>
            )}
            {panelMode === 'detail' && selectedType && (
              <TypeDetailPane
                typeRow={selectedType}
                customFieldDefinitions={customFieldDefinitions}
                categoryOptions={categoryOptions}
              />
            )}
            {panelMode === 'detail' && !selectedType && !loadingTypes && (
              <div className="user-types-idle user-types-right-inner">Type not found. Try refreshing.</div>
            )}
            {panelMode === 'create' && (
              <div className="modal user-types-type-form user-types-right-inner">
                <h3 style={{ margin: '0 0 0.25rem 0' }}>New item type</h3>
                {formError && <div style={{ color: '#f88', fontSize: '0.85rem' }}>{formError}</div>}
                <form onSubmit={handleCreateSubmit}>
                  <TypeFormBody
                    form={form}
                    setForm={setForm}
                    imageLabel="Default image (optional)"
                    onImagePick={handleImagePick}
                    customFieldDefinitions={customFieldDefinitions}
                    addFieldDropdownOpen={addFieldDropdownOpen}
                    setAddFieldDropdownOpen={setAddFieldDropdownOpen}
                    addFieldDropdownRef={addFieldDropdownRef}
                    categoryOptions={categoryOptions}
                    teamOptions={teamOptions}
                  />
                  <div className="modal-actions">
                    <button type="button" className="cancel" onClick={cancelCreate}>
                      Cancel
                    </button>
                    <button type="submit" className="save" disabled={submitting}>
                      Create type
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserItemTypesModal;
