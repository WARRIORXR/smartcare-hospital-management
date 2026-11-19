/**
 * src/services/bloodBankService.js
 * --------------------------------
 * Service calls for Blood Bank Stock, Batches, Donors, and Requests (Module 3).
 */

import api from './api';

export const bloodBankService = {
  // Live Blood Stock Inventory
  getLiveStock: async () => {
    const response = await api.get('/bloodbank/stock/');
    return response.data;
  },

  // Add or Update Blood Units with Expiry Date
  updateStock: async (payload) => {
    const response = await api.post('/bloodbank/stock/update/', payload);
    return response.data;
  },

  // Batches
  getBatches: async () => {
    const response = await api.get('/bloodbank/batches/');
    return response.data;
  },

  addBatch: async (batchData) => {
    const response = await api.post('/bloodbank/batches/', batchData);
    return response.data;
  },

  // Donors
  getDonors: async (params = {}) => {
    const response = await api.get('/bloodbank/donors/', { params });
    return response.data;
  },

  registerDonor: async (donorData) => {
    const response = await api.post('/bloodbank/donors/', donorData);
    return response.data;
  },

  getMatchingDonors: async (bloodGroup, city = '') => {
    const response = await api.get('/bloodbank/donors/matching/', {
      params: { blood_group: bloodGroup, city },
    });
    return response.data;
  },

  // Requests
  getRequests: async (params = {}) => {
    const response = await api.get('/bloodbank/requests/', { params });
    return response.data;
  },

  createRequest: async (requestData) => {
    const response = await api.post('/bloodbank/requests/', requestData);
    return response.data;
  },

  updateRequestStatus: async (id, status, rejectionReason = '') => {
    const response = await api.patch(`/bloodbank/requests/${id}/status/`, {
      status,
      rejection_reason: rejectionReason,
    });
    return response.data;
  },
};

export default bloodBankService;
