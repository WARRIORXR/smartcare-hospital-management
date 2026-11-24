/**
 * src/App.jsx
 * -----------
 * Root Application Component with React Router and Role-Based Route Protection.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

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
import BookTokenPage from './pages/patient/BookTokenPage';
import PublicDisplayScreen from './pages/public/PublicDisplayScreen';
import BedManagementDashboard from './pages/beds/BedManagementDashboard';
import BloodStockDashboard from './pages/bloodbank/BloodStockDashboard';
import DonorRegistrationPage from './pages/bloodbank/DonorRegistrationPage';
import BloodRequestPage from './pages/bloodbank/BloodRequestPage';

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
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          {/* Public Authentication Routes (Guests only; logged-in users redirect to dashboard) */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Role Dispatcher Route */}
          <Route path="/dashboard" element={<RoleDispatcher />} />

          {/* Module 1: Patient OPD & Personal Care Portal */}
          <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
            <Route path="/patient/dashboard" element={<PatientDashboard />} />
            <Route path="/patient/book-token" element={<BookTokenPage />} />
            <Route path="/patient/doctors" element={<DoctorList />} />
            <Route path="/patient/tokens" element={<MyTokens />} />
          </Route>

          {/* Module 1: Doctor Consultation & Live Clinic Queue */}
          <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
            <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
          </Route>

          {/* Module 1: Clinic Queue TV Display (Authorized Doctors and Admins Only) */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor']} hideNavbar={true} />}>
            <Route path="/display/:doctorId" element={<PublicDisplayScreen />} />
            <Route path="/display" element={<PublicDisplayScreen />} />
          </Route>

          {/* Executive Hospital Administration */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/manage" element={<AdminDoctorManagement />} />
            <Route path="/admin/beds" element={<BedManagementDashboard />} />
            <Route path="/admin/bloodbank" element={<BloodStockDashboard />} />
          </Route>

          {/* Module 2: Inpatient Bed & Ward Management (Admin & Doctor Only) */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor']} />}>
            <Route path="/beds" element={<BedManagementDashboard />} />
          </Route>

          {/* Module 3: Blood Bank Inventory Management & Donors (Admin, Doctor, Staff Only) */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'bloodbank_staff']} />}>
            <Route path="/bloodbank" element={<BloodStockDashboard />} />
            <Route path="/bloodbank/stock" element={<BloodStockDashboard />} />
            <Route path="/bloodbank/donors" element={<DonorRegistrationPage />} />
          </Route>

          {/* Module 3: Emergency Blood Requisitions (All Authenticated Users) */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'patient', 'bloodbank_staff']} />}>
            <Route path="/bloodbank/requests" element={<BloodRequestPage />} />
          </Route>

          {/* Default Fallback Route */}
          <Route path="/" element={<RoleDispatcher />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
  );
}

export default App;
