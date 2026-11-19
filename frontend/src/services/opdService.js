/**
 * src/services/opdService.js
 * ---------------------------
 * Network calls for OPD Token Generation and Queue Tracking.
 */

import api from './api';

export const opdService = {
  /**
   * Generate an OPD consultation token
   * @param {Object} payload { doctor, priority, symptoms, appointment_date }
   */
  generateToken: async (payload) => {
    const response = await api.post('/opd/tokens/generate/', payload);
    return response.data;
  },

  /**
   * Get all tokens for the logged-in patient
   * @param {boolean} activeOnly - If true, only returns waiting & in_progress tokens
   */
  getMyTokens: async (activeOnly = false) => {
    const response = await api.get('/opd/tokens/my-tokens/', {
      params: { active: activeOnly },
    });
    return response.data;
  },

  /**
   * Get real-time status of a specific token
   */
  getTokenById: async (id) => {
    const response = await api.get(`/opd/tokens/${id}/`);
    return response.data;
  },

  /**
   * Cancel a waiting token
   */
  cancelToken: async (id) => {
    const response = await api.post(`/opd/tokens/${id}/cancel/`);
    return response.data;
  },
};

export default opdService;
