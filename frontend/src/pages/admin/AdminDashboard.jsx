/**
 * src/pages/admin/AdminDashboard.jsx
 * ----------------------------------
 * Dashboard for Hospital Administrators.
 * Provides system-wide monitoring, high-level metrics, and management access.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/40 border border-purple-300/30 mb-2">
              🛡️ System Administration
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Hospital Control Center
            </h1>
            <p className="mt-1 text-purple-200 text-sm">
              Logged in as {user?.first_name || user?.username} (Administrator). Overview of all hospital systems.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/admin/manage')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-sm font-bold shadow-md transition"
            >
              👨‍⚕️ Doctors & Depts
            </button>
            <button
              onClick={() => navigate('/admin/beds')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold shadow-md transition"
            >
              🛏️ Bed Management
            </button>
            <a
              href="http://localhost:8000/admin/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-white text-purple-900 text-sm font-bold shadow-md hover:bg-purple-50 transition"
            >
              Open Django Admin ↗
            </a>
          </div>
        </div>
      </div>

      {/* Hospital Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase">OPD Tokens Today</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg text-lg">🎟️</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">48</p>
          <p className="text-xs text-emerald-600 font-semibold mt-1">↑ Active Doctor Queues</p>
        </div>

        <div
          onClick={() => navigate('/admin/beds')}
          className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm cursor-pointer hover:border-purple-300 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase">Live Bed Dashboard</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg text-lg">🛏️</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">Live Grid</p>
          <p className="text-xs text-purple-600 font-semibold mt-1">🟢 Available • 🔴 Occupied →</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase">Blood Stock</span>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-lg text-lg">🩸</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">34 Units</p>
          <p className="text-xs text-amber-600 font-semibold mt-1">⚠️ O- Low in inventory</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase">System Status</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-lg">⚡</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">Operational</p>
          <p className="text-xs text-gray-500 mt-1">Django API & MySQL Connected</p>
        </div>
      </div>

      {/* Module Quick Management Grid */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Hospital Management Modules</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Module 1: OPD */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>🎟️</span> Module 1: OPD Queue System
          </h3>
          <p className="text-sm text-gray-600 mt-2">
            Configure hospital departments, assign doctors to OPD shifts, and oversee daily token issuance.
          </p>
          <ul className="text-xs text-gray-500 space-y-1.5 mt-4">
            <li>• Manage doctor consultation schedules</li>
            <li>• Monitor queue waiting times</li>
            <li>• Handle emergency token priority</li>
          </ul>
        </div>

        {/* Module 2: Beds */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>🛏️</span> Module 2: Bed Management
            </h3>
            <p className="text-sm text-gray-600 mt-2">
              Monitor ICU, General, and Private wards. Color-coded live availability (Green = Available, Red = Occupied).
            </p>
            <ul className="text-xs text-gray-500 space-y-1.5 mt-4">
              <li>• Real-time ward capacity tracking</li>
              <li>• Add Wards (General, ICU, Private) & Beds</li>
              <li>• Instant bed status toggle (Available, Occupied, Cleaning)</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/admin/beds')}
            className="mt-6 w-full py-2 px-4 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs transition"
          >
            Open Bed Management Dashboard →
          </button>
        </div>

        {/* Module 3: Blood Bank */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>🩸</span> Module 3: Blood Bank
          </h3>
          <p className="text-sm text-gray-600 mt-2">
            Track blood units across 8 blood groups. Manage blood donors and approve urgent hospital requests.
          </p>
          <ul className="text-xs text-gray-500 space-y-1.5 mt-4">
            <li>• Real-time units per blood group</li>
            <li>• Threshold alerts on depleted stock</li>
            <li>• Donor registration & donation history</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
