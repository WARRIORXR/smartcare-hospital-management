/**
 * src/pages/public/HospitalOverview.jsx
 * -------------------------------------
 * Public Editorial Clinical Welcome & Role Entry Page (/).
 * Connects patients, clinicians, reception, blood bank, and admin governance
 * with direct role portal links, live capability overview, and EN/HI/PA toggle.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { BrandLogo } from '../../components/common/Navbar';

const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'HI' },
  { code: 'pa', label: 'PA' },
];

const CLINICAL_MODULES = [
  {
    step: '01',
    title: 'OPD Token Booking & QR Pass',
    desc: 'Pick specialist, view live queue length, reserve a slot & SMS turn alerts.',
    target: '/patient/book-token',
    badgeCls: 'bg-cobalt-tint text-cobalt',
    ctaCls: 'text-cobalt',
  },
  {
    step: '02',
    title: 'Doctor Consultation & E-Prescription',
    desc: 'Structured medication builder, clinical visit notes & encrypted lab PDFs.',
    target: '/records',
    badgeCls: 'bg-emerald-50 text-clinical-success',
    ctaCls: 'text-clinical-success',
  },
  {
    step: '03',
    title: 'Inpatient Ward & Bed Assignment',
    desc: 'Real-time ICU, General, and Maternity bed occupancy with auto-allocation.',
    target: '/beds',
    badgeCls: 'bg-cobalt-tint text-cobalt',
    ctaCls: 'text-cobalt',
  },
  {
    step: '04',
    title: 'Blood Bank Stock & Donor Registry',
    desc: '8-group inventory tracking, 3-unit low alerts & 90-day donor cooldown check.',
    target: '/bloodbank/requests',
    badgeCls: 'bg-rose-50 text-clinical-danger',
    ctaCls: 'text-clinical-danger',
  },
  {
    step: '05',
    title: 'Itemized Billing & PDF Receipt',
    desc: 'Transparent OPD + ward billing, UPI/Card payment & instant GST PDF receipt.',
    target: '/billing',
    badgeCls: 'bg-emerald-50 text-clinical-success',
    ctaCls: 'text-clinical-success',
  },
];

const ROLE_CARDS = [
  {
    badge: 'PATIENT',
    badgeCls: 'bg-cobalt-tint text-cobalt',
    title: 'Patient Care Portal',
    desc: 'Book OPD slots, inspect live QR queue passes, download lab PDFs & pay bills.',
    cta: 'Enter Patient Portal →',
    ctaCls: 'text-cobalt',
    demoRole: 'patient',
    target: '/patient/dashboard',
  },
  {
    badge: 'DOCTOR',
    badgeCls: 'bg-emerald-50 text-clinical-success',
    title: 'Consultation Console',
    desc: 'Call next patient, author multi-row prescriptions, admit patients & request blood.',
    cta: 'Open Consultation Room →',
    ctaCls: 'text-clinical-success',
    demoRole: 'doctor',
    target: '/doctor/dashboard',
  },
  {
    badge: 'RECEPTION',
    badgeCls: 'bg-amber-50 text-clinical-warning',
    title: 'Front Desk & Wards',
    desc: 'Issue walk-in tokens, prioritize emergencies, assign beds & settle PDF receipts.',
    cta: 'Open Reception Desk →',
    ctaCls: 'text-clinical-warning',
    demoRole: 'reception',
    target: '/reception/dashboard',
  },
  {
    badge: 'BLOOD & ADMIN',
    badgeCls: 'bg-surface text-ink border border-hairline',
    title: 'Operations & Blood Bank',
    desc: 'Monitor SLA trends, manage staff clinics, fulfill blood requests & contact donors.',
    cta: 'Open Operations →',
    ctaCls: 'text-ink',
    demoRole: 'bloodbank_staff',
    target: '/bloodbank/stock',
  },
];

const HospitalOverview = () => {
  const { user, isAuthenticated, getDashboardPath } = useAuth();
  const { lang, setLang } = useLanguage();
  const navigate = useNavigate();

  const handleSmartNavigate = (path, demoRole = '') => {
    if (isAuthenticated && user) {
      navigate(path);
      return;
    }
    const query = new URLSearchParams();
    if (path) query.set('next', path);
    if (demoRole) query.set('role', demoRole);
    navigate(`/login?${query.toString()}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Public Top Navigation Bar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-hairline sticky top-0 z-40">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="shrink-0">
              <BrandLogo />
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              <span className="px-3 py-1.5 rounded-lg bg-cobalt-tint text-cobalt text-[13px] font-semibold">
                Care Overview
              </span>
              <button
                type="button"
                onClick={() => handleSmartNavigate('/patient/book-token', 'patient')}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-surface transition cursor-pointer"
              >
                Live OPD Queues
              </button>
              <button
                type="button"
                onClick={() => handleSmartNavigate('/patient/doctors', 'patient')}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-surface transition cursor-pointer"
              >
                Doctor Directory
              </button>
              <button
                type="button"
                onClick={() => handleSmartNavigate('/bloodbank/requests', 'bloodbank_staff')}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-surface transition cursor-pointer"
              >
                Blood Stock
              </button>
              <button
                type="button"
                onClick={() => handleSmartNavigate('/beds', 'reception')}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-surface transition cursor-pointer"
              >
                Ward Availability
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLang(opt.code)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                    lang === opt.code ? 'bg-white text-cobalt border border-hairline shadow-2xs' : 'text-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={() => navigate(getDashboardPath(user.role))}
                className="editorial-btn-primary"
              >
                Open My Portal →
              </button>
            ) : (
              <>
                <Link to="/login" className="editorial-btn-secondary">
                  Sign In
                </Link>
                <Link to="/register" className="editorial-btn-primary">
                  Book OPD Token
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-10">
        {/* Hero + 5-Module Journey Split */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-8 items-stretch">
          {/* Left Hero */}
          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-clinical-success animate-pulse" />
                <span className="font-mono text-[11px] font-semibold text-clinical-success tracking-wide uppercase">
                  Live Hospital Operations • Connected Modules
                </span>
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold text-ink leading-[1.14] tracking-tight">
                Unified hospital care from OPD token to final discharge receipt.
              </h1>

              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
                SmartCare HMS connects patients, doctors, receptionists, blood bank stock, inpatient wards, and itemized billing into one calm workspace—with dedicated pages for every workflow step.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {isAuthenticated && user ? (
                  <button
                    type="button"
                    onClick={() => navigate(getDashboardPath(user.role))}
                    className="editorial-btn-primary px-5 py-3 text-sm"
                  >
                    Continue to {user.role.replace('_', ' ')} Workspace →
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSmartNavigate('/patient/book-token', 'patient')}
                      className="editorial-btn-primary px-5 py-3 text-sm"
                    >
                      Book OPD Token Now →
                    </button>
                    <Link to="/login" className="editorial-btn-secondary px-5 py-3 text-sm">
                      Explore Sandbox Demo
                    </Link>
                    <Link to="/register" className="editorial-btn-secondary px-4 py-3 text-sm text-cobalt border-cobalt/25 bg-cobalt-tint/40">
                      New Patient Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* 4 Key Live Capabilities */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="editorial-surface p-4 space-y-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Live Queue</p>
                <p className="font-display text-xl font-bold text-ink">5s Sync</p>
                <p className="text-[11px] font-semibold text-clinical-success">Auto-refresh + QR</p>
              </div>
              <div className="editorial-surface p-4 space-y-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Ward Engine</p>
                <p className="font-display text-xl font-bold text-cobalt">Auto-Bed</p>
                <p className="text-[11px] text-muted">ICU &amp; General map</p>
              </div>
              <div className="editorial-surface p-4 space-y-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Blood Guard</p>
                <p className="font-display text-xl font-bold text-clinical-danger">3u Floor</p>
                <p className="text-[11px] text-muted">90-day donor match</p>
              </div>
              <div className="editorial-surface p-4 space-y-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Security</p>
                <p className="font-display text-xl font-bold text-ink">RBAC + PHI</p>
                <p className="text-[11px] font-semibold text-clinical-success">Audited Access</p>
              </div>
            </div>
          </div>

          {/* Right 5 Dedicated Clinical Modules Card */}
          <div className="editorial-surface p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] font-bold text-cobalt uppercase tracking-wider">
                  Connected Patient Journey
                </p>
                <h2 className="font-display text-lg font-bold text-ink mt-0.5">
                  5 Dedicated Clinical Modules
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-cobalt-tint text-cobalt font-mono text-[11px] font-semibold">
                Single Patient ID
              </span>
            </div>

            <div className="space-y-2.5">
              {CLINICAL_MODULES.map((mod) => (
                <button
                  key={mod.step}
                  type="button"
                  onClick={() => handleSmartNavigate(mod.target)}
                  className="w-full text-left p-3 rounded-xl bg-white border border-hairline hover:border-cobalt/40 transition flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-8 h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${mod.badgeCls}`}>
                      {mod.step}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink truncate">{mod.title}</p>
                      <p className="text-[11px] text-muted truncate">{mod.desc}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${mod.ctaCls}`}>Open →</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Dedicated Role Workspaces */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">Dedicated Role Workspaces</h2>
            <p className="text-xs text-muted">Choose your hospital workspace or register as a new patient</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLE_CARDS.map((card) => (
              <button
                key={card.badge}
                type="button"
                onClick={() => handleSmartNavigate(card.target, card.demoRole)}
                className="editorial-card-interactive p-5 text-left flex flex-col justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-2">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${card.badgeCls}`}>
                    {card.badge}
                  </span>
                  <h3 className="font-display text-base font-bold text-ink">{card.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{card.desc}</p>
                </div>
                <span className={`text-xs font-semibold ${card.ctaCls}`}>{card.cta}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default HospitalOverview;
