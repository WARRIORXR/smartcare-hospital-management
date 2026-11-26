/**
 * src/components/common/ProtectedRoute.jsx
 * -----------------------------------------
 * Route guard component with Editorial Clinical Canvas, Universal Navbar,
 * and Guided Role-Based WorkflowBar across all pages.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from './Navbar';
import WorkflowBar from './WorkflowBar';

const ProtectedRoute = ({ allowedRoles = [], hideNavbar = false }) => {
  const { user, isAuthenticated, loading, getDashboardPath } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-cobalt"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {!hideNavbar && (
        <>
          <Navbar />
          <WorkflowBar />
        </>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default ProtectedRoute;
