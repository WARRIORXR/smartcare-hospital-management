/**
 * src/services/hospitalService.js
 * --------------------------------
 * API service for Departments, Doctors, Leave/Availability, Feedback, Audit Logs, and Reports.
 */

import api, { downloadAuthenticatedFile } from './api';

export const hospitalService = {
  // Departments
  getDepartments: async (showAll = false) => {
    const response = await api.get('/accounts/departments/', { params: { all: showAll } });
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

  // Doctors
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

  toggleDoctorAvailability: async (payload = {}) => {
    const response = await api.patch('/accounts/doctors/toggle-availability/', payload);
    return response.data;
  },

  // Doctor Leave Schedule
  getLeaves: async (params = {}) => {
    const response = await api.get('/accounts/leaves/', { params });
    return response.data;
  },

  createLeave: async (leaveData) => {
    const response = await api.post('/accounts/leaves/', leaveData);
    return response.data;
  },

  deleteLeave: async (id) => {
    const response = await api.delete(`/accounts/leaves/${id}/`);
    return response.data;
  },

  // Doctor Feedback / Patient Ratings
  getFeedback: async (params = {}) => {
    const response = await api.get('/accounts/feedback/', { params });
    return response.data;
  },

  submitFeedback: async (feedbackData) => {
    const response = await api.post('/accounts/feedback/', feedbackData);
    return response.data;
  },

  // Patients & Journey
  getPatients: async (params = {}) => {
    const response = await api.get('/accounts/patients/', { params });
    return response.data;
  },

  getPatientJourney: async (patientId) => {
    const response = await api.get(`/accounts/patients/${patientId}/journey/`);
    return response.data;
  },

  // Admin Analytics, Exports & Audit Logs
  getAdminAnalytics: async () => {
    const response = await api.get('/accounts/admin/analytics/');
    return response.data;
  },

  downloadAnalyticsCsv: async () => {
    await downloadAuthenticatedFile('/accounts/admin/analytics/export/csv/', 'smartcare_analytics.csv');
  },

  downloadAnalyticsPdf: async () => {
    await downloadAuthenticatedFile('/accounts/admin/analytics/export/pdf/', 'smartcare_analytics.pdf');
  },

  getAuditLogs: async (params = {}) => {
    const response = await api.get('/accounts/audit-logs/', { params });
    return response.data;
  },

  getStaffList: async (params = {}) => {
    const response = await api.get('/accounts/staff/', { params });
    return response.data;
  },

  createStaffAccount: async (payload) => {
    const response = await api.post('/accounts/staff/', payload);
    return response.data;
  },
};

export default hospitalService;
