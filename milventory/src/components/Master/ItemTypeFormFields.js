import React from 'react';

export const areNumberCustomFieldsValid = (customFields, customFieldDefinitions) => {
  const numberDefs = customFieldDefinitions.filter((d) => d.type === 'number');
  for (const d of numberDefs) {
    const value = customFields[d.name];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isNaN(n) || !Number.isFinite(n)) return false;
  }
  return true;
};

/** Keys listed on the type as required must each have a non-empty value (by field type). */
export const areLockedCustomFieldsFilled = (customFields, lockedKeys, customFieldDefinitions) => {
  if (!lockedKeys || lockedKeys.length === 0) return true;
  for (const key of lockedKeys) {
    const def = customFieldDefinitions.find((d) => d.name === key);
    const t = def ? def.type : 'text';
    const v = customFields[key];
    if (t === 'number') {
      if (v === undefined || v === null || v === '') return false;
      const n = Number(v);
      if (Number.isNaN(n) || !Number.isFinite(n)) return false;
    } else if (t === 'date') {
      if (v === undefined || v === null || String(v).trim() === '') return false;
    } else {
      if (v === undefined || v === null) return false;
      if (String(v).trim() === '') return false;
    }
  }
  return true;
};

/** Build API payload: every key in typeCustomFields is required; defaults only include nonempty presets. */
export const buildCustomFieldsPayload = (typeCustomFields, definitions) => {
  const locked_custom_field_keys = Object.keys(typeCustomFields).sort();
  const default_custom_fields = {};
  for (const k of locked_custom_field_keys) {
    const v = typeCustomFields[k];
    const def = definitions.find((d) => d.name === k);
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

export const typeCustomFieldsFromTypeRow = (t) => {
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

export const emptyForm = () => ({
  name: '',
  template_description: '',
  item_name_prefix: '',
  item_description_prefix: '',
  image: null,
  typeCustomFields: {},
  locked_category_ids: [],
  locked_team_names: [],
  is_unique: false,
  prevent_user_edit: false
});

export const TypeFormBody = ({
  form,
  setForm,
  imageLabel,
  onImagePick,
  customFieldDefinitions,
  addFieldDropdownOpen,
  setAddFieldDropdownOpen,
  addFieldDropdownRef,
  showPreventUserEditCheckbox = false,
  categoryOptions = [],
  teamOptions = []
}) => (
  <div className="type-form-fields">
    <input
      type="text"
      placeholder="Type name (shown in Type column)"
      value={form.name}
      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
    />
    <textarea
      placeholder="Template notes (optional)"
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
    <label
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        color: 'var(--muted)',
        minWidth: 0,
        maxWidth: '100%'
      }}
    >
      {imageLabel}
      <input type="file" accept="image/*" onChange={onImagePick} style={{ maxWidth: '100%' }} />
    </label>
    {form.image && (
      <div className="edit-form-image-container">
        <img src={form.image} alt="" />
      </div>
    )}

    <label
      style={{
        display: 'block',
        marginTop: '0.5rem',
        marginBottom: '0.25rem',
        fontSize: '0.85rem',
        color: 'var(--muted)'
      }}
    >
      Required categories
    </label>
    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
      Always applied to new items of this type; users may add more categories. Cannot be removed on the item.
    </p>
    {(form.locked_category_ids || []).map((cid) => {
      const c = categoryOptions.find((x) => Number(x.id) === Number(cid));
      const label = c ? c.name : `ID ${cid}`;
      return (
        <div
          key={cid}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.4rem',
            fontSize: '0.85rem'
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                locked_category_ids: (f.locked_category_ids || []).filter((x) => Number(x) !== Number(cid))
              }))
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
            title="Remove category"
          >
            ×
          </button>
        </div>
      );
    })}
    <select
      className="styled-select"
      value=""
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = '';
        if (!v) return;
        const id = Number(v);
        if (Number.isNaN(id)) return;
        setForm((f) => {
          const cur = f.locked_category_ids || [];
          if (cur.some((x) => Number(x) === id)) return f;
          return { ...f, locked_category_ids: [...cur, id].sort((a, b) => Number(a) - Number(b)) };
        });
      }}
      style={{ width: '100%', marginBottom: '0.25rem' }}
      aria-label="Add required category"
    >
      <option value="">+ Add category…</option>
      {categoryOptions
        .filter((c) => !(form.locked_category_ids || []).some((x) => Number(x) === Number(c.id)))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
    </select>

    <label
      style={{
        display: 'block',
        marginTop: '0.65rem',
        marginBottom: '0.25rem',
        fontSize: '0.85rem',
        color: 'var(--muted)'
      }}
    >
      Required teams
    </label>
    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
      Always applied to new items of this type; users may add more teams. Cannot be removed on the item.
    </p>
    {(form.locked_team_names || []).map((tn) => (
      <div
        key={tn}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.4rem',
          fontSize: '0.85rem',
          textTransform: 'capitalize'
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>{tn}</span>
        <button
          type="button"
          onClick={() =>
            setForm((f) => ({
              ...f,
              locked_team_names: (f.locked_team_names || []).filter((x) => x !== tn)
            }))
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
          title="Remove team"
        >
          ×
        </button>
      </div>
    ))}
    <select
      className="styled-select"
      value=""
      onChange={(e) => {
        const v = e.target.value;
        e.target.value = '';
        if (!v) return;
        setForm((f) => {
          const cur = f.locked_team_names || [];
          if (cur.includes(v)) return f;
          return { ...f, locked_team_names: [...cur, v].sort((a, b) => a.localeCompare(b)) };
        });
      }}
      style={{ width: '100%', marginBottom: '0.25rem' }}
      aria-label="Add required team"
    >
      <option value="">+ Add team…</option>
      {teamOptions
        .filter((t) => !(form.locked_team_names || []).includes(t))
        .map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
    </select>

    <label
      style={{
        display: 'block',
        marginTop: '0.5rem',
        marginBottom: '0.25rem',
        fontSize: '0.85rem',
        color: 'var(--muted)'
      }}
    >
      Required custom fields
    </label>
    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.5rem', lineHeight: 1.35 }}>
      Same as Create Item: add definitions below. Every listed field is required for this type. Enter a default to
      prefill new items; leave empty so users fill it in.
    </p>
    <div style={{ marginTop: '0.25rem' }}>
      {Object.entries(form.typeCustomFields || {}).map(([key, value]) => {
        const def = customFieldDefinitions.find((d) => d.name === key);
        const fieldType = def ? def.type : 'text';
        const displayValue = value === undefined || value === null ? '' : String(value);
        const cfId = `type-cf-${String(key).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        return (
          <div key={key} style={{ width: '100%', marginBottom: '0.65rem' }}>
            <label
              htmlFor={cfId}
              style={{
                display: 'block',
                marginBottom: '0.28rem',
                fontSize: '0.8rem',
                color: 'var(--muted)',
                fontWeight: 500
              }}
            >
              {key}
              <span style={{ fontWeight: 400, opacity: 0.85 }}> ({fieldType})</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
              {fieldType === 'text' && (
                <input
                  id={cfId}
                  type="text"
                  placeholder="Optional default for new items"
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
                  id={cfId}
                  type="number"
                  step="any"
                  placeholder="Optional default for new items"
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
                  id={cfId}
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
            {customFieldDefinitions.filter(
              (d) => !Object.prototype.hasOwnProperty.call(form.typeCustomFields || {}, d.name)
            ).length === 0 && (
              <div style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                No more fields to add
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        fontSize: '0.9rem',
        color: 'var(--text)',
        marginTop: '0.75rem',
        minWidth: 0,
        maxWidth: '100%'
      }}
    >
      <input
        type="checkbox"
        checked={form.is_unique}
        onChange={(e) => setForm((f) => ({ ...f, is_unique: e.target.checked }))}
        style={{ flexShrink: 0, marginTop: '0.2em' }}
      />
      <span style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
        Unique qty on map (each master item of this type may have at most 1 total quantity across locations)
      </span>
    </label>

    {showPreventUserEditCheckbox && (
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          fontSize: '0.9rem',
          color: 'var(--text)',
          marginTop: '0.5rem',
          minWidth: 0,
          maxWidth: '100%'
        }}
      >
        <input
          type="checkbox"
          checked={!!form.prevent_user_edit}
          onChange={(e) => setForm((f) => ({ ...f, prevent_user_edit: e.target.checked }))}
          style={{ flexShrink: 0, marginTop: '0.2em' }}
        />
        <span style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
          Mark as Admin (Prevent Users from Editing)
        </span>
      </label>
    )}
  </div>
);
