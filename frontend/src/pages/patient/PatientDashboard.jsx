/**
 * src/pages/patient/PatientDashboard.jsx
 * --------------------------------------
 * Dashboard specifically designed for Patients.
 * Displays patient details, patient ID, and quick actions for the 3 project modules.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await authService.getProfile();
        setProfile(data.profile);
      } catch (err) {
        console.error('Could not fetch patient profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/40 border border-emerald-300/30 mb-2">
              👤 Patient Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome, {user?.first_name || user?.username}!
            </h1>
            <p className="mt-1 text-emerald-100 text-sm">
              Manage your OPD tokens, bed reservations, and blood bank requests from your portal.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-emerald-200">Patient ID</span>
            <span className="text-lg font-bold font-mono text-white">
              {profile?.patient_id || user?.patient_id || 'PAT-0001'}
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

      {/* Main Module Action Cards */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">SmartCare Services</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              onClick={() => navigate('/patient/doctors')}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition shadow-xs"
            >
              👨‍⚕️ View Doctor Directory & Rooms
            </button>
            <button
              onClick={() => alert('OPD Token Queue booking will be activated in Step 5!')}
              className="w-full py-1.5 px-4 rounded-lg bg-blue-50 text-blue-700 font-medium text-xs hover:bg-blue-100 transition"
            >
              Book OPD Token (Queue)
            </button>
          </div>
        </div>

        {/* Module 2: Bed Management */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 text-2xl flex items-center justify-center mb-4">
              🛏️
            </div>
            <h3 className="text-lg font-bold text-gray-900">Bed Availability</h3>
            <p className="text-sm text-gray-600 mt-2">
              Check real-time bed capacity across ICU, General, and Private wards for emergency or planned admission.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('Bed availability viewer will be activated in Step 5!')}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition"
            >
              View Available Beds
            </button>
          </div>
        </div>

        {/* Module 3: Blood Bank */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 text-2xl flex items-center justify-center mb-4">
              🩸
            </div>
            <h3 className="text-lg font-bold text-gray-900">Blood Bank Request</h3>
            <p className="text-sm text-gray-600 mt-2">
              Submit emergency or standard blood requests directly to the hospital blood bank and track status.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('Blood Bank request system will be activated in Step 6!')}
              className="w-full py-2 px-4 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition"
            >
              Request Blood Units
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
