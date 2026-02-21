import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/InventoryContext';
import { getCategories, getTeams } from '../api';

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
      {/* Selected tags */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', minHeight: '2rem',
        padding: '0.5rem', border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '4px', background: 'rgba(0,0,0,.2)', alignItems: 'center'
      }}>
        {selectedItems.length === 0 && (
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.85rem' }}>
            {placeholder}
          </span>
        )}
        {selectedItems.map(item => (
          <span key={item} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            padding: '0.25rem 0.5rem', background: 'var(--accent)', color: 'white',
            borderRadius: '4px', fontSize: '0.85rem',
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

      {/* Search input / dropdown trigger */}
      <div
        onClick={() => { setIsOpen(true); inputRef.current?.focus(); }}
        style={{
          width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,.3)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: '4px',
          color: 'var(--text)', fontSize: '0.9rem', cursor: 'pointer',
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
            fontSize: '0.9rem', outline: 'none', width: '100%', cursor: 'pointer'
          }}
        />
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', flexShrink: 0 }}>▼</span>
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

const MasterAddModal = ({ isOpen, onClose }) => {
  const { addMasterItem, masterInventoryItems } = useInventory();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [categoryNameToId, setCategoryNameToId] = useState(new Map());
  const nameInputRef = useRef(null);

  // Fetch categories and teams on mount and when modal opens
  useEffect(() => {
    if (isOpen) {
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
          console.log('Fetched teams from API:', teams);
          // Normalize to lowercase for frontend consistency
          const normalized = teams.map(t => t.toLowerCase());
          console.log('Normalized teams:', normalized);
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
      setImage(null);
      setImagePreview(null);
      setSelectedTeams([]);
      setSelectedCategories([]);
      setCategorySearchQuery('');
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setImage(null);
      setImagePreview(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Image file size must be less than 10MB');
      e.target.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target.result;
      setImage(base64Data);
      setImagePreview(base64Data);
    };
    reader.onerror = () => {
      alert('Error reading image file');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
  };

  const handleSave = () => {
    if (name.trim()) {
      if (masterInventoryItems.has(name.trim())) {
        alert('An item with this name already exists. Please use a different name.');
        return;
      }

      // Convert category names to IDs
      const categoryIds = selectedCategories
        .map(catName => categoryNameToId.get(catName))
        .filter(id => id !== undefined);
      
      const newItem = {
        name: name.trim(),
        description: description.trim() || null,
        image: image || null,
        teams: selectedTeams.length > 0 ? selectedTeams : undefined,
        categories: categoryIds.length > 0 ? categoryIds : undefined,
        locations: []
      };
      
      addMasterItem(newItem);
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

  return (
    <div
      className="modal-overlay visible"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal">
        <h3>Add Master Item</h3>
        {teamSearchQuery.trim() && (() => {
          const query = teamSearchQuery.toLowerCase();
          const unselected = availableTeams.filter(t => !selectedTeams.includes(t));
          const scored = unselected.map(item => {
            const itemLower = item.toLowerCase();
            const distance = levenshteinDistance(query, itemLower);
            const isSubstring = itemLower.includes(query);
            return { item, score: isSubstring ? distance - 10 : distance, distance };
          });
          scored.sort((a, b) => a.score !== b.score ? a.score - b.score : a.distance - b.distance);
          const matches = scored.slice(0, 5);
          
          return (
            <div style={{
              padding: '0.75rem', background: 'rgba(0,0,0,.3)',
              border: '1px solid rgba(255,255,255,.1)', borderRadius: '4px',
              fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text)' }}>
                Team Search Debug:
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Query:</strong> "{teamSearchQuery}"
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Selected:</strong> {selectedTeams.length > 0 ? selectedTeams.join(', ') : 'None'}
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Available:</strong> {unselected.length} team{unselected.length !== 1 ? 's' : ''} remaining
              </div>
              {matches.length > 0 && (
                <div>
                  <strong>Top Matches:</strong>
                  {matches.map(({ item, distance }, index) => (
                    <div key={item} style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                      {index + 1}. {item} (distance: {distance})
                    </div>
                  ))}
                </div>
              )}
              {matches.length === 0 && unselected.length > 0 && (
                <div style={{ color: 'var(--muted)' }}>No fuzzy matches found.</div>
              )}
            </div>
          );
        })()}
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

        <TagDropdown
          placeholder="Team Tags (Optional)"
          selectedItems={selectedTeams}
          availableItems={availableTeams}
          onSelect={(team) => setSelectedTeams(prev => [...prev, team])}
          onRemove={(team) => setSelectedTeams(prev => prev.filter(t => t !== team))}
          capitalize
          onSearchChange={setTeamSearchQuery}
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

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Image (optional, max 10MB)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            style={{ marginBottom: '0.5rem' }}
          />
          {imagePreview && (
            <div style={{ marginTop: '0.5rem', position: 'relative', display: 'inline-block' }}>
              <img
                src={imagePreview}
                alt="Preview"
                style={{
                  maxWidth: '200px',
                  maxHeight: '200px',
                  borderRadius: '4px',
                  border: '1px solid var(--stroke)',
                }}
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
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
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" className="save" onClick={handleSave} disabled={!name.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterAddModal;
