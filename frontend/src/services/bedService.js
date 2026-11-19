/**
 * src/services/bedService.js
 * --------------------------
 * Service calls for Wards, Beds, and live Bed Occupancy tracking (Module 2).
 */

import api from './api';

export const bedService = {
  // Live Dashboard Overview
  getOverview: async () => {
    const response = await api.get('/beds/overview/');
    return response.data;
  },

  // Ward CRUD
  getWards: async (params = {}) => {
    const response = await api.get('/beds/wards/', { params });
    return response.data;
  },

  getWard: async (id) => {
    const response = await api.get(`/beds/wards/${id}/`);
    return response.data;
  },

  createWard: async (wardData) => {
    const response = await api.post('/beds/wards/', wardData);
    return response.data;
  },

  updateWard: async (id, wardData) => {
    const response = await api.put(`/beds/wards/${id}/`, wardData);
    return response.data;
  },

  deleteWard: async (id) => {
    const response = await api.delete(`/beds/wards/${id}/`);
    return response.data;
  },

  // Bed CRUD
  getBeds: async (params = {}) => {
    const response = await api.get('/beds/', { params });
    return response.data;
  },

  createBed: async (bedData) => {
    const response = await api.post('/beds/', bedData);
    return response.data;
  },

  updateBed: async (id, bedData) => {
    const response = await api.put(`/beds/${id}/`, bedData);
    return response.data;
  },

  updateBedStatus: async (id, status) => {
    const response = await api.patch(`/beds/${id}/status/`, { status });
    return response.data;
  },

  deleteBed: async (id) => {
    const response = await api.delete(`/beds/${id}/`);
    return response.data;
  },

  // Inpatient Admissions
  getAdmissions: async () => {
    const response = await api.get('/beds/admissions/');
    return response.data;
  },

  getActiveAdmissions: async (params = {}) => {
    const response = await api.get('/beds/admissions/active/', { params });
    return response.data;
  },

  autoAdmitPatient: async (admissionData) => {
    const response = await api.post('/beds/admissions/auto-admit/', admissionData);
    return response.data;
  },

  admitPatient: async (admissionData) => {
    const response = await api.post('/beds/admissions/', admissionData);
    return response.data;
  },

  dischargePatient: async (admissionId, dischargeNotes = '') => {
    const response = await api.post(`/beds/admissions/${admissionId}/discharge/`, {
      discharge_notes: dischargeNotes,
    });
    return response.data;
  },
};

export default bedService;
