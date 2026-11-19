/**
 * src/services/api.js
 * -------------------
 * Centralized Axios instance for SmartCare API requests.
 * Automatically attaches the JWT Bearer token from localStorage.
 */

import axios from 'axios';

// Base API URL from environment variable or fallback to localhost Django
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT token to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smartcare_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear expired session if 401 occurs outside of the login endpoint
      if (!error.config.url.includes('/login')) {
        localStorage.removeItem('smartcare_access_token');
        localStorage.removeItem('smartcare_refresh_token');
        localStorage.removeItem('smartcare_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
