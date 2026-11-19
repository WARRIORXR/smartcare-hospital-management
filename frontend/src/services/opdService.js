/**
 * src/services/opdService.js
 * ---------------------------
 * Network calls for OPD Token Generation, Patient Queue Tracking,
 * and Doctor Consultation Controls.
 */

import api from './api';

export const opdService = {
  // ─── PATIENT TOKEN APIS ───
  generateToken: async (payload) => {
    const response = await api.post('/opd/tokens/generate/', payload);
    return response.data;
  },

  getMyTokens: async (activeOnly = false) => {
    const response = await api.get('/opd/tokens/my-tokens/', {
      params: { active: activeOnly },
    });
    return response.data;
  },

  getTokenById: async (id) => {
    const response = await api.get(`/opd/tokens/${id}/`);
    return response.data;
  },

  cancelToken: async (id) => {
    const response = await api.post(`/opd/tokens/${id}/cancel/`);
    return response.data;
  },

  // ─── DOCTOR QUEUE APIS ───
  getDoctorQueue: async () => {
    const response = await api.get('/opd/doctor/queue/');
    return response.data;
  },

  callNextPatient: async (tokenId = null) => {
    const payload = tokenId ? { token_id: tokenId } : {};
    const response = await api.post('/opd/doctor/call-next/', payload);
    return response.data;
  },

  completeConsultation: async (tokenId = null) => {
    const payload = tokenId ? { token_id: tokenId } : {};
    const response = await api.post('/opd/doctor/complete/', payload);
    return response.data;
  },

  skipPatient: async (tokenId = null) => {
    const payload = tokenId ? { token_id: tokenId } : {};
    const response = await api.post('/opd/doctor/skip/', payload);
    return response.data;
  },
};

export default opdService;
