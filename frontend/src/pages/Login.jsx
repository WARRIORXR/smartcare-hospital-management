/**
 * src/pages/Login.jsx
 * -------------------
 * Editorial Clinical Split Login Page:
 *  - Left: Editorial clinical overview, 3-pillar capability strip & sandbox disclaimer
 *  - Right: Language switcher, 1-click Sandbox Demo Role Tabs (when VITE_DEMO_MODE === 'true'),
 *    clean authentication form, and security footer.
 */

import React, { useState, useRef } from 'react';
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { BrandLogo } from '../components/common/Navbar';

const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const SANDBOX_ROLES = [
  {
    id: 'patient',
    label: 'Patient',
    username: 'rahul.kumar',
    password: 'Patient@Demo26',
    desc: 'Book OPD tokens/slots, view medical records, invoices & SMS queue alerts.',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    username: 'dr.sharma',
    password: 'Doctor@Demo26',
    desc: 'Live OPD queue caller, write prescriptions, upload lab reports & bed admits.',
  },
  {
    id: 'reception',
    label: 'Reception',
    username: 'reception.desk',
    password: 'Reception@Demo26',
    desc: 'Walk-in OPD token desk, bed admission/discharge, and PDF billing counter.',
  },
  {
    id: 'bloodbank_staff',
    label: 'Blood Bank',
    username: 'bloodbank.staff',
    password: 'BloodBank@Demo26',
    desc: 'Manage 8 blood groups inventory, donor registry & emergency requests.',
  },
];

