/**
 * src/services/opdService.js
 * ---------------------------
 * Network calls for OPD Tokens, Advance Slots, Proximity Notifications, and Doctor Queue.
 */

import api from './api';

export const opdService = {
  getTokens: async (params = {}) => {
    const response = await api.get('/opd/tokens/', { params });
    return response.data;
  },

  generateToken: async (payload) => {
    const response = await api.post('/opd/tokens/generate/', payload);
    return response.data;
  },

  getDoctorSlots: async (doctorId, date) => {
    const response = await api.get(`/opd/doctors/${doctorId}/slots/`, { params: { date } });
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

  // Notifications (SMS / WhatsApp / In-App Queue Alerts)
  getNotifications: async (params = {}) => {
    const response = await api.get('/opd/notifications/', { params });
    return response.data;
  },

  markNotificationRead: async (id) => {
    const response = await api.post(`/opd/notifications/${id}/read/`);
    return response.data;
  },

  markAllNotificationsRead: async () => {
    const response = await api.post('/opd/notifications/read-all/');
    return response.data;
  },

  // Doctor Queue Controls
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

  // Clinical Display Screen
  getPublicDisplayData: async (doctorId) => {
    const response = await api.get(`/opd/public/display/${doctorId}/`);
    return response.data;
  },
};

export default opdService;
