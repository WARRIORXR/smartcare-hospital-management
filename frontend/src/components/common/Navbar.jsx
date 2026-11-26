/**
 * src/components/common/Navbar.jsx
 * ---------------------------------
 * Editorial Clinical Navigation Bar with role links & EN / HI / PA Language Switcher.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const LANG_OPTIONS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिं' },
  { code: 'pa', label: 'ਪੰ' },
];

export const BrandLogo = ({ size = 'md' }) => {
  const { t } = useLanguage();
  const boxCls = size === 'lg' ? 'w-10 h-10 rounded-xl' : 'w-8 h-8 rounded-lg';
  const iconSize = size === 'lg' ? 20 : 16;

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className={`${boxCls} bg-cobalt flex items-center justify-center text-white shrink-0`}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-bold text-ink tracking-tight">{t('brand')}</span>
        <span className="font-mono text-[10px] font-semibold bg-cobalt-tint text-cobalt px-1.5 py-0.5 rounded border border-cobalt/15">
          {t('hms')} v2.0
        </span>
      </div>
    </div>
  );
};

const Navbar = () => {
  const { user, logout, getDashboardPath } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'patient':
        return 'bg-emerald-50 text-clinical-success border-emerald-200';
      case 'doctor':
        return 'bg-cobalt-tint text-cobalt border-cobalt/20';
      case 'reception':
        return 'bg-cobalt-tint text-cobalt border-cobalt/20';
      case 'admin':
        return 'bg-surface text-ink border-hairline';
      case 'bloodbank_staff':
        return 'bg-rose-50 text-clinical-danger border-rose-200';
      default:
        return 'bg-surface text-muted border-hairline';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'patient': return 'PATIENT';
      case 'doctor': return 'DOCTOR';
      case 'reception': return 'RECEPTIONIST';
      case 'admin': return 'ADMIN';
      case 'bloodbank_staff': return 'BLOOD BANK';
      default: return role?.toUpperCase() || 'USER';
    }
  };

  const isCurrent = (path) => {
    if (location.pathname === path) return true;
    if (path !== '/' && location.pathname.startsWith(`${path}/`)) return true;
    return false;
  };

  const getNavLinks = () => {
    if (!user) return [];
    switch (user.role) {
      case 'patient':
        return [
          { name: 'Portal', path: '/patient/dashboard' },
          { name: 'Queues', path: '/patient/book-token' },
          { name: 'Doctors', path: '/patient/doctors' },
          { name: 'Passes', path: '/patient/tokens' },
          { name: 'Journey', path: '/patient/journey' },
          { name: 'Records', path: '/records' },
          { name: 'Billing', path: '/billing' },
        ];
      case 'doctor':
        return [
          { name: 'OPD Queue', path: '/doctor/dashboard' },
          { name: 'Write Rx', path: '/records/new' },
          { name: 'Records', path: '/records' },
          { name: 'Inpatients', path: '/beds/inpatients' },
          { name: 'Blood Req', path: '/bloodbank/requests' },
          { name: 'Billing', path: '/billing' },
        ];
      case 'reception':
        return [
          { name: 'Reception', path: '/reception/dashboard' },
          { name: 'Ward Grid', path: '/beds' },
          { name: 'Inpatients', path: '/beds/inpatients' },
          { name: 'New Bill', path: '/billing/new' },
          { name: 'Invoices', path: '/billing' },
          { name: 'Blood Req', path: '/bloodbank/requests' },
        ];
      case 'admin':
        return [
          { name: t('navAnalytics'), path: '/admin/dashboard' },
          { name: 'Staff', path: '/admin/manage' },
          { name: 'Ward Grid', path: '/beds' },
          { name: 'Inpatients', path: '/beds/inpatients' },
          { name: 'Blood Bank', path: '/bloodbank' },
          { name: 'Billing', path: '/billing' },
        ];
      case 'bloodbank_staff':
        return [
          { name: t('navBloodStock'), path: '/bloodbank/stock' },
          { name: t('navBloodRequests'), path: '/bloodbank/requests' },
          { name: t('navDonors'), path: '/bloodbank/donors' },
        ];
      default:
        return [{ name: 'Dashboard', path: getDashboardPath(user.role) }];
    }
  };

  const navLinks = getNavLinks();

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-hairline sticky top-0 z-40">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-3">
          <div className="flex items-center gap-5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate(user ? getDashboardPath(user.role) : '/');
              }}
              className="cursor-pointer shrink-0 focus:outline-none"
            >
              <BrandLogo />
            </button>

            {user && (
              <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition whitespace-nowrap ${
                      isCurrent(link.path)
                        ? 'text-cobalt font-semibold bg-cobalt-tint/60'
                        : 'text-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Multilingual EN / Hindi / Punjabi Switcher */}
            <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLang(opt.code)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                    lang === opt.code
                      ? 'bg-cobalt text-white'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {user ? (
              <>
                <span className={`hidden sm:inline-flex items-center font-mono text-[10px] px-2.5 py-1 rounded-md font-semibold border tracking-wider ${getRoleBadge(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>

                <div className="text-right hidden md:block">
                  <p className="text-xs font-semibold text-ink leading-tight">
                    {user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username}
                  </p>
                  <p className="text-[10px] text-muted font-mono">
                    {user.patient_id || `@${user.username}`}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-clinical-danger hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                >
                  {t('signOut')}
                </button>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle navigation menu"
                  className="lg:hidden p-2 rounded-lg text-muted hover:text-ink hover:bg-surface border border-hairline transition cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {mobileMenuOpen ? (
                      <>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </>
                    ) : (
                      <>
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </>
                    )}
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface rounded-lg transition">
                  {t('signIn')}
                </Link>
                <Link to="/register" className="px-3.5 py-1.5 text-xs font-semibold text-white bg-cobalt hover:bg-cobalt-hover rounded-lg transition">
                  {t('register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileMenuOpen && user && (
        <div className="lg:hidden border-t border-hairline bg-white px-4 pt-3 pb-5 space-y-3">
          <div className="flex items-center justify-between p-3 bg-surface rounded-xl border border-hairline">
            <div>
              <p className="text-xs font-semibold text-ink">
                {user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username}
              </p>
              <p className="text-[11px] text-muted font-mono">
                {user.patient_id || `@${user.username}`}
              </p>
            </div>
            <span className={`font-mono text-[10px] px-2.5 py-1 rounded-md font-semibold border ${getRoleBadge(user.role)}`}>
              {getRoleLabel(user.role)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
                  isCurrent(link.path) ? 'bg-cobalt text-white' : 'text-ink hover:bg-surface'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-hairline">
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-clinical-danger bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
