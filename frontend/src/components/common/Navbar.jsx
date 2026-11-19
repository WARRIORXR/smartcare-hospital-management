/**
 * src/components/common/Navbar.jsx
 * ---------------------------------
 * Common navigation bar for authenticated users.
 * Displays brand, navigation links, user name, role badge, and logout button.
 */

import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const { user, logout, getDashboardPath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
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
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'patient': return 'Patient';
      case 'doctor': return 'Doctor';
      case 'admin': return 'Hospital Admin';
      default: return role;
    }
  };

  const isCurrent = (path) => location.pathname === path;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Navigation Links */}
          <div className="flex items-center space-x-8">
            <div
              onClick={() => navigate(user ? getDashboardPath(user.role) : '/')}
              className="flex items-center space-x-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl shadow-md group-hover:bg-blue-700 transition">
                🏥
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900 tracking-tight">SmartCare</span>
                <span className="hidden sm:inline-block ml-2 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                  HMS
                </span>
              </div>
            </div>

            {/* Navigation links based on role */}
            {user && (
              <nav className="hidden md:flex space-x-2">
                <Link
                  to={getDashboardPath(user.role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isCurrent(getDashboardPath(user.role))
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Dashboard
                </Link>

                {user.role === 'patient' && (
                  <>
                    <Link
                      to="/patient/book-token"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/patient/book-token')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Book Token
                    </Link>
                    <Link
                      to="/patient/tokens"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/patient/tokens')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🎟️ My Tokens
                    </Link>
                    <Link
                      to="/patient/doctors"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/patient/doctors')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Doctors
                    </Link>
                    <Link
                      to="/beds"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/beds')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🛏️ Live Beds
                    </Link>
                    <Link
                      to="/bloodbank"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/bloodbank')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🩸 Blood Bank
                    </Link>
                  </>
                )}

                {user.role === 'doctor' && (
                  <>
                    <Link
                      to="/beds"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/beds')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🛏️ Live Beds
                    </Link>
                    <Link
                      to="/bloodbank"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/bloodbank')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🩸 Blood Bank
                    </Link>
                    <Link
                      to="/bloodbank/requests"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/bloodbank/requests')
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      📋 Blood Requests
                    </Link>
                  </>
                )}

                {user.role === 'admin' && (
                  <>
                    <Link
                      to="/admin/manage"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/admin/manage')
                          ? 'bg-purple-50 text-purple-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      Staff & Departments
                    </Link>
                    <Link
                      to="/admin/beds"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/admin/beds')
                          ? 'bg-purple-50 text-purple-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🛏️ Beds
                    </Link>
                    <Link
                      to="/bloodbank"
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isCurrent('/bloodbank')
                          ? 'bg-purple-50 text-purple-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🩸 Blood Bank
                    </Link>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* User profile & Logout */}
          {user && (
            <div className="flex items-center space-x-4">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${getRoleBadge(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>

              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user.first_name ? `${user.first_name} ${user.last_name}` : user.username}
                </p>
                <p className="text-xs text-gray-500">@{user.username}</p>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition focus:outline-none"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
