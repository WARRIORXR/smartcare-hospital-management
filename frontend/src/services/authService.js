/**
 * src/services/authService.js
 * ----------------------------
 * Handles authentication network calls (Login, Register, Profile).
 */

import api from './api';

export const authService = {
  /**
   * Login user with username & password
   * Returns: { access, refresh, user: { id, username, role, ... } }
   */
  login: async (credentials) => {
    const response = await api.post('/accounts/login/', credentials);
    return response.data;
  },

  /**
   * Register a new user
   * Returns: { message, access, refresh, user }
   */
  register: async (userData) => {
    const response = await api.post('/accounts/register/', userData);
    return response.data;
  },

  /**
   * Fetch current authenticated user's profile
   */
  getProfile: async () => {
    const response = await api.get('/accounts/profile/');
    return response.data;
  },

  /**
   * Fetch list of active departments (for doctor registration)
   */
  getDepartments: async () => {
    const response = await api.get('/accounts/departments/');
    return response.data;
  },

  /**
   * Refresh JWT token
   */
  refreshToken: async (refresh) => {
    const response = await api.post('/auth/refresh/', { refresh });
    return response.data;
  },
};

export default authService;
