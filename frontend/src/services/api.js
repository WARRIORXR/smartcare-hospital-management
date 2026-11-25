/**
 * src/services/api.js
 * -------------------
 * Centralized Axios instance for SmartCare HMS:
 *  - Automatically injects JWT Bearer access token
 *  - Silent refresh-token rotation with request queue lock (for 15m short-lived access tokens)
 *  - Render free-tier cold-start loading detector (>3.5s latency)
 *  - Authenticated binary/blob file download helper (PDF receipts, CSV/PDF reports, lab uploads)
 */

import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track slow requests to surface friendly Render wake-up message
let activeRequests = 0;
let coldStartTimer = null;

const emitColdStart = (waking) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smartcare:cold-start', { detail: { waking } }));
  }
};

const startRequestTracking = () => {
  activeRequests += 1;
  if (activeRequests === 1 && !coldStartTimer) {
    coldStartTimer = setTimeout(() => {
      if (activeRequests > 0) emitColdStart(true);
    }, 3500);
  }
};

const finishRequestTracking = () => {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    if (coldStartTimer) {
      clearTimeout(coldStartTimer);
      coldStartTimer = null;
    }
    emitColdStart(false);
  }
};

// Refresh rotation mutex & waiting queue
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

const clearAuthAndRedirect = () => {
  localStorage.removeItem('smartcare_access_token');
  localStorage.removeItem('smartcare_refresh_token');
  localStorage.removeItem('smartcare_user');
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    startRequestTracking();
    const token = localStorage.getItem('smartcare_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    finishRequestTracking();
    return Promise.reject(error);
  }
);

// Response Interceptor with silent refresh rotation
api.interceptors.response.use(
  (response) => {
    finishRequestTracking();
    return response;
  },
  async (error) => {
    finishRequestTracking();
    const originalRequest = error.config;

    if (
      error.response &&
      error.response.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/login') &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/register')
    ) {
      const refreshToken = localStorage.getItem('smartcare_refresh_token');
      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const resp = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh: refreshToken });
        const newAccess = resp.data.access;
        const newRefresh = resp.data.refresh || refreshToken;

        localStorage.setItem('smartcare_access_token', newAccess);
        localStorage.setItem('smartcare_refresh_token', newRefresh);
        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;

        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthAndRedirect();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Authenticated file download helper for PDFs, CSV reports, and lab report files.
 */
export const downloadAuthenticatedFile = async (endpoint, fallbackFilename) => {
  const response = await api.get(endpoint, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;

  const disposition = response.headers['content-disposition'];
  let filename = fallbackFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];
  }

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export default api;
