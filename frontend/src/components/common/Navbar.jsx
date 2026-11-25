/**
 * src/components/common/Navbar.jsx
 * ---------------------------------
 * Minimal, Clean Universal Navigation Bar with role links & EN / HI / PA Language Switcher.
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
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'doctor':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'reception':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'admin':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'bloodbank_staff':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'patient': return '👤 Patient';
      case 'doctor': return '👨‍⚕️ Doctor';
      case 'reception': return '🧾 Receptionist';
      case 'admin': return '🛡️ Admin';
      case 'bloodbank_staff': return '🩸 Blood Bank';
      default: return role;
    }
  };

  const isCurrent = (path) => location.pathname === path;

  const getNavLinks = () => {
    if (!user) return [];
    switch (user.role) {
      case 'admin':
        return [
          { name: t('navAnalytics'), path: '/admin/dashboard', icon: '📊' },
          { name: t('navStaff'), path: '/admin/manage', icon: '👨‍⚕️' },
          { name: t('navBeds'), path: '/admin/beds', icon: '🛏️' },
          { name: t('navBloodStock'), path: '/bloodbank', icon: '🩸' },
          { name: t('navBilling'), path: '/billing', icon: '💳' },
          { name: t('navDisplay'), path: '/display', icon: '📺' },
        ];
      case 'doctor':
        return [
          { name: t('navQueue'), path: '/doctor/dashboard', icon: '👨‍⚕️' },
          { name: t('navRecords'), path: '/records', icon: '🩺' },
          { name: t('navBeds'), path: '/beds', icon: '🛏️' },
          { name: t('navBloodStock'), path: '/bloodbank', icon: '🩸' },
          { name: t('navDisplay'), path: '/display', icon: '📺' },
        ];
      case 'reception':
        return [
          { name: t('navReceptionDesk'), path: '/reception/dashboard', icon: '🧾' },
          { name: t('navBeds'), path: '/beds', icon: '🛏️' },
          { name: t('navBilling'), path: '/billing', icon: '💳' },
          { name: t('navBloodRequests'), path: '/bloodbank/requests', icon: '📋' },
          { name: t('navDisplay'), path: '/display', icon: '📺' },
        ];
      case 'patient':
        return [
          { name: t('navMyPortal'), path: '/patient/dashboard', icon: '👤' },
          { name: t('navBookToken'), path: '/patient/book-token', icon: '🎟️' },
          { name: t('navMyPasses'), path: '/patient/tokens', icon: '📱' },
          { name: t('navRecords'), path: '/records', icon: '🩺' },
          { name: t('navBilling'), path: '/billing', icon: '💳' },
          { name: t('navBloodRequests'), path: '/bloodbank/requests', icon: '🩸' },
        ];
      case 'bloodbank_staff':
        return [
          { name: t('navBloodStock'), path: '/bloodbank/stock', icon: '🩸' },
          { name: t('navBloodRequests'), path: '/bloodbank/requests', icon: '📋' },
          { name: t('navDonors'), path: '/bloodbank/donors', icon: '🤝' },
        ];
      default:
        return [{ name: 'Dashboard', path: getDashboardPath(user.role), icon: '🏠' }];
    }
  };

  const navLinks = getNavLinks();

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-5">
            <div
              onClick={() => {
                setMobileMenuOpen(false);
                navigate(user ? getDashboardPath(user.role) : '/');
              }}
              className="flex items-center space-x-2 cursor-pointer group select-none"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-lg shadow-xs group-hover:scale-105 transition">
                🏥
              </div>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-lg font-bold text-slate-900 tracking-tight">{t('brand')}</span>
                <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  {t('hms')}
                </span>
              </div>
            </div>

            {user && (
              <nav className="hidden xl:flex items-center space-x-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isCurrent(link.path)
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <span>{link.icon}</span>
                    <span>{link.name}</span>
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Multilingual EN / Hindi / Punjabi Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setLang(opt.code)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                    lang === opt.code
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {user ? (
              <>
                <span className={`hidden sm:inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold border ${getRoleBadge(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>

                <div className="text-right hidden md:block">
                  <p className="text-xs font-semibold text-slate-900 leading-tight">
                    {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {user.patient_id || `@${user.username}`}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                >
                  <span>{t('signOut')}</span>
                  <span className="ml-1 text-sm">🚪</span>
                </button>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle navigation menu"
                  className="xl:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                >
                  <span className="text-lg leading-none">{mobileMenuOpen ? '✕' : '☰'}</span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/login" className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition">
                  {t('signIn')}
                </Link>
                <Link to="/register" className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs">
                  {t('register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileMenuOpen && user && (
        <div className="xl:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-2">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl mb-3 border border-slate-200/80">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                {user.patient_id || `@${user.username}`}
              </p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${getRoleBadge(user.role)}`}>
              {getRoleLabel(user.role)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  isCurrent(link.path) ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-base">{link.icon}</span>
                <span>{link.name}</span>
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition cursor-pointer"
            >
              <span>{t('signOut')}</span>
              <span>🚪</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
