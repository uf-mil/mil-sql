/**
 * API client for milventory backend.
 */
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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