const Login = () => {
  const { user, isAuthenticated, login, getDashboardPath } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submittingRef = useRef(false);

  const requestedRole = searchParams.get('role') || '';
  const rawNext = searchParams.get('next') || '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  const initialPreset = IS_DEMO_MODE
    ? SANDBOX_ROLES.find((r) => r.id === requestedRole) || SANDBOX_ROLES[0]
    : null;

  const [formData, setFormData] = useState({
    username: initialPreset ? initialPreset.username : '',
    password: initialPreset ? initialPreset.password : '',
  });
  const [activeRole, setActiveRole] = useState(initialPreset ? initialPreset.id : '');
  const [prevRequestedRole, setPrevRequestedRole] = useState(requestedRole);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (requestedRole !== prevRequestedRole) {
    setPrevRequestedRole(requestedRole);
    if (IS_DEMO_MODE && requestedRole) {
      const match = SANDBOX_ROLES.find((r) => r.id === requestedRole);
      if (match) {
        setActiveRole(match.id);
        setFormData({ username: match.username, password: match.password });
        setError('');
      }
    }
  }

  if (isAuthenticated && user) {
    return <Navigate to={safeNext || getDashboardPath(user.role)} replace />;
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
    if (submittingRef.current) return;
    setError('');

    if (!formData.username.trim() || !formData.password) {
      setError('Please provide both username and password.');
      return;
    }

    submittingRef.current = true;
    try {
      setLoading(true);
      const loggedUser = await login(formData.username.trim(), formData.password);
      navigate(safeNext || getDashboardPath(loggedUser.role), { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        setError('Too many login attempts. Please wait a minute and try again.');
      } else {
        const errorMsg =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'Invalid username or password. Please verify and try again.';
        setError(errorMsg);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const currentRoleInfo = SANDBOX_ROLES.find((r) => r.id === activeRole);

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left Editorial Panel */}
      <aside className="lg:w-[52%] bg-surface border-b lg:border-b-0 lg:border-r border-hairline px-6 py-10 sm:px-12 lg:px-16 lg:py-14 flex flex-col justify-between gap-10">
        <div>
          <BrandLogo size="lg" />
        </div>

        <div className="max-w-xl space-y-6">
          <div className="space-y-3">
            <p className="editorial-eyebrow">Clinical Operations · Zero-Wait Care</p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold text-ink leading-[1.12] tracking-tight">
              Hospital care, without the waiting room guesswork.
            </h1>
            <p className="text-sm sm:text-[15px] text-muted leading-relaxed max-w-lg">
              Unified outpatient queues, digital prescriptions, live bed occupancy, blood reserve alerts, and object-level security in one clinical workspace.
            </p>
          </div>

          <div className="grid grid-cols-3 border-t border-b border-hairline py-5 gap-4">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Live Queue</p>
              <p className="font-display text-lg font-bold text-ink mt-1">5s Sync</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Access Guard</p>
              <p className="font-display text-lg font-bold text-ink mt-1">RBAC + 403</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Languages</p>
              <p className="font-display text-lg font-bold text-ink mt-1">EN · HI · PA</p>
            </div>
          </div>
        </div>

        <div className="max-w-xl">
          {IS_DEMO_MODE ? (
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-clinical-warning flex items-center justify-center shrink-0 mt-0.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                {t('sandboxNotice')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">
              Protected clinical portal. Contact your Hospital Administrator for staff credentials.
            </p>
          )}
        </div>
      </aside>

      {/* Right Authentication Workspace */}
      <main className="lg:w-[48%] bg-white px-6 py-10 sm:px-12 lg:px-16 lg:py-12 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-xs font-semibold text-muted hover:text-cobalt transition">
            ← Hospital Overview
          </Link>
          <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
            {[
              { code: 'en', label: 'English' },
              { code: 'hi', label: 'हिन्दी' },
              { code: 'pa', label: 'ਪੰਜਾਬੀ' },
            ].map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => setLang(opt.code)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                  lang === opt.code ? 'bg-cobalt text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-[460px] mx-auto my-8 space-y-6">
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl sm:text-[26px] font-bold text-ink">
              Sign in to SmartCare
            </h2>
            <p className="text-sm text-muted">
              Enter your clinical or patient credentials, or pick a sandbox role below.
            </p>
          </div>

          {IS_DEMO_MODE && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Sandbox Demo Roles
                </span>
                <span className="text-[11px] font-semibold text-cobalt">
                  1-Click Auto-Fill
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
                      className={`flex flex-col items-start p-2.5 rounded-xl text-left transition border cursor-pointer ${
                        isSelected
                          ? 'border-cobalt bg-cobalt-tint/70 text-ink ring-1 ring-cobalt/30'
                          : 'border-hairline bg-white text-muted hover:bg-surface hover:text-ink'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isSelected ? 'text-cobalt' : 'text-ink'}`}>
                        {role.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted truncate w-full mt-1">
                        {role.username}
                      </span>
                    </button>
                  );
                })}
              </div>

              {currentRoleInfo && (
                <div className="px-3.5 py-2.5 rounded-lg bg-surface border border-hairline text-xs text-muted leading-relaxed">
                  <span className="font-semibold text-ink">{currentRoleInfo.label}: </span>
                  {currentRoleInfo.desc}
                </div>
              )}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 border-l-4 border-l-clinical-danger text-xs text-clinical-danger font-medium">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-ink mb-1.5">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username"
                className="editorial-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-ink">
                  Password
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] font-medium text-muted hover:text-ink transition cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <Link to="/forgot-password" className="text-[11px] font-semibold text-cobalt hover:underline">
                    {t('forgotPassword')}
                  </Link>
                </div>
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
                className="editorial-input font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-cobalt hover:bg-cobalt-hover text-white text-sm font-semibold transition cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Authenticating (waking server if asleep)...' : t('signIn')}
            </button>
          </form>

          <div className="text-center text-xs text-muted pt-2 border-t border-hairline">
            <span>New patient? </span>
            <Link to="/register" className="font-semibold text-cobalt hover:underline">
              Register patient account
            </Link>
          </div>
        </div>

        <footer className="text-center space-y-1 text-[11px] text-muted border-t border-hairline pt-4">
          <p className="font-mono text-[10px]">
            15m Short-Lived JWT · Refresh Rotation · Login Rate Limiting (5/min)
          </p>
          <p>Render free tier sleeps when idle — first request may take ~50s.</p>
        </footer>
      </main>
    </div>
  );
};

export default Login;
