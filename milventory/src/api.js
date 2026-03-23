/**
 * API client for milventory backend.
 */
// Use relative path in development (goes through proxy) or absolute URL if specified
const API_BASE = process.env.REACT_APP_API_URL || '/api';

// Authentication helpers
export const auth = {
  /**
   * Login with email and password.
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User info on success
   */
  login: async (email, password) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies for session-based auth
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    return data;
  },

  /**
   * Logout (destroy session).
   * @returns {Promise<void>}
   */
  logout: async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  /**
   * Get current user info from session.
   * @returns {Promise<Object>} User info if authenticated, null if not
   */
  getCurrentUser: async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
      });
      
      if (response.status === 401) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error('Failed to get current user');
      }
      
      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  },
};

// Helper to add auth headers to requests
const authHeaders = () => ({
  'Content-Type': 'application/json',
});

/** Attach status + error_type from JSON error body (for history undo/discard UX). */
const apiJsonError = (r, data) => {
  const error = new Error(data.error || 'Request failed');
  error.response = r;
  error.status = r.status;
  if (data.error_type != null) error.error_type = data.error_type;
  return error;
};

/** True when undo failed in a way that allows "remove from history only". */
export function historyUndoAllowsDiscard(err) {
  if (!err || err.error_type == null) return false;
  return ['LOCATION_DELETED', 'SUPPLY_DELETED', 'UNDO_IMPOSSIBLE', 'MOVE_PAIR_MISSING'].includes(
    err.error_type
  );
}

// Helper to detect and handle conflict errors
export const handleApiError = async (error) => {
  if (error.response) {
    const { status } = error.response;
    
    // Try to get error data from response
    try {
      const data = await error.response.json();
      if (status === 404 && data.error_type === 'SUPPLY_DELETED') {
        return {
          isConflict: true,
          type: 'SUPPLY_DELETED',
          message: data.message || 'This item was deleted by another user. Please refresh the page to see the latest data.',
          supplyName: data.supply_name,
          supplyId: data.supply_id
        };
      }
      
      return {
        isConflict: false,
        message: data.error || error.message || 'An error occurred'
      };
    } catch (jsonError) {
      // If JSON parsing fails, return basic error
      return {
        isConflict: false,
        message: error.message || 'An error occurred'
      };
    }
  }
  
  return {
    isConflict: false,
    message: error.message || 'An error occurred'
  };
};

