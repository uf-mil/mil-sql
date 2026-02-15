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

// API functions will be added in later steps
export const api = {
  // Supplies endpoints will be added in Step 6
  // Supplies Location endpoints will be added in Step 6
};

