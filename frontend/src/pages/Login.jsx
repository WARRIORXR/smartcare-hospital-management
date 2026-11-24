/**
 * src/pages/Login.jsx
 * -------------------
 * Minimal, Clean & Secure Authentication Page for SmartCare HMS.
 * Features:
 *   - 1-Click Interactive Role Selector (Patient, Doctor, Admin)
 *   - Clear role explanations for intuitive navigation
 *   - Password visibility toggle & JWT security badge
 *   - High contrast, clinical-grade minimal UI
 */

import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DEMO_ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    icon: '👤',
    username: 'rahul.kumar',
    password: 'patient123',
    badge: 'OPD & Care',
    desc: 'Book OPD tokens, view dynamic queue wait times & track health journey.',
    theme: 'border-emerald-500 bg-emerald-50/50 text-emerald-900',
    tagColor: 'bg-emerald-100 text-emerald-800',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    icon: '👨‍⚕️',
    username: 'dr.sharma',
    password: 'doctor123',
    badge: 'Cardiology',
    desc: 'Call next queue patient, 1-click bed auto-admissions & blood requests.',
    theme: 'border-blue-500 bg-blue-50/50 text-blue-900',
    tagColor: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: '🛡️',
    username: 'admin',
    password: 'admin123',
    badge: 'Control Center',
    desc: 'Executive analytics, bed occupancy, doctor roster & blood bank stock.',
    theme: 'border-purple-500 bg-purple-50/50 text-purple-900',
    tagColor: 'bg-purple-100 text-purple-800',
  },
];

const Login = () => {
  const { user, isAuthenticated, login, getDashboardPath } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to active role dashboard
  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  const [formData, setFormData] = useState({
    username: 'rahul.kumar',
    password: 'patient123',
  });
  const [activeRole, setActiveRole] = useState('patient');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelectRole = (role) => {
    setActiveRole(role.id);
    setFormData({
      username: role.username,
      password: role.password,
    });
    setError('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username.trim() || !formData.password) {
      setError('Please provide both username and password.');
      return;
    }

    try {
      setLoading(true);
      const user = await login(formData.username.trim(), formData.password);
      navigate(getDashboardPath(user.role), { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Invalid username or password. Please verify and try again.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const currentRoleInfo = DEMO_ROLES.find((r) => r.id === activeRole);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-2xl shadow-sm mb-3">
          🏥
        </div>
        <div className="flex items-center justify-center space-x-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            SmartCare HMS
          </h1>
          <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
            v2.0 • Secure
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Integrated Hospital Management & Patient Care System
        </p>
      </div>

      {/* Main Login Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-7 px-6 sm:px-8 rounded-2xl border border-slate-200/90 shadow-sm">
          {/* Minimal 1-Click Role Tabs */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Select Your Role
              </span>
              <span className="text-[11px] text-blue-600 font-medium">
                ⚡ 1-Click Auto-Fill
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {DEMO_ROLES.map((role) => {
                const isSelected = activeRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleSelectRole(role)}
                    className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                      isSelected
                        ? `${role.theme} ring-2 ring-blue-500/30 shadow-xs font-bold`
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-lg mb-0.5">{role.icon}</span>
                    <span>{role.label}</span>
                    <span className={`text-[9px] mt-1 px-1.5 py-0.2 rounded font-mono ${role.tagColor}`}>
                      {role.username}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Role Context Helper Banner */}
            {currentRoleInfo && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-600 text-xs flex items-start space-x-2">
                <span className="text-blue-600 font-bold">ℹ️</span>
                <p className="leading-relaxed">
                  <strong className="text-slate-800">{currentRoleInfo.label}:</strong> {currentRoleInfo.desc}
                </p>
              </div>
            )}
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Error Banner */}
            {error && (
              <div className="bg-rose-50 border-l-3 border-rose-500 p-3 rounded-lg">
                <div className="flex items-center space-x-2 text-rose-700 text-xs font-medium">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Username / Patient ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
                  👤
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. rahul.kumar, dr.sharma, admin"
                  className="block w-full pl-9 pr-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 transition"
                >
                  {showPassword ? 'Hide 👁️' : 'Show 👁️‍🗨️'}
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
                  🔒
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-mono"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Authenticating...</span>
                  </span>
                ) : (
                  <span>Sign In as {currentRoleInfo ? currentRoleInfo.label : 'User'}</span>
                )}
              </button>
            </div>
          </form>

          {/* Registration Link */}
          <div className="mt-5 text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
            <span>New patient? </span>
            <Link
              to="/register"
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Register here for digital pass
            </Link>
          </div>

          {/* Security Assurance Badge */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center space-x-2 text-[11px] text-slate-400">
            <span>🔒</span>
            <span>256-Bit JWT Encryption • Role-Based Access Control</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
