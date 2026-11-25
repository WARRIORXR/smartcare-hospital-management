/**
 * src/App.jsx
 * -----------
 * Root Application Component with React Router and Role-Based Route Protection.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';

// Auth Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Role Dashboards
import PatientDashboard from './pages/patient/PatientDashboard';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import ReceptionDashboard from './pages/reception/ReceptionDashboard';

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
import MedicalRecordsPage from './pages/records/MedicalRecordsPage';
import BillingPage from './pages/billing/BillingPage';

// Route Guard & Global Banners
import ProtectedRoute from './components/common/ProtectedRoute';
import ColdStartBanner from './components/common/ColdStartBanner';

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
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ColdStartBanner />
            <Routes>
              {/* Public Authentication Routes (Guests only; logged-in users redirect to dashboard) */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />

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

              {/* Front-Desk Reception Portal */}
              <Route element={<ProtectedRoute allowedRoles={['reception', 'admin']} />}>
                <Route path="/reception/dashboard" element={<ReceptionDashboard />} />
              </Route>

              {/* Module 1: Clinic Queue TV Display (Authorized Staff Only) */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'reception']} hideNavbar={true} />}>
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

              {/* Module 2: Inpatient Bed & Ward Management (Admin, Doctor & Reception) */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'reception']} />}>
                <Route path="/beds" element={<BedManagementDashboard />} />
              </Route>

              {/* Module 3: Blood Bank Inventory Management & Donors (Admin, Doctor, Blood Bank Staff) */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'bloodbank_staff']} />}>
                <Route path="/bloodbank" element={<BloodStockDashboard />} />
                <Route path="/bloodbank/stock" element={<BloodStockDashboard />} />
                <Route path="/bloodbank/donors" element={<DonorRegistrationPage />} />
              </Route>

              {/* Module 3: Emergency Blood Requisitions (Authorized Patients & Staff) */}
              <Route element={<ProtectedRoute allowedRoles={['admin', 'doctor', 'patient', 'bloodbank_staff', 'reception']} />}>
                <Route path="/bloodbank/requests" element={<BloodRequestPage />} />
              </Route>

              {/* Module 4: Medical Records, Prescriptions & Lab Reports */}
              <Route element={<ProtectedRoute allowedRoles={['patient', 'doctor', 'admin']} />}>
                <Route path="/records" element={<MedicalRecordsPage />} />
              </Route>

              {/* Module 5: Billing, Invoices & PDF Receipts */}
              <Route element={<ProtectedRoute allowedRoles={['patient', 'reception', 'doctor', 'admin']} />}>
                <Route path="/billing" element={<BillingPage />} />
              </Route>

              {/* Default Fallback Route */}
              <Route path="/" element={<RoleDispatcher />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
