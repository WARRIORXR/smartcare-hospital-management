/**
 * src/pages/patient/PatientDashboard.jsx
 * --------------------------------------
 * Dashboard specifically designed for Patients.
 * Displays patient details, patient ID, live 5s proximity alerts (SMS / WhatsApp / In-App),
 * integrated journey modal (Modules 1-5), and quick actions across all hospital modules.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import authService from '../../services/authService';
import opdService from '../../services/opdService';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';

const PatientDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Live Proximity Notifications State (5s polling)
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);

  // Unified Journey Modal State
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await opdService.getNotifications();
      const list = Array.isArray(data) ? data : data?.results || [];
      setNotifications(list);
    } catch (err) {
      console.error('Could not fetch notifications', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'patient') return;

    const fetchInitial = async () => {
      try {
        const data = await authService.getProfile();
        setProfile(data.profile);
      } catch (err) {
        console.error('Could not fetch patient profile', err);
      } finally {
        setLoading(false);
      }
      await loadNotifications();
    };

    fetchInitial();
    const intervalId = setInterval(loadNotifications, 5000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, user, loadNotifications]);

  // Defensive Guard: Only Patients can access Patient Portal
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthenticated || !user || user.role !== 'patient') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleMarkNotificationRead = async (id) => {
    try {
      setNotifLoading(true);
      await opdService.markNotificationRead(id);
      await loadNotifications();
    } catch (err) {
      console.error('Failed to mark notification read', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setNotifLoading(true);
      await opdService.markAllNotificationsRead();
      await loadNotifications();
    } catch (err) {
      console.error('Failed to mark all notifications read', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const resolvedPatientId = profile?.id || user?.patient_id_pk || user?.id;

  const openJourneyModal = () => {
    setJourneyModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/40 border border-emerald-300/30">
                👤 {t('patientPortal')}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 border border-white/20 text-emerald-50">
                <span className="w-2 h-2 rounded-full bg-lime-300 animate-pulse"></span>
                {t('liveQueueActive')}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t('welcome')}, {user?.first_name || user?.username}!
            </h1>
            <p className="mt-1 text-emerald-100 text-sm">
              Manage your OPD tokens, bed status, clinical records, invoices, and proximity alerts in one place.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-emerald-200">Patient ID</span>
            <span className="text-lg font-bold font-mono text-white">
              {loading ? '...' : profile?.patient_id || user?.patient_id || 'PAT-0001'}
            </span>
          </div>
        </div>
      </div>

      {/* Patient Vitals & Info Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Blood Group</p>
          <p className="text-xl font-bold text-red-600 mt-1">
            {profile?.blood_group || user?.blood_group || 'Not Specified'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Gender</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {profile?.gender === 'M' ? 'Male' : profile?.gender === 'F' ? 'Female' : 'Other'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Registered Mobile</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {user?.phone || 'Not set'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Portal Status</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-semibold text-emerald-700">Active</span>
          </div>
        </div>
      </div>

      {/* Live Queue Proximity Notifications (SMS / WhatsApp / In-App) */}
      <div className={`rounded-2xl p-5 mb-8 border shadow-sm transition ${unreadCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔔</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
                {t('notificationsTitle')}
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-600 text-white">
                    {unreadCount} New
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500">Auto-refreshes every 5 seconds when queue positions update.</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={notifLoading}
              className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition"
            >
              Mark All Read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="text-xs text-gray-500 italic">{t('noNotifications')}</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {notifications.slice(0, 6).map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  n.is_read ? 'bg-gray-50 border-gray-200 text-gray-600' : 'bg-white border-amber-300 text-gray-900 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">
                      {n.channel || 'in_app'}
                    </span>
                    {n.token_code && (
                      <span className="font-mono font-bold text-blue-700">{n.token_code}</span>
                    )}
                    <span className="font-bold">{n.title}</span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(n.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs">{n.message}</p>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => handleMarkNotificationRead(n.id)}
                    disabled={notifLoading}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[11px] transition"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Patient Journey Banner (Step 13) */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 rounded-2xl p-6 text-white shadow-md mb-8 flex flex-col md:flex-row items-center justify-between gap-6 border border-indigo-700/50">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 mb-2">
            <span>🔗 Connected Care Journey</span>
            <span>•</span>
            <span className="font-mono text-white font-bold">{profile?.patient_id || user?.patient_id || 'PAT-0001'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Your Integrated Medical Timeline</h2>
          <p className="text-sm text-indigo-200 mt-1 max-w-2xl">
            All 5 modules (OPD Consultation &rarr; Bed Allocation &rarr; Blood Bank &rarr; Medical Records &rarr; Billing) are connected under your unique Patient ID.
          </p>
        </div>
        <button
          onClick={openJourneyModal}
          className="shrink-0 px-5 py-3 rounded-xl bg-white text-indigo-950 font-bold text-sm hover:bg-indigo-50 transition shadow-lg flex items-center gap-2"
        >
          <span>📜</span>
          <span>View My Medical Journey</span>
        </button>
      </div>

      {/* Main Module Action Cards */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">SmartCare Services</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Module 1: OPD Token Queue */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 text-2xl flex items-center justify-center mb-4">
              🎟️
            </div>
            <h3 className="text-lg font-bold text-gray-900">OPD Token Queue</h3>
            <p className="text-sm text-gray-600 mt-2">
              Book a doctor consultation token and view live queue updates so you don't wait in long lines.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => navigate('/patient/book-token')}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition shadow-xs"
            >
              🎟️ Book OPD Token (Live Queue)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/patient/tokens')}
                className="w-full py-1.5 px-2 rounded-lg bg-blue-50 text-blue-700 font-medium text-xs hover:bg-blue-100 transition text-center"
              >
                📱 My Tokens
              </button>
              <button
                onClick={() => navigate('/patient/doctors')}
                className="w-full py-1.5 px-2 rounded-lg bg-gray-100 text-gray-700 font-medium text-xs hover:bg-gray-200 transition text-center"
              >
                👨‍⚕️ Doctor List
              </button>
            </div>
          </div>
        </div>

        {/* Module 2: Bed Management */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 text-2xl flex items-center justify-center mb-4">
              🛏️
            </div>
            <h3 className="text-lg font-bold text-gray-900">Inpatient Care</h3>
            <p className="text-sm text-gray-600 mt-2">
              Check your personal inpatient admission record, assigned ward, bed allocation, and attending doctor.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={openJourneyModal}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition"
            >
              📋 My Inpatient Admission Status
            </button>
            <button
              onClick={openJourneyModal}
              className="w-full py-1.5 px-2 rounded-lg bg-purple-50 text-purple-700 font-medium text-xs hover:bg-purple-100 transition text-center"
            >
              📜 View Full Care Timeline
            </button>
          </div>
        </div>

        {/* Module 3: Blood Bank */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 text-2xl flex items-center justify-center mb-4">
              🩸
            </div>
            <h3 className="text-lg font-bold text-gray-900">Blood Requisition</h3>
            <p className="text-sm text-gray-600 mt-2">
              Submit emergency or planned blood requests directly to the hospital blood bank and track real-time fulfillment.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => navigate('/bloodbank/requests')}
              className="w-full py-2 px-4 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition"
            >
              🩸 Emergency Blood Request
            </button>
            <button
              onClick={() => navigate('/bloodbank/requests')}
              className="w-full py-1.5 px-2 rounded-lg bg-rose-50 text-rose-700 font-medium text-xs hover:bg-rose-100 transition text-center"
            >
              📋 My Blood Request History
            </button>
          </div>
        </div>

        {/* Module 4: Clinical Medical Records & Lab Reports */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 text-2xl flex items-center justify-center mb-4">
              🩺
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('medicalRecordsTitle')}</h3>
            <p className="text-sm text-gray-600 mt-2">
              View doctor prescriptions, consultation diagnoses, visit notes, and download verified lab report files.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => navigate('/records')}
              className="w-full py-2 px-4 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition"
            >
              📂 Open My Medical Records
            </button>
          </div>
        </div>

        {/* Module 5: Billing & PDF Receipts */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 text-2xl flex items-center justify-center mb-4">
              🧾
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('billingTitle')}</h3>
            <p className="text-sm text-gray-600 mt-2">
              Review itemized OPD & inpatient ward invoices, complete pending payments, and download PDF receipts.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => navigate('/billing')}
              className="w-full py-2 px-4 rounded-lg bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 transition"
            >
              💳 View Invoices & PDF Receipts
            </button>
          </div>
        </div>
      </div>

      {/* Unified Patient Journey Timeline Modal (Modules 1-5) */}
      <PatientJourneyModal
        isOpen={journeyModalOpen}
        onClose={() => setJourneyModalOpen(false)}
        patientId={resolvedPatientId}
      />
    </div>
  );
};

export default PatientDashboard;
