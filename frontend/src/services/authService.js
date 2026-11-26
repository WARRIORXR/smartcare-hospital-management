/**
 * src/services/authService.js
 * ----------------------------
 * Handles authentication, logout blacklisting, password reset, and profile calls.
 */

import api from './api';

export const authService = {
  login: async (credentials) => {
    const response = await api.post('/accounts/login/', credentials);
    return response.data;
  },

  logout: async (refresh, accessToken = null) => {
    const config = accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined;
    const response = await api.post('/accounts/logout/', { refresh }, config);
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/accounts/register/', userData);
    return response.data;
  },

  requestPasswordReset: async (email) => {
    const response = await api.post('/accounts/password-reset/', { email });
    return response.data;
  },

  confirmPasswordReset: async (payload) => {
    const response = await api.post('/accounts/password-reset/confirm/', payload);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/accounts/profile/');
    return response.data;
  },

  getDepartments: async () => {
    const response = await api.get('/accounts/departments/');
    return response.data;
  },

  refreshToken: async (refresh) => {
    const response = await api.post('/auth/refresh/', { refresh });
    return response.data;
  },
};

export default authService;
