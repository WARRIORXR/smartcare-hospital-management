/**
 * src/components/common/Navbar.jsx
 * ---------------------------------
 * Minimal, Clean Universal Navigation Bar for SmartCare HMS.
 * Designed for clear visual hierarchy, calm clinical aesthetic, and easy role navigation.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const { user, logout, getDashboardPath } = useAuth();
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
      case 'admin': return '🛡️ Hospital Admin';
      case 'bloodbank_staff': return '🩸 Blood Bank';
      default: return role;
    }
  };

  const isCurrent = (path) => location.pathname === path;

  // Generate navigation links based on user role
  const getNavLinks = () => {
    if (!user) return [];

    switch (user.role) {
      case 'admin':
        return [
          { name: 'Analytics', path: '/admin/dashboard', icon: '📊' },
          { name: 'Staff & Clinics', path: '/admin/manage', icon: '👨‍⚕️' },
          { name: 'Ward Beds', path: '/admin/beds', icon: '🛏️' },
          { name: 'Blood Stock', path: '/bloodbank', icon: '🩸' },
          { name: 'Blood Requests', path: '/bloodbank/requests', icon: '📋' },
          { name: 'Public Display', path: '/display', icon: '📺' },
        ];
      case 'doctor':
        return [
          { name: 'OPD Queue', path: '/doctor/dashboard', icon: '👨‍⚕️' },
          { name: 'Ward Beds', path: '/beds', icon: '🛏️' },
          { name: 'Blood Bank', path: '/bloodbank', icon: '🩸' },
          { name: 'Blood Requests', path: '/bloodbank/requests', icon: '📋' },
          { name: 'Public Display', path: '/display', icon: '📺' },
        ];
      case 'patient':
        return [
          { name: 'My Portal', path: '/patient/dashboard', icon: '👤' },
          { name: 'Book OPD Token', path: '/patient/book-token', icon: '🎟️' },
          { name: 'My Passes', path: '/patient/tokens', icon: '📱' },
          { name: 'Doctors', path: '/patient/doctors', icon: '👨‍⚕️' },
          { name: 'Beds Status', path: '/beds', icon: '🛏️' },
          { name: 'Blood Requests', path: '/bloodbank/requests', icon: '🩸' },
        ];
      case 'bloodbank_staff':
        return [
          { name: 'Stock Inventory', path: '/bloodbank/stock', icon: '🩸' },
          { name: 'Blood Requests', path: '/bloodbank/requests', icon: '📋' },
          { name: 'Donors', path: '/bloodbank/donors', icon: '🤝' },
        ];
      default:
        return [
          { name: 'Dashboard', path: getDashboardPath(user.role), icon: '🏠' },
        ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand Logo */}
          <div className="flex items-center space-x-6">
            <div
              onClick={() => {
                setMobileMenuOpen(false);
                navigate(user ? getDashboardPath(user.role) : '/');
              }}
              className="flex items-center space-x-2.5 cursor-pointer group select-none"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-lg shadow-xs group-hover:scale-105 transition">
                🏥
              </div>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-lg font-bold text-slate-900 tracking-tight">SmartCare</span>
                <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  HMS
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            {user && (
              <nav className="hidden lg:flex items-center space-x-1">
                {navLinks.map((link) => {
                  const active = isCurrent(link.path);
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                      }`}
                    >
                      <span>{link.icon}</span>
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Right Section: User Profile & Actions */}
          <div className="flex items-center space-x-3">
            {user ? (
              <>
                {/* Role Badge (Desktop & Tablet) */}
                <span className={`hidden sm:inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold border ${getRoleBadge(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>

                {/* User Info (Desktop) */}
                <div className="text-right hidden md:block">
                  <p className="text-xs font-semibold text-slate-900 leading-tight">
                    {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {user.patient_id || `@${user.username}`}
                  </p>
                </div>

                {/* Sign Out Button (Desktop) */}
                <button
                  onClick={handleLogout}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition focus:outline-none cursor-pointer"
                  title="Sign out of SmartCare HMS"
                >
                  <span>Sign Out</span>
                  <span className="ml-1 text-sm">🚪</span>
                </button>

                {/* Mobile Hamburger Toggle Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle navigation menu"
                  className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                >
                  <span className="text-lg leading-none">
                    {mobileMenuOpen ? '✕' : '☰'}
                  </span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && user && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-2">
          {/* Mobile User Chip */}
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

          {/* Mobile Navigation Links */}
          <div className="space-y-1">
            {navLinks.map((link) => {
              const active = isCurrent(link.path);
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-base">{link.icon}</span>
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Mobile Sign Out */}
          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition cursor-pointer"
            >
              <span>Sign Out</span>
              <span>🚪</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
