import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { getCategories, getTeams, api } from '../../api';
import { useBlockingDialog } from '../Common/BlockingDialogContext';

// Levenshtein distance for fuzzy search
const levenshteinDistance = (str1, str2) => {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
};

const joinPrefixSuffix = (prefix, suffix) => {
  const p = (prefix || '').trimEnd();
  const s = (suffix || '').trim();
  if (!p) return s;
  if (!s) return p;
  return `${p}${p.endsWith(' ') ? '' : ' '}${s}`;
};

// Validate that all number-type custom fields have a valid number (or are empty)
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

// Reusable tag dropdown with fuzzy search
const TagDropdown = ({ placeholder, selectedItems, availableItems, onSelect, onRemove, maxResults = 5, capitalize = false, onSearchChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unselected = availableItems.filter(item => !selectedItems.includes(item));

  // Compute display items: fuzzy top-N when searching, all when idle
  let displayItems;
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    const scored = unselected.map(item => {
      const itemLower = item.toLowerCase();
      const distance = levenshteinDistance(query, itemLower);
      const isSubstring = itemLower.includes(query);
      return { item, score: isSubstring ? distance - 10 : distance, distance };
    });
    scored.sort((a, b) => a.score !== b.score ? a.score - b.score : a.distance - b.distance);
    displayItems = scored.slice(0, maxResults).map(s => s.item);
  } else {
    displayItems = unselected;
  }

  const handleItemSelect = (item) => {
    onSelect(item);
    setSearchQuery('');
    onSearchChange?.('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Selected tags — 120% */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.42rem', minHeight: '1.5rem',
        padding: '0.42rem', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '4px', background: 'rgba(0,0,0,.2)', alignItems: 'center'
      }}>
        {selectedItems.length === 0 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
            {placeholder}
          </span>
        )}
        {selectedItems.map(item => (
          <span key={item} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.24rem',
            padding: '0.18rem 0.42rem', background: 'var(--accent)', color: 'white',
            borderRadius: '4px', fontSize: '0.8rem',
            ...(capitalize ? { textTransform: 'capitalize' } : {})
          }}>
            {item}
            <button type="button" onClick={() => onRemove(item)} style={{
              background: 'transparent', border: 'none', color: 'white', cursor: 'pointer',
              padding: '0', marginLeft: '0.25rem', fontSize: '1rem', lineHeight: '1',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }} title={`Remove ${item}`}>×</button>
          </span>
        ))}
      </div>

      {/* Search input / dropdown trigger — 132% (120% + 10%) */}
      <div
        className="tag-dropdown-trigger"
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
        style={{
          width: '100%', padding: '0.615rem 0.879rem', minHeight: '2.2rem',
          background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '4px',
          color: 'var(--text)', fontSize: '0.85rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', boxSizing: 'border-box'
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={unselected.length > 0 ? 'Search...' : 'All selected'}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setIsOpen(true); onSearchChange?.(e.target.value); }}
          onFocus={() => setIsOpen(true)}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'transparent', border: 'none', color: 'var(--text)',
            fontSize: '0.85rem', outline: 'none', width: '100%', cursor: 'pointer', lineHeight: 1.35, padding: 0, margin: 0
          }}
        />
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--muted)', flexShrink: 0 }}>▼</span>
      </div>

      {/* Dropdown list */}
      {isOpen && displayItems.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
          background: 'var(--bg, #1e1e2e)', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: '4px', maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
          boxShadow: '0 4px 12px rgba(0,0,0,.4)'
        }}>
          {displayItems.map(item => (
            <div
              key={item}
              onClick={() => handleItemSelect(item)}
              style={{
                padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem',
                color: 'var(--text)', transition: 'background 0.1s',
                ...(capitalize ? { textTransform: 'capitalize' } : {})
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MasterCreateModal = ({ isOpen, onClose }) => {
  const { createMasterItem, masterInventoryItems } = useInventory();
  const { showAlert } = useBlockingDialog();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /** User upload only; type template is shown separately and never sent as supply image */
  const [customImage, setCustomImage] = useState(null);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [categoryNameToId, setCategoryNameToId] = useState(new Map());
  const [customFields, setCustomFields] = useState({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [addFieldDropdownOpen, setAddFieldDropdownOpen] = useState(false);
  const addFieldDropdownRef = useRef(null);
  const nameInputRef = useRef(null);
  const [supplyTypes, setSupplyTypes] = useState([]);
  const [selectedSupplyTypeId, setSelectedSupplyTypeId] = useState('');
  const [nameSuffix, setNameSuffix] = useState('');
  const [descSuffix, setDescSuffix] = useState('');
  const [lockedFieldKeys, setLockedFieldKeys] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      if (addFieldDropdownRef.current && !addFieldDropdownRef.current.contains(e.target)) {
        setAddFieldDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch categories, teams, and custom field definitions when modal opens
  useEffect(() => {
    if (isOpen) {
      api.getCustomFieldDefinitions()
        .then(setCustomFieldDefinitions)
        .catch(() => setCustomFieldDefinitions([]));
      api.getSupplyTypes()
        .then(setSupplyTypes)
        .catch(() => setSupplyTypes([]));
      getCategories()
        .then(categories => {
          // Categories now come as objects with {id, name}
          const categoryList = categories.map(c => typeof c === 'string' ? c : c.name);
          setAvailableCategories(categoryList);
          
          // Build name-to-ID mapping
          const mapping = new Map();
          categories.forEach(cat => {
            if (typeof cat === 'object' && cat.id && cat.name) {
              mapping.set(cat.name, cat.id);
            }
          });
          setCategoryNameToId(mapping);
        })
        .catch(err => {
          console.error('Failed to fetch categories:', err);
          setAvailableCategories([]);
          setCategoryNameToId(new Map());
        });
      getTeams()
        .then(teams => {
          // Normalize to lowercase for frontend consistency
          const normalized = teams.map(t => t.toLowerCase());
          setAvailableTeams(normalized);
        })
        .catch(err => {
          console.error('Failed to fetch teams:', err);
          setAvailableTeams([]);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setCustomImage(null);
      setSelectedTeams([]);
      setSelectedCategories([]);
      setCategorySearchQuery('');
      setCustomFields({});
      setAddFieldDropdownOpen(false);
      setSelectedSupplyTypeId('');
      setNameSuffix('');
      setDescSuffix('');
      setLockedFieldKeys([]);
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
    if (!selectedSupplyTypeId || !t) {
      setLockedFieldKeys([]);
      return;
    }
    const defs = t.default_custom_fields || {};
    const locked = Array.isArray(t.locked_custom_field_keys) ? [...t.locked_custom_field_keys] : [];
    const cf = { ...defs };
    for (const k of locked) {
      if (!(k in cf)) cf[k] = '';
    }
    setCustomFields(cf);
    setLockedFieldKeys(locked);
    setNameSuffix('');
    setDescSuffix('');
    if (t.image) {
      setCustomImage(null);
    }
  }, [selectedSupplyTypeId, supplyTypes, isOpen]);

  const handleImageChange = async (e) => {
    const t = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
    if (t?.image) {
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      await showAlert('Image file size must be less than 10MB');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      await showAlert('Please select an image file');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      setCustomImage(base64Data);
    };
    reader.onerror = () => {
      showAlert('Error reading image file').then(() => {
        e.target.value = '';
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    const t = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
    if (t?.image) return;
    setCustomImage(null);
  };

  const handleSave = async () => {
    const selectedType = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
    const fullName = selectedSupplyTypeId && selectedType
      ? joinPrefixSuffix(selectedType.item_name_prefix, nameSuffix)
      : name.trim();
    const fullDescRaw = selectedSupplyTypeId && selectedType
      ? joinPrefixSuffix(selectedType.item_description_prefix || '', descSuffix)
      : description.trim();
    const fullDesc = fullDescRaw.trim() ? fullDescRaw.trim() : null;

    if (fullName.trim()) {
      if (masterInventoryItems.has(fullName.trim())) {
        await showAlert('An item with this name already exists. Please use a different name.');
        return;
      }
      if (!areNumberCustomFieldsValid(customFields, customFieldDefinitions)) {
        await showAlert('Please enter a valid number in all number fields (or leave them empty).');
        return;
      }

      // Convert category names to IDs
      const categoryIds = selectedCategories
        .map(catName => categoryNameToId.get(catName))
        .filter(id => id !== undefined);
      
      const typeHasTemplateImage = Boolean(selectedType?.image);
      const newItem = {
        name: fullName.trim(),
        description: fullDesc,
        image: typeHasTemplateImage ? null : customImage || null,
        teams: selectedTeams.length > 0 ? selectedTeams : undefined,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
        locations: [],
        supply_type_id: selectedSupplyTypeId ? Number(selectedSupplyTypeId) : undefined
      };
      
      createMasterItem(newItem);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!isOpen) return null;

  const selectedType = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
  const typeBlocksOwnImage = Boolean(selectedType?.image);
  const imagePreviewDisplay = typeBlocksOwnImage ? selectedType?.image ?? null : customImage;
  const typePresetKeys =
    selectedType?.default_custom_fields && typeof selectedType.default_custom_fields === 'object'
      ? new Set(Object.keys(selectedType.default_custom_fields))
      : new Set();

  return (
    <div
      className="modal-overlay visible"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal master-item-create-modal">
        <h3>Create Item</h3>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
          Item type (optional)
        </label>
        <select
          value={selectedSupplyTypeId}
          onChange={(e) => setSelectedSupplyTypeId(e.target.value)}
          style={{ marginBottom: '0.75rem', width: '100%', padding: '0.5rem' }}
        >
          <option value="">None</option>
          {supplyTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.is_unique ? ' (max 1 on map)' : ''}
            </option>
          ))}
        </select>
        {selectedSupplyTypeId ? (
          <>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Name
            </label>
            {(() => {
              const t = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
              const nameFix = t?.item_name_prefix ?? '';
              const hasNameFix = String(nameFix).length > 0;
              return hasNameFix ? (
                <div className="modal-field-composite" title={nameFix}>
                  <span className="modal-field-composite__prefix">{nameFix}</span>
                  <input
                    ref={nameInputRef}
                    type="text"
                    className="modal-field-composite__input"
                    placeholder="Must stay unique"
                    value={nameSuffix}
                    onChange={(e) => setNameSuffix(e.target.value)}
                  />
                </div>
              ) : (
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="Must stay unique"
                  value={nameSuffix}
                  onChange={(e) => setNameSuffix(e.target.value)}
                />
              );
            })()}
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Description
            </label>
            {(() => {
              const t = supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId));
              const descFix = t?.item_description_prefix ?? '';
              const hasDescFix = String(descFix).trim().length > 0;
              return hasDescFix ? (
                <div className="modal-field-composite modal-field-composite--stack">
                  <div className="modal-field-composite__prefix-block">{descFix}</div>
                  <textarea
                    className="modal-field-composite__textarea"
                    placeholder="Optional"
                    value={descSuffix}
                    onChange={(e) => setDescSuffix(e.target.value)}
                    rows={3}
                  />
                </div>
              ) : (
                <textarea
                  placeholder="Description (optional)"
                  value={descSuffix}
                  onChange={(e) => setDescSuffix(e.target.value)}
                  rows={3}
                />
              );
            })()}
          </>
        ) : (
          <>
            <input
              ref={nameInputRef}
              type="text"
              placeholder="Item name (required, must be unique)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="3"
            />
          </>
        )}

        <TagDropdown
          placeholder="Team Tags (Optional)"
          selectedItems={selectedTeams}
          availableItems={availableTeams}
          onSelect={(team) => setSelectedTeams(prev => [...prev, team])}
          onRemove={(team) => setSelectedTeams(prev => prev.filter(t => t !== team))}
          capitalize
        />

        <TagDropdown
          placeholder="Category Tags (Optional)"
          selectedItems={selectedCategories}
          availableItems={availableCategories}
          onSelect={(cat) => setSelectedCategories(prev => [...prev, cat])}
          onRemove={(cat) => setSelectedCategories(prev => prev.filter(c => c !== cat))}
          maxResults={5}
          onSearchChange={setCategorySearchQuery}
        />

        {/* Custom fields: dropdown to add; each added field is a full-width row with gray X to remove */}
        <div style={{ marginTop: '0.5rem' }}>
          {Object.entries(customFields).map(([key, value]) => {
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
                    placeholder={key}
                    value={displayValue}
                    disabled={typePresetKeys.has(key)}
                    onChange={(e) => setCustomFields(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ flex: 1, minWidth: 0, opacity: typePresetKeys.has(key) ? 0.75 : 1 }}
                  />
                )}
                {fieldType === 'number' && (
                  <input
                    type="number"
                    step="any"
                    placeholder={key}
                    value={displayValue}
                    disabled={typePresetKeys.has(key)}
                    onChange={(e) => setCustomFields(prev => ({ ...prev, [key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                    style={{ flex: 1, minWidth: 0, opacity: typePresetKeys.has(key) ? 0.75 : 1 }}
                  />
                )}
                {fieldType === 'date' && (
                  <input
                    type="date"
                    value={displayValue}
                    disabled={typePresetKeys.has(key)}
                    onChange={(e) => setCustomFields(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ flex: 1, minWidth: 0, opacity: typePresetKeys.has(key) ? 0.75 : 1 }}
                  />
                )}
                <button
                  type="button"
                  disabled={lockedFieldKeys.includes(key)}
                  onClick={() => setCustomFields(prev => { const n = { ...prev }; delete n[key]; return n; })}
                  style={{
                    flexShrink: 0, background: 'transparent', border: 'none', color: lockedFieldKeys.includes(key) ? '#444' : '#888', cursor: lockedFieldKeys.includes(key) ? 'not-allowed' : 'pointer',
                    padding: '0.25rem', fontSize: '1.25rem', lineHeight: 1
                  }}
                  title={lockedFieldKeys.includes(key) ? 'Required by type' : 'Remove field'}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div ref={addFieldDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAddFieldDropdownOpen(prev => !prev)}
              style={{
                padding: '0.5rem', fontSize: '0.85rem', background: 'rgba(0,0,0,.2)', color: 'var(--muted)', fontWeight: 400,
                border: '1px solid rgba(255,255,255,.1)', borderRadius: '6px', cursor: 'pointer', width: '100%', textAlign: 'left'
              }}
            >
              + Add custom field
            </button>
            {addFieldDropdownOpen && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '2px',
                  background: 'var(--panel)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0,0,0,.4)', maxHeight: '200px', overflowY: 'auto'
                }}
              >
                {customFieldDefinitions
                  .filter(d => !(d.name in customFields))
                  .map(d => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => {
                        setCustomFields(prev => ({ ...prev, [d.name]: d.type === 'number' ? '' : '' }));
                        setAddFieldDropdownOpen(false);
                      }}
                      style={{
                        display: 'block', width: '100%', padding: '0.5rem 0.75rem', textAlign: 'left',
                        background: 'none', border: 'none', color: 'var(--muted)', fontWeight: 400, cursor: 'pointer', fontSize: '0.85rem'
                      }}
                    >
                      {d.name} ({d.type})
                    </button>
                  ))}
                {customFieldDefinitions.filter(d => !(d.name in customFields)).length === 0 && (
                  <div style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                    No more fields to add
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            {typeBlocksOwnImage ? 'Image (from item type)' : 'Image (optional, max 10MB)'}
          </label>
          {typeBlocksOwnImage && (
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              This type supplies the image. Choose None or a type without an image to upload your own.
            </p>
          )}
          {!typeBlocksOwnImage && (
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ marginBottom: '0.5rem' }}
            />
          )}
          {imagePreviewDisplay && (
            <div className="edit-form-image-container" style={{ marginTop: '0.5rem' }}>
              <img src={imagePreviewDisplay} alt="Preview" />
              {!typeBlocksOwnImage && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: 'var(--files)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                  aria-label="Remove image"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="save"
            onClick={handleSave}
            disabled={
              !(selectedSupplyTypeId
                ? joinPrefixSuffix(
                    supplyTypes.find(x => String(x.id) === String(selectedSupplyTypeId))?.item_name_prefix,
                    nameSuffix
                  ).trim()
                : name.trim()) || !areNumberCustomFieldsValid(customFields, customFieldDefinitions)
            }
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterCreateModal;

