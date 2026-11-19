/**
 * src/pages/doctor/DoctorDashboard.jsx
 * ------------------------------------
 * Dashboard specifically designed for Doctors.
 * Displays doctor specialization, live queue summary, and consultation controls.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';

const DoctorDashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await authService.getProfile();
        setProfile(data.profile);
      } catch (err) {
        console.error('Could not fetch doctor profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/40 border border-blue-300/30 mb-2">
              👨‍⚕️ Doctor Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome, Dr. {user?.first_name} {user?.last_name}!
            </h1>
            <p className="mt-1 text-blue-100 text-sm">
              {profile?.specialization || 'Consultant Physician'} • {profile?.department_name || 'General OPD'}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-blue-200">OPD Status</span>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-base font-bold text-white">On Duty</span>
            </div>
          </div>
        </div>
      </div>

      {/* OPD Live Queue Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Current Serving Token</p>
          <p className="text-3xl font-extrabold text-blue-600 mt-1">#12</p>
          <span className="text-xs text-gray-500 mt-1 block">Live in Consultation Room</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Waiting in Queue</p>
          <p className="text-3xl font-extrabold text-amber-600 mt-1">8</p>
          <span className="text-xs text-gray-500 mt-1 block">Estimated time: ~40 mins</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Completed Today</p>
          <p className="text-3xl font-extrabold text-emerald-600 mt-1">11</p>
          <span className="text-xs text-gray-500 mt-1 block">Patients visited today</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Experience & Fee</p>
          <p className="text-lg font-bold text-gray-800 mt-1">
            {profile?.experience_years || 0} Years Exp.
          </p>
          <span className="text-xs text-gray-500 block">
            ₹{profile?.consultation_fee || '500.00'} per visit
          </span>
        </div>
      </div>

      {/* Doctor Action Center */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Doctor Management Center</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Call Next Patient */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 text-2xl flex items-center justify-center mb-4">
            📢
          </div>
          <h3 className="text-lg font-bold text-gray-900">Call Next Patient</h3>
          <p className="text-sm text-gray-600 mt-2">
            Call token #13 into your room and update the reception queue display board in real time.
          </p>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('OPD Token call will be activated in Step 4!')}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition"
            >
              Call Next (Token #13)
            </button>
          </div>
        </div>

        {/* Inpatient Bed Admissions */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 text-2xl flex items-center justify-center mb-4">
            🛏️
          </div>
          <h3 className="text-lg font-bold text-gray-900">Admitted Patients</h3>
          <p className="text-sm text-gray-600 mt-2">
            Review admitted patients in ICU & General Wards under your supervision, and record discharge notes.
          </p>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('Bed admissions viewer will be activated in Step 5!')}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition"
            >
              View Inpatients
            </button>
          </div>
        </div>

        {/* Emergency Blood Requests */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 text-2xl flex items-center justify-center mb-4">
            🩸
          </div>
          <h3 className="text-lg font-bold text-gray-900">Urgent Blood Requests</h3>
          <p className="text-sm text-gray-600 mt-2">
            Order urgent blood bags for operating theater emergencies and track inventory reservation.
          </p>
          <div className="mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('Emergency blood requests will be activated in Step 6!')}
              className="w-full py-2 px-4 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition"
            >
              Order Blood for Surgery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