// API functions
export const api = {
  // Supplies (catalog/reference)
  getSupplies: () => 
    fetch(`${API_BASE}/supplies`, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  getSupply: (id) => 
    fetch(`${API_BASE}/supplies/${id}`, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  createSupply: (item) => 
    fetch(`${API_BASE}/supplies`, { 
      method: 'POST', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(item) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  updateSupply: (id, item) => 
    fetch(`${API_BASE}/supplies/${id}`, { 
      method: 'PUT', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(item) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  deleteSupply: (id) => 
    fetch(`${API_BASE}/supplies/${id}`, { 
      method: 'DELETE', 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        throw new Error('Authentication required');
      }
      if (r.status === 204) {
        return null;
      }
      return r.json();
    }),

  // Custom field definitions (for Create/Edit item modal dropdown)
  getCustomFieldDefinitions: () =>
    fetch(`${API_BASE}/custom-field-definitions`, {
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),

  getSupplyTypes: () =>
    fetch(`${API_BASE}/supply-types`, {
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),

  getSupplyType: (id) =>
    fetch(`${API_BASE}/supply-types/${id}`, {
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),

  // History
  getSupplyHistory: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.supply_id) params.append('supply_id', filters.supply_id);
    if (filters.action_type) params.append('action_type', filters.action_type);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    
    const queryString = params.toString();
    const url = queryString ? `${API_BASE}/supplies/history?${queryString}` : `${API_BASE}/supplies/history`;
    
    return fetch(url, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    });
  },

  undoSupplyHistory: (historyId) =>
    fetch(`${API_BASE}/supplies/history/${historyId}/undo`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          throw apiJsonError(r, data);
        });
      }
      return r.json();
    }),

  discardSupplyHistory: (historyId) =>
    fetch(`${API_BASE}/supplies/history/${historyId}/discard`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          throw apiJsonError(r, data);
        });
      }
      return r.json();
    }),

  // Supplies Location (frontend inventory)
  getAllSupplyLocations: (location) => {
    const url = location 
      ? `${API_BASE}/supplies-location?location=${encodeURIComponent(location)}` 
      : `${API_BASE}/supplies-location`;
    return fetch(url, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    });
  },
  
  getSupplyLocation: (id) => 
    fetch(`${API_BASE}/supplies-location/${id}`, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  getLocationSupplies: (location) => 
    fetch(`${API_BASE}/supplies-location/by-location/${encodeURIComponent(location)}`, { 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  addSupplyLocation: (entry) => 
    fetch(`${API_BASE}/supplies-location`, { 
      method: 'POST', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(entry) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  updateSupplyLocation: (id, data) => 
    fetch(`${API_BASE}/supplies-location/${id}`, { 
      method: 'PUT', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(data) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  deleteSupplyLocation: (id) => 
    fetch(`${API_BASE}/supplies-location/${id}`, { 
      method: 'DELETE', 
      credentials: 'include', 
      headers: authHeaders() 
    }).then(r => {
      if (r.status === 401) {
        throw new Error('Authentication required');
      }
      if (r.status === 204) {
        return null;
      }
      return r.json();
    }),
  
  moveSupplyLocations: (data) => 
    fetch(`${API_BASE}/supplies-location/move`, { 
      method: 'POST', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(data) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
  
  bulkAddSupplyLocations: (data) => 
    fetch(`${API_BASE}/supplies-location/bulk-add`, { 
      method: 'POST', 
      credentials: 'include', 
      headers: authHeaders(), 
      body: JSON.stringify(data) 
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),
};

// Categories and Teams
export const getCategories = async () => {
  const response = await fetch(`${API_BASE}/categories`, {
    credentials: 'include',
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }
  const data = await response.json();
  // Categories now come as objects with {id, name}
  return data.categories || [];
};

export const getTeams = async () => {
  const response = await fetch(`${API_BASE}/teams`, {
    credentials: 'include',
    headers: authHeaders()
  });
  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }
  const data = await response.json();
  return data.teams || [];
};

// Admin API functions
export const admin = {
  // Locations (Inventory Boxes)
  getLocations: () =>
    fetch(`${API_BASE}/locations`, {
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (r.status === 403) {
        const error = new Error('Leader access required');
        error.response = { status: 403 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      // Handle network errors (connection refused, CORS, etc.)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      // Re-throw other errors
      throw err;
    }),

  createLocation: (location) =>
    fetch(`${API_BASE}/locations`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(location)
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (r.status === 403) {
        const error = new Error('Leader access required');
        error.response = { status: 403 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      // Handle network errors (connection refused, CORS, etc.)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      // Re-throw other errors
      throw err;
    }),

  updateLocation: (name, data) =>
    fetch(`${API_BASE}/locations/${encodeURIComponent(name)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(data)
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (r.status === 403) {
        const error = new Error('Leader access required');
        error.response = { status: 403 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      throw err;
    }),

  deleteLocation: (name) =>
    fetch(`${API_BASE}/locations/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (r.status === 403) {
        const error = new Error('Leader access required');
        error.response = { status: 403 };
        throw error;
      }
      if (r.status === 204) {
        return null;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      // Handle network errors (connection refused, CORS, etc.)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      // Re-throw other errors
      throw err;
    }),

  // Categories
  createCategory: (name) =>
    fetch(`${API_BASE}/categories`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify({ name })
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (r.status === 403) {
        const error = new Error('Leader access required');
        error.response = { status: 403 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }),

  // Custom field definitions (admin only)
  getCustomFieldDefinitions: () =>
    fetch(`${API_BASE}/custom-field-definitions`, {
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (!r.ok) throw new Error('Failed to fetch custom field definitions');
      return r.json();
    }),
  createCustomFieldDefinition: (data) =>
    fetch(`${API_BASE}/custom-field-definitions`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(data)
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),
  updateCustomFieldDefinition: (id, data) =>
    fetch(`${API_BASE}/custom-field-definitions/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(data)
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),
  deleteCustomFieldDefinition: (id) =>
    fetch(`${API_BASE}/custom-field-definitions/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (r.status === 204) return null;
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),

  createSupplyType: (body) =>
    fetch(`${API_BASE}/supply-types`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(body)
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),
  updateSupplyType: (id, body) =>
    fetch(`${API_BASE}/supply-types/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(),
      body: JSON.stringify(body)
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),
  deleteSupplyType: (id) =>
    fetch(`${API_BASE}/supply-types/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 403) throw new Error('Leader access required');
      if (r.status === 204) return null;
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Request failed'); });
      return r.json();
    }),
};

// Location History API
export const locationHistory = {
  /**
   * Get location history with optional filters.
   * @param {Object} params - Query parameters (supply_id, supply_name, location_name, limit, offset)
   * @returns {Promise<Array>} Array of history entries
   */
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.supply_id) queryParams.append('supply_id', params.supply_id);
    if (params.supply_name) queryParams.append('supply_name', params.supply_name);
    if (params.location_name) queryParams.append('location_name', params.location_name);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    
    const queryString = queryParams.toString();
    const url = `${API_BASE}/supplies-location-history${queryString ? `?${queryString}` : ''}`;
    
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      throw err;
    });
  },

  /**
   * Undo a single history entry.
   * @param {number} historyId - History entry ID
   * @returns {Promise<Object>} Updated history entry
   */
  undo: (historyId) =>
    fetch(`${API_BASE}/supplies-location-history/${historyId}/undo`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          throw apiJsonError(r, data);
        });
      }
      return r.json();
    }).catch(err => {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      throw err;
    }),

  discard: (historyId) =>
    fetch(`${API_BASE}/supplies-location-history/${historyId}/discard`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          throw apiJsonError(r, data);
        });
      }
      return r.json();
    }).catch(err => {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      throw err;
    }),

  /**
   * Undo all entries in a batch.
   * @param {string} batchId - Batch ID (UUID)
   * @returns {Promise<Object>} Result with deleted_count (entries are deleted entirely, not marked as undone)
   */
  undoBatch: (batchId) =>
    fetch(`${API_BASE}/supplies-location-history/batch/${batchId}/undo`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders()
    }).then(r => {
      if (r.status === 401) {
        const error = new Error('Authentication required');
        error.response = { status: 401 };
        throw error;
      }
      if (!r.ok) {
        return r.json().then(data => {
          const error = new Error(data.error || 'Request failed');
          error.response = r;
          throw error;
        });
      }
      return r.json();
    }).catch(err => {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const networkError = new Error('Network error: Unable to connect to server. Please check if the server is running.');
        networkError.response = { status: 0 };
        throw networkError;
      }
      throw err;
    }),
};

