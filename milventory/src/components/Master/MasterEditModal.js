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

const MasterEditModal = ({ isOpen, onClose, itemName }) => {
  const { updateMasterItem, resolveMasterItem, masterInventoryItems } = useInventory();
  const { showAlert } = useBlockingDialog();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [categoryNameToId, setCategoryNameToId] = useState(new Map());
  const [categoryIdToName, setCategoryIdToName] = useState(new Map());
  const [customFields, setCustomFields] = useState({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [addFieldDropdownOpen, setAddFieldDropdownOpen] = useState(false);
  const addFieldDropdownRef = useRef(null);
  const nameInputRef = useRef(null);
  const [linkedType, setLinkedType] = useState(null);
  const [unlinkFromType, setUnlinkFromType] = useState(false);
  const [nameSuffix, setNameSuffix] = useState('');
  const [descSuffix, setDescSuffix] = useState('');

  const originalItem = itemName ? resolveMasterItem(itemName) : null;

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
      getCategories()
        .then(categories => {
          const categoryList = categories.map(c => typeof c === 'string' ? c : c.name);
          setAvailableCategories(categoryList);
          
          const nameToId = new Map();
          const idToName = new Map();
          categories.forEach(cat => {
            if (typeof cat === 'object' && cat.id && cat.name) {
              nameToId.set(cat.name, cat.id);
              idToName.set(cat.id, cat.name);
            }
          });
          setCategoryNameToId(nameToId);
          setCategoryIdToName(idToName);
        })
        .catch(err => {
          console.error('Failed to fetch categories:', err);
          setAvailableCategories([]);
        });
      
      getTeams()
        .then(teams => {
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
    if (!isOpen || !originalItem) return;

    setImage(originalItem.image || null);
    setImagePreview(originalItem.image || null);
    setCustomFields(originalItem.custom_fields || {});
    setAddFieldDropdownOpen(false);
    setSelectedTeams(originalItem.teams || []);
    setUnlinkFromType(false);
    setLinkedType(null);
    setNameSuffix('');
    setDescSuffix('');

    if (originalItem.supply_type_id) {
      setName(originalItem.name || '');
      setDescription(originalItem.description || '');
      api.getSupplyType(originalItem.supply_type_id)
        .then((t) => {
          setLinkedType(t);
          setCustomFields((prev) => {
            const cf = { ...prev };
            const locked = Array.isArray(t.locked_custom_field_keys) ? t.locked_custom_field_keys : [];
            const defs = t.default_custom_fields || {};
            for (const k of locked) {
              if (!(k in cf)) cf[k] = Object.prototype.hasOwnProperty.call(defs, k) ? defs[k] : '';
            }
            return cf;
          });
          const np = (t.item_name_prefix || '').trimEnd();
          const rawName = originalItem.name || '';
          if (np && rawName.startsWith(np)) {
            setNameSuffix(rawName.slice(np.length).replace(/^\s+/, ''));
          } else {
            setNameSuffix(rawName);
          }
          setName('');
          const dp = (t.item_description_prefix || '').trim();
          const rawD = originalItem.description || '';
          if (dp && String(rawD).startsWith(dp)) {
            setDescSuffix(String(rawD).slice(dp.length).replace(/^\s+/, ''));
          } else {
            setDescSuffix(rawD || '');
          }
          setDescription('');
        })
        .catch(() => {
          setLinkedType(null);
          setName(originalItem.name || '');
          setDescription(originalItem.description || '');
        });
    } else {
      setName(originalItem.name || '');
      setDescription(originalItem.description || '');
    }

    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [isOpen, originalItem]);

  const lockedFieldKeys =
    linkedType && !unlinkFromType && Array.isArray(linkedType.locked_custom_field_keys)
      ? linkedType.locked_custom_field_keys
      : [];

  const typePresetKeys =
    linkedType && !unlinkFromType && linkedType.default_custom_fields && typeof linkedType.default_custom_fields === 'object'
      ? new Set(Object.keys(linkedType.default_custom_fields))
      : new Set();

  const useTypePrefixUi = Boolean(
    originalItem?.supply_type_id && linkedType && !unlinkFromType
  );

  // Load categories when categoryIdToName mapping is ready
  useEffect(() => {
    if (isOpen && originalItem && categoryIdToName.size > 0) {
      // Load categories (convert IDs to names for display)
      if (originalItem.categories && originalItem.categories.length > 0) {
        const categoryNames = originalItem.categories
          .map(catId => categoryIdToName.get(catId))
          .filter(name => name !== undefined);
        setSelectedCategories(categoryNames);
      } else {
        setSelectedCategories([]);
      }
    }
  }, [isOpen, originalItem, categoryIdToName]);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      // Keep existing image if no new file selected
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      await showAlert('Image file size must be less than 10MB');
      e.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      await showAlert('Please select an image file');
      e.target.value = '';
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      setImage(base64Data);
      setImagePreview(base64Data);
    };
    reader.onerror = () => {
      showAlert('Error reading image file').then(() => {
        e.target.value = '';
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
  };

  const handleSave = async () => {
    let finalName;
    let finalDesc;
    if (unlinkFromType) {
      finalName = name.trim();
      finalDesc = description.trim() || null;
    } else if (useTypePrefixUi && linkedType) {
      finalName = joinPrefixSuffix(linkedType.item_name_prefix, nameSuffix).trim();
      const d = joinPrefixSuffix(linkedType.item_description_prefix || '', descSuffix).trim();
      finalDesc = d || null;
    } else {
      finalName = name.trim();
      finalDesc = description.trim() || null;
    }

    if (finalName && itemName) {
      if (finalName !== itemName && masterInventoryItems.has(finalName)) {
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
      
      const updatedItem = {
        name: finalName,
        description: finalDesc,
        image: image || null,
        teams: selectedTeams.length > 0 ? selectedTeams : [],
        categories: categoryIds.length > 0 ? categoryIds : [],
        custom_fields: customFields,
        locations: originalItem?.locations || []
      };
      if (unlinkFromType) {
        updatedItem.unlink_from_type = true;
      }

      updateMasterItem(itemName, updatedItem);
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

  if (!isOpen || !originalItem) return null;

  return (
    <div
      className="modal-overlay visible"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Edit Master Item</h3>
        {originalItem?.supply_type_id && !unlinkFromType && (
          <label style={{ display: 'block', marginBottom: '0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            <input
              type="checkbox"
              style={{ marginRight: '0.35rem' }}
              onChange={(e) => {
                if (!e.target.checked) return;
                if (linkedType) {
                  setName(joinPrefixSuffix(linkedType.item_name_prefix, nameSuffix).trim());
                  setDescription(joinPrefixSuffix(linkedType.item_description_prefix || '', descSuffix).trim());
                } else {
                  setName(originalItem.name || '');
                  setDescription(originalItem.description || '');
                }
                setUnlinkFromType(true);
                setLinkedType(null);
              }}
            />
            Unlink from type (keep current text; you can edit freely after saving)
          </label>
        )}
        {useTypePrefixUi ? (
          <>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Name
            </label>
            {(() => {
              const nameFix = linkedType?.item_name_prefix ?? '';
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
              const descFix = linkedType?.item_description_prefix ?? '';
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
            Image (optional, max 10MB)
          </label>
          {imagePreview && (
            <div style={{ marginBottom: '0.5rem' }}>
              <img
                src={imagePreview}
                alt="Current"
                style={{
                  maxWidth: '200px',
                  maxHeight: '200px',
                  borderRadius: '4px',
                  border: '1px solid var(--stroke)',
                  marginBottom: '0.5rem',
                }}
              />
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ marginBottom: '0.5rem' }}
          />
          {imagePreview && (
            <button
              type="button"
              onClick={handleRemoveImage}
              style={{
                background: 'var(--files)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Remove Image
            </button>
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
              !(useTypePrefixUi && linkedType
                ? joinPrefixSuffix(linkedType.item_name_prefix, nameSuffix).trim()
                : name.trim()) || !areNumberCustomFieldsValid(customFields, customFieldDefinitions)
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterEditModal;

