/**
 * src/components/common/ProtectedRoute.jsx
 * -----------------------------------------
 * Route guard component that:
 *  1. Checks if the user is authenticated. If not -> redirects to /login.
 *  2. Checks if the user's role is permitted. If not -> redirects to their role dashboard.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from './Navbar';

const ProtectedRoute = ({ allowedRoles = [] }) => {
  const { user, isAuthenticated, loading, getDashboardPath } = useAuth();

  // If still checking localStorage auth token, show a light loading spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Not authenticated -> redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Role check: if route specifies allowedRoles and user role is not allowed
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect user to their own role dashboard
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  // Authenticated & authorized
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default ProtectedRoute;
