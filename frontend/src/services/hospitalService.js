/**
 * src/services/hospitalService.js
 * --------------------------------
 * API service for Departments and Doctors management.
 */

import api from './api';

export const hospitalService = {
  // ─── DEPARTMENT APIS ───
  getDepartments: async (showAll = false) => {
    const response = await api.get('/accounts/departments/', {
      params: { all: showAll },
    });
    return response.data;
  },

  createDepartment: async (deptData) => {
    const response = await api.post('/accounts/departments/', deptData);
    return response.data;
  },

  updateDepartment: async (id, deptData) => {
    const response = await api.put(`/accounts/departments/${id}/`, deptData);
    return response.data;
  },

  deleteDepartment: async (id) => {
    const response = await api.delete(`/accounts/departments/${id}/`);
    return response.data;
  },

  // ─── DOCTOR APIS ───
  getDoctors: async (params = {}) => {
    const response = await api.get('/accounts/doctors/', { params });
    return response.data;
  },

  getDoctorById: async (id) => {
    const response = await api.get(`/accounts/doctors/${id}/`);
    return response.data;
  },

  createDoctor: async (doctorData) => {
    const response = await api.post('/accounts/doctors/', doctorData);
    return response.data;
  },

  updateDoctor: async (id, doctorData) => {
    const response = await api.put(`/accounts/doctors/${id}/`, doctorData);
    return response.data;
  },

  deleteDoctor: async (id) => {
    const response = await api.delete(`/accounts/doctors/${id}/`);
    return response.data;
  },
};

export default hospitalService;
