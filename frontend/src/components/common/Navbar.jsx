/**
 * src/components/common/Navbar.jsx
 * ---------------------------------
 * Universal Navigation Bar for SmartCare HMS.
 *
 * Features:
 *   - Role-specific navigation links (Patient, Doctor, Admin, Blood Bank Staff)
 *   - Mobile responsive hamburger menu with full drawer navigation
 *   - Live active route indicator
 *   - User profile chip with role badge
 *   - Safe and instant Sign Out (clears session & redirects to /login)
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
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'doctor':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'bloodbank_staff':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'patient': return '👤 Patient';
      case 'doctor': return '👨‍⚕️ Doctor';
      case 'admin': return '🛡️ Hospital Admin';
      case 'bloodbank_staff': return '🩸 Blood Bank Staff';
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
          { name: '📊 Analytics', path: '/admin/dashboard' },
          { name: '👨‍⚕️ Staff & Depts', path: '/admin/manage' },
          { name: '🛏️ Beds Grid', path: '/admin/beds' },
          { name: '🩸 Blood Stock', path: '/bloodbank' },
          { name: '📋 Blood Requests', path: '/bloodbank/requests' },
          { name: '📺 TV Display', path: '/display' },
        ];
      case 'doctor':
        return [
          { name: '👨‍⚕️ Consultation Queue', path: '/doctor/dashboard' },
          { name: '🛏️ Live Beds', path: '/beds' },
          { name: '🩸 Blood Bank', path: '/bloodbank' },
          { name: '📋 Blood Requests', path: '/bloodbank/requests' },
          { name: '📺 TV Display', path: '/display' },
        ];
      case 'patient':
        return [
          { name: '👤 My Portal', path: '/patient/dashboard' },
          { name: '🎟️ Book OPD Token', path: '/patient/book-token' },
          { name: '📱 My Tokens', path: '/patient/tokens' },
          { name: '👨‍⚕️ Doctor List', path: '/patient/doctors' },
          { name: '🛏️ Live Beds', path: '/beds' },
          { name: '🩸 Blood Requests', path: '/bloodbank/requests' },
        ];
      case 'bloodbank_staff':
        return [
          { name: '🩸 Blood Stock Grid', path: '/bloodbank/stock' },
          { name: '📋 Blood Requests', path: '/bloodbank/requests' },
          { name: '🤝 Donor Directory', path: '/bloodbank/donors' },
        ];
      default:
        return [
          { name: 'Dashboard', path: getDashboardPath(user.role) },
        ];
    }
  };

  const navLinks = getNavLinks();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl shadow-md group-hover:scale-105 transition">
                🏥
              </div>
              <div>
                <span className="text-xl font-extrabold text-gray-900 tracking-tight">SmartCare</span>
                <span className="ml-1.5 text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                  HMS
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            {user && (
              <nav className="hidden lg:flex items-center space-x-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      isCurrent(link.path)
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {/* Right Section: User Profile & Actions */}
          <div className="flex items-center space-x-3">
            {user ? (
              <>
                {/* Role Badge (Desktop & Tablet) */}
                <span className={`hidden sm:inline-block text-xs px-2.5 py-1 rounded-full font-bold border ${getRoleBadge(user.role)}`}>
                  {getRoleLabel(user.role)}
                </span>

                {/* User Info (Desktop) */}
                <div className="text-right hidden md:block">
                  <p className="text-xs font-bold text-gray-900 leading-tight">
                    {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
                  </p>
                  <p className="text-[11px] text-gray-500 font-mono">
                    {user.patient_id || `@${user.username}`}
                  </p>
                </div>

                {/* Sign Out Button (Desktop) */}
                <button
                  onClick={handleLogout}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition focus:outline-none"
                  title="Sign out of SmartCare HMS"
                >
                  <span>Sign Out</span>
                  <span className="ml-1.5">🚪</span>
                </button>

                {/* Mobile Hamburger Toggle Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Toggle navigation menu"
                  className="lg:hidden p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition focus:outline-none"
                >
                  <span className="text-xl leading-none">
                    {mobileMenuOpen ? '✕' : '☰'}
                  </span>
                </button>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-xs"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Mobile Navigation Drawer */}
      {/* ───────────────────────────────────────────────────────────── */}
      {mobileMenuOpen && user && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 pt-3 pb-6 shadow-xl animate-fadeIn">
          {/* User Profile in Drawer */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-900">
                {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
              </p>
              <p className="text-xs text-gray-500 font-mono">
                {user.patient_id ? `ID: ${user.patient_id}` : `@${user.username}`}
              </p>
            </div>
            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${getRoleBadge(user.role)}`}>
              {getRoleLabel(user.role)}
            </span>
          </div>

          {/* Navigation Links List */}
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                  isCurrent(link.path)
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Sign Out Button in Mobile Drawer */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition"
            >
              <span>Sign Out of SmartCare</span>
              <span>🚪</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
