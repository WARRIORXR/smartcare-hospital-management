/**
 * src/pages/Login.jsx
 * -------------------
 * Secure Login Page with:
 *  - NO hardcoded Admin credentials exposed in production sandbox UI
 *  - Sandbox Quick-Login Selector ONLY when VITE_DEMO_MODE === 'true'
 *    covering Patient, Doctor, Receptionist, and Blood Bank Staff
 *  - Password Reset link + EN / HI / PA Language Switcher
 *  - Fake-data educational sandbox notice & Render cold-start note
 */

import React, { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const SANDBOX_ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    icon: '👤',
    username: 'rahul.kumar',
    password: 'Patient@Demo26',
    desc: 'Book OPD tokens/slots, view medical records, invoices & SMS queue alerts.',
    theme: 'border-emerald-500 bg-emerald-50/50 text-emerald-900',
    tagColor: 'bg-emerald-100 text-emerald-800',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    icon: '👨‍⚕️',
    username: 'dr.sharma',
    password: 'Doctor@Demo26',
    desc: 'Live OPD queue caller, write prescriptions, upload lab reports & bed admits.',
    theme: 'border-blue-500 bg-blue-50/50 text-blue-900',
    tagColor: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'reception',
    label: 'Reception',
    icon: '🧾',
    username: 'reception.desk',
    password: 'Reception@Demo26',
    desc: 'Walk-in OPD token desk, bed admission/discharge, and PDF billing counter.',
    theme: 'border-indigo-500 bg-indigo-50/50 text-indigo-900',
    tagColor: 'bg-indigo-100 text-indigo-800',
  },
  {
    id: 'bloodbank_staff',
    label: 'Blood Bank',
    icon: '🩸',
    username: 'bloodbank.staff',
    password: 'BloodBank@Demo26',
    desc: 'Manage 8 blood groups inventory, donor registry & emergency requests.',
    theme: 'border-rose-500 bg-rose-50/50 text-rose-900',
    tagColor: 'bg-rose-100 text-rose-800',
  },
];

const Login = () => {
  const { user, isAuthenticated, login, getDashboardPath } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: IS_DEMO_MODE ? 'rahul.kumar' : '',
    password: IS_DEMO_MODE ? 'Patient@Demo26' : '',
  });
  const [activeRole, setActiveRole] = useState(IS_DEMO_MODE ? 'patient' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated && user) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  const handleSelectRole = (role) => {
    setActiveRole(role.id);
    setFormData({ username: role.username, password: role.password });
    setError('');
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
      const loggedUser = await login(formData.username.trim(), formData.password);
      navigate(getDashboardPath(loggedUser.role), { replace: true });
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

  const currentRoleInfo = SANDBOX_ROLES.find((r) => r.id === activeRole);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Language Bar & Brand */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center mb-5">
        <div className="flex justify-end mb-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs">
            {[
              { code: 'en', label: 'English' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'pa', label: 'ਪੰਜਾਬੀ' },
            ].map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => setLang(opt.code)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                  lang === opt.code ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-2xl shadow-sm mb-3">
          🏥
        </div>
        <div className="flex items-center justify-center space-x-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('brand')} {t('hms')}
          </h1>
          <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
            v2.0 • Secure
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Integrated Hospital Management & Patient Care System
        </p>
      </div>

      {/* Main Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        {IS_DEMO_MODE && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-start space-x-2">
            <span>⚠️</span>
            <span>{t('sandboxNotice')}</span>
          </div>
        )}

        <div className="bg-white py-7 px-6 sm:px-8 rounded-2xl border border-slate-200/90 shadow-sm">
          {IS_DEMO_MODE && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Sandbox Demo Roles
                </span>
                <span className="text-[11px] text-blue-600 font-medium">
                  ⚡ 1-Click Non-Admin Auto-Fill
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SANDBOX_ROLES.map((role) => {
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
                      <span className={`text-[9px] mt-1 px-1.5 py-0.5 rounded font-mono truncate max-w-full ${role.tagColor}`}>
                        {role.username}
                      </span>
                    </button>
                  );
                })}
              </div>

              {currentRoleInfo && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-600 text-xs flex items-start space-x-2">
                  <span className="text-blue-600 font-bold">ℹ️</span>
                  <p className="leading-relaxed">
                    <strong className="text-slate-800">{currentRoleInfo.label}:</strong> {currentRoleInfo.desc}
                  </p>
                </div>
              )}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-rose-50 border-l-3 border-rose-500 p-3 rounded-lg">
                <div className="flex items-center space-x-2 text-rose-700 text-xs font-medium">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-slate-700 mb-1">
                Username
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
                  placeholder="Enter your username"
                  className="block w-full pl-9 pr-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <Link to="/forgot-password" className="text-[11px] font-semibold text-blue-600 hover:underline">
                    {t('forgotPassword')}
                  </Link>
                </div>
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

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition cursor-pointer"
              >
                {loading ? 'Authenticating (waking server if asleep)...' : t('signIn')}
              </button>
            </div>
          </form>

          <div className="mt-5 text-center text-xs text-slate-500 border-t border-slate-100 pt-4">
            <span>New patient? </span>
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              Register patient account
            </Link>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center space-y-1 text-[11px] text-slate-400">
            <p>🔒 15m Short-Lived JWT • Refresh Rotation • Login Rate Limiting (5/min)</p>
            <p className="text-[10px]">Note: Render free tier sleeps when idle — first request may take ~50s.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
