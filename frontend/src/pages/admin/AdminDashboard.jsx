/**
 * src/pages/admin/AdminDashboard.jsx
 * ----------------------------------
 * Hospital Executive Analytics & Control Center powered by Chart.js.
 *
 * Visualizes:
 *   1. Total Tokens Today (with status breakdown)
 *   2. Average Waiting Time (in minutes)
 *   3. Busiest Department (with tokens count)
 *   4. Bed Occupancy Percentage (with ward-by-ward capacity)
 *   5. Blood Stock Low Alerts (< 3 units critical threshold)
 *
 * Connected live to Django Backend Analytics API (/api/accounts/admin/analytics/).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';

// Chart.js & react-chartjs-2 registration
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

const AdminDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Defensive Guard: Only Admin can access
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthenticated || !user || (user.role !== 'admin' && !user.is_staff)) {
    return <Navigate to="/dashboard" replace />;
  }

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      setError(null);
      const data = await hospitalService.getAdminAnalytics();
      setAnalytics(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load admin analytics', err);
      setError(err?.response?.data?.detail || 'Unable to connect to analytics service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Periodic Auto-Refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics]);

  const kpis = analytics?.summary_kpis;
  const charts = analytics?.charts;
  const lowStockAlerts = analytics?.alerts?.low_blood_stock || [];

  // ─────────────────────────────────────────────
  // Chart 1: Blood Stock Levels (Bar Chart)
  // ─────────────────────────────────────────────
  const bloodStockChartData = {
    labels: charts?.blood_stock_levels?.labels || ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    datasets: [
      {
        label: 'Units in Stock',
        data: charts?.blood_stock_levels?.data || [0, 0, 0, 0, 0, 0, 0, 0],
        backgroundColor: charts?.blood_stock_levels?.colors || '#3b82f6',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ffffff',
      },
    ],
  };

  const bloodStockChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.raw;
            return `${val} Units ${val < 3 ? '🚨 (CRITICAL: Below 3 Units)' : '✅ (Safe)'}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 2 },
        grid: { color: '#f3f4f6' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  // ─────────────────────────────────────────────
  // Chart 2: OPD Token Status (Doughnut Chart)
  // ─────────────────────────────────────────────
  const tokenStatusChartData = {
    labels: charts?.token_status_distribution?.labels || ['Waiting', 'Called / In Progress', 'Completed', 'Admitted', 'Skipped / Cancelled'],
    datasets: [
      {
        data: charts?.token_status_distribution?.data || [0, 0, 0, 0, 0],
        backgroundColor: charts?.token_status_distribution?.colors || [
          '#f59e0b',
          '#3b82f6',
          '#10b981',
          '#8b5cf6',
          '#ef4444',
        ],
        hoverOffset: 6,
      },
    ],
  };

  const tokenStatusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 12, font: { size: 11 } },
      },
    },
    cutout: '65%',
  };

  // ─────────────────────────────────────────────
  // Chart 3: Department Tokens (Bar Chart)
  // ─────────────────────────────────────────────
  const departmentChartData = {
    labels: charts?.department_tokens?.labels || [],
    datasets: [
      {
        label: 'Patients / Tokens',
        data: charts?.department_tokens?.data || [],
        backgroundColor: '#6366f1',
        borderRadius: 8,
      },
    ],
  };

  const departmentChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
        grid: { color: '#f3f4f6' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  // ─────────────────────────────────────────────
  // Chart 4: Bed Occupancy by Ward (Stacked Bar)
  // ─────────────────────────────────────────────
  const wardOccupancyChartData = {
    labels: charts?.ward_occupancy?.labels || [],
    datasets: [
      {
        label: 'Occupied Beds',
        data: charts?.ward_occupancy?.occupied || [],
        backgroundColor: '#ef4444',
        borderRadius: 6,
      },
      {
        label: 'Available Beds',
        data: charts?.ward_occupancy?.available || [],
        backgroundColor: '#10b981',
        borderRadius: 6,
      },
    ],
  };

  const wardOccupancyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 12, font: { size: 11 } },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: { stacked: true, beginAtZero: true, ticks: { stepSize: 2 } },
    },
  };

  // ─────────────────────────────────────────────
  // Chart 5: 7-Day Patient Trend (Line Chart)
  // ─────────────────────────────────────────────
  const trendChartData = {
    labels: charts?.daily_token_trend?.labels || [],
    datasets: [
      {
        label: 'Daily Tokens',
        data: charts?.daily_token_trend?.data || [],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#8b5cf6',
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 2 },
        grid: { color: '#f3f4f6' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Admin Header & Live Controls */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl border border-purple-900/40">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/30 border border-purple-400/30 text-purple-200 mb-2">
              <span>📊 Real-Time Operations</span>
              <span>•</span>
              <span>SmartCare HMS Analytics</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Hospital Executive Control Center
            </h1>
            <p className="mt-1 text-purple-200 text-sm max-w-2xl">
              Live operational metrics across OPD Token Queues, Inpatient Bed Allocations, and Blood Bank Inventory.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchAnalytics()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700/60 hover:bg-purple-600 text-white text-xs font-bold border border-purple-500/40 shadow-sm transition"
              title="Refresh Analytics"
            >
              <span>🔄</span> Refresh
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                autoRefresh
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}></span>
              {autoRefresh ? 'Live (15s)' : 'Auto-refresh Off'}
            </button>
            <button
              onClick={() => navigate('/admin/manage')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition"
            >
              👨‍⚕️ Doctors & Depts
            </button>
            <button
              onClick={() => navigate('/admin/beds')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition"
            >
              🛏️ Beds Grid
            </button>
            <button
              onClick={() => navigate('/bloodbank')}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition"
            >
              🩸 Blood Bank
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-purple-800/50 flex flex-wrap items-center justify-between text-xs text-purple-300">
          <span>Administrator: <strong className="text-white">{user?.first_name || user?.username}</strong></span>
          <span>Last synced: {lastRefreshed.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Critical Alerts Banner (Blood Stock < 3 Units) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {lowStockAlerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <h3 className="text-sm font-bold text-red-900">
                Critical Blood Bank Stock Alert ({lowStockAlerts.length} Group{lowStockAlerts.length > 1 ? 's' : ''} Under 3 Units)
              </h3>
              <p className="text-xs text-red-700 mt-0.5">
                Immediate donor outreach recommended for:{' '}
                <span className="font-bold font-mono">
                  {lowStockAlerts.map(a => `${a.blood_group} (${a.units_available}u)`).join(', ')}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/bloodbank/donors')}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-xs"
            >
              📞 Contact Donors
            </button>
            <button
              onClick={() => navigate('/bloodbank')}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold transition"
            >
              Update Units &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && !analytics && (
        <div className="py-20 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-sm font-medium text-gray-500">Calculating real-time analytics from database...</p>
        </div>
      )}

      {error && !analytics && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
          <p className="text-red-700 font-semibold mb-3">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition"
          >
            Retry Analytics Query
          </button>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 5 Primary KPI Cards (Step 14 Requirement) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* KPI 1: Total Tokens Today */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tokens Today</span>
                  <span className="p-2 bg-blue-50 text-blue-600 rounded-xl text-lg">🎟️</span>
                </div>
                <div className="text-3xl font-extrabold text-gray-900">
                  {kpis?.total_tokens_today ?? 0}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-500">
                <span className="text-amber-600 font-semibold">⏳ {kpis?.waiting_tokens ?? 0} Wait</span>
                <span className="text-blue-600 font-semibold">📢 {kpis?.called_tokens ?? 0} In Call</span>
                <span className="text-emerald-600 font-semibold">✅ {kpis?.completed_tokens ?? 0} Done</span>
              </div>
            </div>

            {/* KPI 2: Average Waiting Time */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Waiting Time</span>
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-xl text-lg">⏱️</span>
                </div>
                <div className="text-3xl font-extrabold text-amber-600">
                  {kpis?.average_waiting_time_display ?? '15 mins'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-500 flex items-center justify-between">
                <span>Per patient queue wait</span>
                <span className="text-emerald-600 font-medium">OPD Standard</span>
              </div>
            </div>

            {/* KPI 3: Busiest Department */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Busiest Dept</span>
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl text-lg">🏢</span>
                </div>
                <div className="text-xl font-extrabold text-indigo-950 truncate" title={kpis?.busiest_department?.name}>
                  {kpis?.busiest_department?.name || 'General OPD'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-500 flex items-center justify-between">
                <span>Total Patients:</span>
                <span className="font-bold text-indigo-600">{kpis?.busiest_department?.tokens_count ?? 0} tokens</span>
              </div>
            </div>

            {/* KPI 4: Bed Occupancy Percentage */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bed Occupancy</span>
                  <span className="p-2 bg-purple-50 text-purple-600 rounded-xl text-lg">🛏️</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-purple-700">
                    {kpis?.bed_occupancy_percentage ?? 0}%
                  </span>
                  <span className="text-xs text-gray-500">
                    ({kpis?.occupied_beds ?? 0}/{kpis?.total_beds ?? 0} Beds)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      (kpis?.bed_occupancy_percentage || 0) > 85
                        ? 'bg-red-500'
                        : (kpis?.bed_occupancy_percentage || 0) > 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, kpis?.bed_occupancy_percentage || 0)}%` }}
                  ></div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-500 flex items-center justify-between">
                <span>Available: <strong className="text-emerald-600">{kpis?.available_beds ?? 0}</strong></span>
                <span>Cleaning: <strong className="text-amber-600">{kpis?.cleaning_beds ?? 0}</strong></span>
              </div>
            </div>

            {/* KPI 5: Blood Stock Low Alerts */}
            <div className={`rounded-2xl p-5 border shadow-sm flex flex-col justify-between ${
              kpis?.blood_stock_low_alerts?.has_alerts
                ? 'bg-red-50/50 border-red-200'
                : 'bg-white border-gray-100'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Blood Low Alerts</span>
                  <span className={`p-2 rounded-xl text-lg ${kpis?.blood_stock_low_alerts?.has_alerts ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    🩸
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-extrabold ${kpis?.blood_stock_low_alerts?.has_alerts ? 'text-red-600' : 'text-emerald-600'}`}>
                    {kpis?.blood_stock_low_alerts?.count ?? 0}
                  </span>
                  <span className="text-xs text-gray-500">
                    {kpis?.blood_stock_low_alerts?.has_alerts ? 'Groups < 3 Units' : 'All Groups Safe'}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
                <span>Total Units: <strong>{kpis?.blood_stock_low_alerts?.total_blood_units ?? 0}u</strong></span>
                <span className="text-red-600 font-bold">Limit: &lt; 3u</span>
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* Chart.js Visualizations Grid */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Blood Bank Stock Distribution with Threshold */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>🩸</span> Blood Bank Inventory vs Minimum Safe Threshold
                  </h3>
                  <p className="text-xs text-gray-500">
                    Red bars highlight units below critical threshold (&lt; 3 units). Green represents safe reserves.
                  </p>
                </div>
                <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                  Threshold: 3 Units
                </span>
              </div>
              <div className="h-64 w-full">
                <Bar data={bloodStockChartData} options={bloodStockChartOptions} />
              </div>
            </div>

            {/* Chart 2: OPD Token Status Breakdown */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>🎟️</span> OPD Queue Status Breakdown
                </h3>
                <p className="text-xs text-gray-500">
                  Distribution of today's issued patient tokens by state.
                </p>
              </div>
              <div className="h-64 w-full flex items-center justify-center">
                <Doughnut data={tokenStatusChartData} options={tokenStatusChartOptions} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 3: Department OPD Patient Volume */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>🏢</span> Department Patient Load
                </h3>
                <p className="text-xs text-gray-500">
                  Token volume across departments to identify bottlenecks.
                </p>
              </div>
              <div className="h-64 w-full">
                <Bar data={departmentChartData} options={departmentChartOptions} />
              </div>
            </div>

            {/* Chart 4: Ward Bed Occupancy Breakdown */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>🛏️</span> Ward Bed Capacity & Occupancy
                </h3>
                <p className="text-xs text-gray-500">
                  Occupied (Red) vs Available (Green) beds per ward.
                </p>
              </div>
              <div className="h-64 w-full">
                <Bar data={wardOccupancyChartData} options={wardOccupancyChartOptions} />
              </div>
            </div>

            {/* Chart 5: 7-Day Patient Token Trend */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
              <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>📈</span> 7-Day Patient Volume Trend
                </h3>
                <p className="text-xs text-gray-500">
                  Daily patient traffic flow across the hospital.
                </p>
              </div>
              <div className="h-64 w-full">
                <Line data={trendChartData} options={trendChartOptions} />
              </div>
            </div>
          </div>

          {/* ───────────────────────────────────────────────────────────── */}
          {/* Quick Management Module Cards */}
          {/* ───────────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>⚡</span> Quick Management Access
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => navigate('/admin/manage')}
                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-purple-50 hover:border-purple-200 cursor-pointer transition"
              >
                <div className="text-xl mb-1">👨‍⚕️</div>
                <h4 className="font-bold text-sm text-gray-900">Doctor & Department CRUD</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Add, edit, or remove doctors, consultation times, and departments.
                </p>
                <span className="text-xs font-semibold text-purple-600 mt-3 block">
                  Manage Directory &rarr;
                </span>
              </div>

              <div
                onClick={() => navigate('/admin/beds')}
                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer transition"
              >
                <div className="text-xl mb-1">🛏️</div>
                <h4 className="font-bold text-sm text-gray-900">Inpatient Bed Management</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Configure wards (ICU, General, Private), add beds, and monitor live admissions.
                </p>
                <span className="text-xs font-semibold text-indigo-600 mt-3 block">
                  Open Bed Dashboard &rarr;
                </span>
              </div>

              <div
                onClick={() => navigate('/bloodbank')}
                className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-rose-50 hover:border-rose-200 cursor-pointer transition"
              >
                <div className="text-xl mb-1">🩸</div>
                <h4 className="font-bold text-sm text-gray-900">Blood Bank Stock & Donors</h4>
                <p className="text-xs text-gray-500 mt-1">
                  Track 8 blood groups, register donors, fulfill patient requests, and update expiry dates.
                </p>
                <span className="text-xs font-semibold text-rose-600 mt-3 block">
                  Open Blood Bank &rarr;
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
