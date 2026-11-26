/**
 * src/context/AuthContext.jsx
 * ----------------------------
 * Central Authentication Context managing JWT tokens, logout blacklisting, and role routing.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      const savedToken = localStorage.getItem('smartcare_access_token');
      const savedUserRaw = localStorage.getItem('smartcare_user');

      if (!savedToken) {
        localStorage.removeItem('smartcare_user');
        if (active) setLoading(false);
        return;
      }

      if (savedUserRaw) {
        try {
          const parsed = JSON.parse(savedUserRaw);
          if (active) {
            setToken(savedToken);
            setUser(parsed);
          }
        } catch {
          localStorage.removeItem('smartcare_access_token');
          localStorage.removeItem('smartcare_refresh_token');
          localStorage.removeItem('smartcare_user');
          if (active) {
            setToken(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }
      }

      // Verify authoritative role & user identity against server JWT profile
      try {
        const profileData = await authService.getProfile();
        if (active && profileData?.user) {
          localStorage.setItem('smartcare_user', JSON.stringify(profileData.user));
          setToken(localStorage.getItem('smartcare_access_token') || savedToken);
          setUser(profileData.user);
        }
      } catch {
        localStorage.removeItem('smartcare_access_token');
        localStorage.removeItem('smartcare_refresh_token');
        localStorage.removeItem('smartcare_user');
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrapAuth();
    return () => { active = false; };
  }, []);

  const login = async (username, password) => {
    const data = await authService.login({ username, password });
    localStorage.setItem('smartcare_access_token', data.access);
    localStorage.setItem('smartcare_refresh_token', data.refresh);
    localStorage.setItem('smartcare_user', JSON.stringify(data.user));
    setToken(data.access);
    setUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await authService.register(userData);
    if (data.access && data.user) {
      localStorage.setItem('smartcare_access_token', data.access);
      localStorage.setItem('smartcare_refresh_token', data.refresh);
      localStorage.setItem('smartcare_user', JSON.stringify(data.user));
      setToken(data.access);
      setUser(data.user);
    }
    return data.user;
  };

  const logout = () => {
    const accessToken = localStorage.getItem('smartcare_access_token');
    const refreshToken = localStorage.getItem('smartcare_refresh_token');
    if (refreshToken) {
      authService.logout(refreshToken, accessToken).catch(() => {});
    }
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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
