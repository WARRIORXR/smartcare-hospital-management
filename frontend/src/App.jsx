/**
 * src/App.jsx
 * -----------
 * Root Application Component with React Router and Role-Based Route Protection.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Auth Pages
import Login from './pages/Login';
import Register from './pages/Register';

// Role Dashboards
import PatientDashboard from './pages/patient/PatientDashboard';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

// Module Management & Directory Pages
import AdminDoctorManagement from './pages/admin/AdminDoctorManagement';
import DoctorList from './pages/patient/DoctorList';
import MyTokens from './pages/patient/MyTokens';

// Route Guard
import ProtectedRoute from './components/common/ProtectedRoute';

// Helper component that redirects root / and /dashboard to role-specific dashboard
const RoleDispatcher = () => {
  const { user, isAuthenticated, loading, getDashboardPath } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDashboardPath(user.role)} replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Role Dispatcher Route */}
          <Route path="/dashboard" element={<RoleDispatcher />} />

          {/* Protected Patient Routes */}
          <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
            <Route path="/patient/dashboard" element={<PatientDashboard />} />
            <Route path="/patient/doctors" element={<DoctorList />} />
            <Route path="/patient/tokens" element={<MyTokens />} />
          </Route>

          {/* Protected Doctor Routes */}
          <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
          </Route>

          {/* Protected Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/manage" element={<AdminDoctorManagement />} />
          </Route>

          {/* Default Fallback Route */}
          <Route path="/" element={<RoleDispatcher />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
