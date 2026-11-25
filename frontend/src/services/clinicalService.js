/**
 * src/services/clinicalService.js
 * --------------------------------
 * API service for Medical Records (Visit Notes, Prescriptions, Lab Report Uploads/Downloads)
 * and Hospital Billing (Invoices, Payment, and PDF Receipts).
 */

import api, { downloadAuthenticatedFile } from './api';

export const clinicalService = {
  // Medical Records
  getRecords: async (params = {}) => {
    const response = await api.get('/records/', { params });
    return response.data;
  },

  createRecord: async (payload, isMultipart = false) => {
    const config = isMultipart
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : {};
    const response = await api.post('/records/', payload, config);
    return response.data;
  },

  downloadLabReport: async (recordId, filename = 'lab_report.pdf') => {
    await downloadAuthenticatedFile(`/records/${recordId}/download/`, filename);
  },

  // Billing & Invoices
  getInvoices: async (params = {}) => {
    const response = await api.get('/billing/invoices/', { params });
    return response.data;
  },

  generateInvoice: async (payload) => {
    const response = await api.post('/billing/invoices/generate/', payload);
    return response.data;
  },

  payInvoice: async (invoiceId, paymentMethod = 'upi') => {
    const response = await api.post(`/billing/invoices/${invoiceId}/pay/`, {
      payment_method: paymentMethod,
    });
    return response.data;
  },

  downloadInvoicePdf: async (invoiceId, invoiceNumber = 'receipt') => {
    await downloadAuthenticatedFile(`/billing/invoices/${invoiceId}/pdf/`, `${invoiceNumber}_receipt.pdf`);
  },
};

export default clinicalService;
