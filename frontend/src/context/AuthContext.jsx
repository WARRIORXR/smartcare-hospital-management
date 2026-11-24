/**
 * src/context/AuthContext.jsx
 * ----------------------------
 * Central Authentication Context for SmartCare.
 * Provides user state, login/register/logout methods, and role helpers.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper: Get dashboard redirect URL based on role
  const getDashboardPath = (role) => {
    switch (role) {
      case 'patient':
        return '/patient/dashboard';
      case 'doctor':
        return '/doctor/dashboard';
      case 'admin':
        return '/admin/dashboard';
      case 'reception':
        return '/reception/dashboard';
      case 'bloodbank_staff':
        return '/bloodbank/stock';
      default:
        return '/dashboard';
    }
  };

  // Check saved session on initial app load
  useEffect(() => {
    const savedToken = localStorage.getItem('smartcare_access_token');
    const savedUser = localStorage.getItem('smartcare_user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (err) {
        console.error('Failed to parse cached user data', err);
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  // Login handler
  const login = async (username, password) => {
    const data = await authService.login({ username, password });
    
    // Save tokens and user info
    localStorage.setItem('smartcare_access_token', data.access);
    localStorage.setItem('smartcare_refresh_token', data.refresh);
    localStorage.setItem('smartcare_user', JSON.stringify(data.user));

    setToken(data.access);
    setUser(data.user);

    return data.user;
  };

  // Register handler
  const register = async (userData) => {
    const data = await authService.register(userData);

    // Auto-login upon registration
    if (data.access && data.user) {
      localStorage.setItem('smartcare_access_token', data.access);
      localStorage.setItem('smartcare_refresh_token', data.refresh);
      localStorage.setItem('smartcare_user', JSON.stringify(data.user));

      setToken(data.access);
      setUser(data.user);
    }

    return data.user;
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem('smartcare_access_token');
    localStorage.removeItem('smartcare_refresh_token');
    localStorage.removeItem('smartcare_user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token,
    login,
    register,
    logout,
    getDashboardPath,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom Hook to consume AuthContext cleanly
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
