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
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isAnalyticsRoute = location.pathname.includes('/analytics');

  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('all'); // 'all' | 'phi' | 'denied'
  const [exportingFormat, setExportingFormat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const isAuthorizedAdmin = Boolean(isAuthenticated && user && (user.role === 'admin' || user.is_staff));

  const fetchAnalytics = useCallback(async () => {
    try {
      setError(null);
      const [data, logsData] = await Promise.all([
        hospitalService.getAdminAnalytics(),
        hospitalService.getAuditLogs().catch(() => []),
      ]);
      setAnalytics(data);
      setAuditLogs(Array.isArray(logsData) ? logsData : logsData?.results || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load admin analytics', err);
      setError(err?.response?.data?.detail || 'Unable to connect to analytics service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    fetchAnalytics();
  }, [isAuthorizedAdmin, fetchAnalytics]);

  // Periodic Auto-Refresh every 15 seconds
  useEffect(() => {
    if (!isAuthorizedAdmin || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 15000);
    return () => clearInterval(interval);
  }, [isAuthorizedAdmin, autoRefresh, fetchAnalytics]);

  // Defensive Guard: Only Admin can access
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthorizedAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExportCsv = async () => {
    try {
      setExportingFormat('csv');
      await hospitalService.downloadAnalyticsCsv();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to export CSV report.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleExportPdf = async () => {
    try {
      setExportingFormat('pdf');
      await hospitalService.downloadAnalyticsPdf();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to export PDF report.');
    } finally {
      setExportingFormat(null);
    }
  };

  const filteredAuditLogs = auditLogs.filter((log) => {
    const act = (log.action || '').toUpperCase();
    if (auditFilter === 'phi' && !['VIEW', 'CREATE', 'UPDATE', 'DOWNLOAD'].includes(act)) {
      return false;
    }
    if (auditFilter === 'denied' && !act.includes('DENIED') && !act.includes('FAIL')) {
      return false;
    }
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      (log.actor_username || '').toLowerCase().includes(q) ||
      (log.action || '').toLowerCase().includes(q) ||
      (log.resource_type || '').toLowerCase().includes(q) ||
      (log.patient_code || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q)
    );
  });

  const kpis = analytics?.summary_kpis;
  const charts = analytics?.charts;
  const lowStockAlerts = analytics?.alerts?.low_blood_stock || [];

  // Editorial Clinical Chart Palette
  const bloodStockChartData = {
    labels: charts?.blood_stock_levels?.labels || ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'],
    datasets: [
      {
        label: 'Units in Stock',
        data: charts?.blood_stock_levels?.data || [0, 0, 0, 0, 0, 0, 0, 0],
        backgroundColor: (charts?.blood_stock_levels?.data || []).map((v) => (v < 3 ? '#C82333' : '#1453D6')),
        borderRadius: 6,
        borderWidth: 0,
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
            return `${val} Units ${val < 3 ? '(CRITICAL: Below 3 Units)' : '(Safe Reserve)'}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 2, color: '#526071', font: { size: 11 } },
        grid: { color: '#E2E8F0' },
      },
      x: {
        ticks: { color: '#0B1220', font: { size: 11, weight: 'bold' } },
        grid: { display: false },
      },
    },
  };

  const tokenStatusChartData = {
    labels: charts?.token_status_distribution?.labels || ['Waiting', 'Called / In Progress', 'Completed', 'Admitted', 'Skipped / Cancelled'],
    datasets: [
      {
        data: charts?.token_status_distribution?.data || [0, 0, 0, 0, 0],
        backgroundColor: ['#B45309', '#1453D6', '#0D7A5F', '#0B1220', '#C82333'],
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 4,
      },
    ],
  };

  const tokenStatusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, padding: 14, color: '#526071', font: { size: 11 } },
      },
    },
    cutout: '68%',
  };

  const departmentChartData = {
    labels: charts?.department_tokens?.labels || [],
    datasets: [
      {
        label: 'Patients / Tokens',
        data: charts?.department_tokens?.data || [],
        backgroundColor: '#1453D6',
        borderRadius: 6,
      },
    ],
  };

  const departmentChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, color: '#526071', font: { size: 11 } },
        grid: { color: '#E2E8F0' },
      },
      x: {
        ticks: { color: '#526071', font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const wardOccupancyChartData = {
    labels: charts?.ward_occupancy?.labels || [],
    datasets: [
      {
        label: 'Occupied',
        data: charts?.ward_occupancy?.occupied || [],
        backgroundColor: '#C82333',
        borderRadius: 4,
      },
      {
        label: 'Available',
        data: charts?.ward_occupancy?.available || [],
        backgroundColor: '#0D7A5F',
        borderRadius: 4,
      },
    ],
  };

  const wardOccupancyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, padding: 14, color: '#526071', font: { size: 11 } },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: '#526071', font: { size: 11 } } },
      y: { stacked: true, beginAtZero: true, ticks: { stepSize: 2, color: '#526071', font: { size: 11 } }, grid: { color: '#E2E8F0' } },
    },
  };

  const trendChartData = {
    labels: charts?.daily_token_trend?.labels || [],
    datasets: [
      {
        label: 'Daily Tokens',
        data: charts?.daily_token_trend?.data || [],
        borderColor: '#1453D6',
        backgroundColor: 'rgba(20, 83, 214, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#1453D6',
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 2, color: '#526071', font: { size: 11 } },
        grid: { color: '#E2E8F0' },
      },
      x: {
        ticks: { color: '#526071', font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const peakDailyTokens = Math.max(0, ...(charts?.daily_token_trend?.data || [0]));

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* Admin Editorial Header & Live Controls */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="editorial-eyebrow">
              {isAnalyticsRoute ? 'Executive Telemetry' : 'Executive Control'} · {autoRefresh ? '15s Live Sync' : 'Manual Sync'}
            </span>
            <span className="font-mono text-[11px] text-muted">
              Last synced {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            {isAnalyticsRoute
              ? 'Hospital Analytics, Occupancy & Demand Trends'
              : 'Hospital Operations & Audit'}
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Signed in as <span className="font-semibold text-ink">{user?.first_name || user?.username}</span>. Real-time metrics across OPD queues, inpatient beds, blood stock, and PHI audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingFormat === 'csv'}
            className="editorial-btn-secondary"
          >
            {exportingFormat === 'csv' ? 'Exporting...' : t('exportCsv')}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingFormat === 'pdf'}
            className="editorial-btn-secondary"
          >
            {exportingFormat === 'pdf' ? 'Exporting...' : t('exportPdf')}
          </button>
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-bold border transition cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-50 border-emerald-200 text-clinical-success'
                : 'bg-surface border-hairline text-muted'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? 'bg-clinical-success' : 'bg-slate-400'
              }`}
            />
            {autoRefresh ? 'AUTO-SYNC ON' : 'SYNC PAUSED'}
          </button>
          <button
            type="button"
            onClick={() => fetchAnalytics()}
            className="editorial-btn-secondary"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/manage')}
            className="editorial-btn-primary"
          >
            + Provision Staff
          </button>
        </div>
      </div>

      {/* Quick Module Shortcuts */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate('/admin/manage')} className="editorial-btn-secondary py-1.5 px-3">
          Doctors &amp; Clinics
        </button>
        <button type="button" onClick={() => navigate('/admin/beds')} className="editorial-btn-secondary py-1.5 px-3">
          Ward Beds Grid
        </button>
        <button type="button" onClick={() => navigate('/bloodbank')} className="editorial-btn-secondary py-1.5 px-3">
          Blood Bank Inventory
        </button>
        <button type="button" onClick={() => navigate('/billing')} className="editorial-btn-secondary py-1.5 px-3">
          Billing &amp; Invoices
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Critical Alerts Banner (Blood Stock < 3 Units) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {lowStockAlerts.length > 0 && (
        <div className="p-4 sm:p-5 rounded-xl bg-rose-50/70 border border-rose-200 border-l-4 border-l-clinical-danger flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-rose-100 text-clinical-danger flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-red-900 uppercase tracking-wide">
                Critical Blood Reserve Alert — {lowStockAlerts.length} Group{lowStockAlerts.length > 1 ? 's' : ''} Below 3 Units
              </h3>
              <p className="text-xs text-red-800 mt-0.5">
                Low stock detected in{' '}
                <span className="font-mono font-bold">
                  {lowStockAlerts.map((a) => `${a.blood_group} (${a.units_available}u)`).join(', ')}
                </span>
                . Immediate donor outreach recommended.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/bloodbank/donors')}
              className="px-3.5 py-2 rounded-lg bg-white border border-rose-200 text-clinical-danger hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
            >
              Contact Donors
            </button>
            <button
              onClick={() => navigate('/bloodbank')}
              className="px-3.5 py-2 rounded-lg bg-clinical-danger hover:opacity-95 text-white text-xs font-semibold transition cursor-pointer"
            >
              Update Stock
            </button>
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && !analytics && (
        <div className="py-20 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-cobalt border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm font-medium text-muted">Calculating real-time analytics from database...</p>
        </div>
      )}

      {error && !analytics && (
        <div className="editorial-card p-6 border-rose-200 bg-rose-50/70 rounded-2xl text-center">
          <p className="text-clinical-danger font-semibold mb-3 text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-clinical-danger text-white font-semibold rounded-lg text-xs hover:opacity-95 transition cursor-pointer"
          >
            Retry Analytics Query
          </button>
        </div>
      )}

      {/* 5 Primary KPI Cards */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="editorial-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Tokens Today</span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-cobalt-tint text-cobalt">OPD</span>
                </div>
                <div className="font-display text-3xl font-bold text-ink">
                  {kpis?.total_tokens_today ?? 0}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between font-mono text-[10px] text-muted">
                <span className="text-clinical-warning font-semibold">{kpis?.waiting_tokens ?? 0} Wait</span>
                <span className="text-cobalt font-semibold">{kpis?.called_tokens ?? 0} Call</span>
                <span className="text-clinical-success font-semibold">{kpis?.completed_tokens ?? 0} Done</span>
              </div>
            </div>

            <div className="editorial-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Avg Wait Time</span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-clinical-warning">SLA</span>
                </div>
                <div className="font-display text-3xl font-bold text-clinical-warning">
                  {kpis?.average_waiting_time_display ?? '15 mins'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline text-[11px] text-muted flex items-center justify-between">
                <span>Per patient wait</span>
                <span className="text-clinical-success font-semibold">OPD Target</span>
              </div>
            </div>

            <div className="editorial-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Busiest Dept</span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-surface text-muted border border-hairline">PEAK</span>
                </div>
                <div className="font-display text-xl font-bold text-ink truncate" title={kpis?.busiest_department?.name}>
                  {kpis?.busiest_department?.name || 'General OPD'}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline text-[11px] text-muted flex items-center justify-between">
                <span>Volume</span>
                <span className="font-mono font-bold text-cobalt">{kpis?.busiest_department?.tokens_count ?? 0} tokens</span>
              </div>
            </div>

            <div className="editorial-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Bed Occupancy</span>
                  <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-cobalt-tint text-cobalt">
                    {kpis?.occupied_beds ?? 0}/{kpis?.total_beds ?? 0}
                  </span>
                </div>
                <div className="font-display text-3xl font-bold text-ink">
                  {kpis?.bed_occupancy_percentage ?? 0}%
                </div>
                <div className="w-full bg-surface rounded-full h-1.5 mt-2.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      (kpis?.bed_occupancy_percentage || 0) > 85
                        ? 'bg-clinical-danger'
                        : (kpis?.bed_occupancy_percentage || 0) > 60
                        ? 'bg-clinical-warning'
                        : 'bg-cobalt'
                    }`}
                    style={{ width: `${Math.min(100, kpis?.bed_occupancy_percentage || 0)}%` }}
                  />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline text-[11px] text-muted flex items-center justify-between">
                <span>Free: <strong className="text-clinical-success font-mono">{kpis?.available_beds ?? 0}</strong></span>
                <span>Clean: <strong className="text-clinical-warning font-mono">{kpis?.cleaning_beds ?? 0}</strong></span>
              </div>
            </div>

            <div className={`editorial-card p-5 flex flex-col justify-between ${
              kpis?.blood_stock_low_alerts?.has_alerts ? 'border-rose-200 bg-rose-50/40' : ''
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Blood Alerts</span>
                  <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                    kpis?.blood_stock_low_alerts?.has_alerts
                      ? 'bg-rose-100 text-clinical-danger'
                      : 'bg-emerald-50 text-clinical-success'
                  }`}>
                    {kpis?.blood_stock_low_alerts?.has_alerts ? 'CRITICAL' : 'SAFE'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`font-display text-3xl font-bold ${
                    kpis?.blood_stock_low_alerts?.has_alerts ? 'text-clinical-danger' : 'text-clinical-success'
                  }`}>
                    {kpis?.blood_stock_low_alerts?.count ?? 0}
                  </span>
                  <span className="text-xs text-muted">
                    {kpis?.blood_stock_low_alerts?.has_alerts ? 'Groups < 3u' : 'All safe'}
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-hairline text-[11px] text-muted flex items-center justify-between">
                <span>Bank Total: <strong className="font-mono text-ink">{kpis?.blood_stock_low_alerts?.total_blood_units ?? 0}u</strong></span>
                <span className="font-mono text-clinical-danger font-semibold">Min 3u</span>
              </div>
            </div>
          </div>

          {/* Chart.js Visualizations Grid (Paper Screen 24 Layout) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
            <div className="editorial-card rounded-2xl p-6 flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-5 pb-3 border-b border-hairline">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    7-Day OPD Patient Demand Trend
                  </h3>
                  <p className="text-xs text-muted">
                    Daily outpatient arrivals across all clinics.
                  </p>
                </div>
                <span className="font-mono px-2.5 py-1 rounded-full text-[11px] font-bold bg-cobalt-tint text-cobalt border border-blue-200 uppercase shrink-0">
                  PEAK: {peakDailyTokens} TOKENS / DAY
                </span>
              </div>
              <div className="h-64 w-full">
                <Line data={trendChartData} options={trendChartOptions} />
              </div>
            </div>

            <div className="editorial-card rounded-2xl p-6 flex flex-col">
              <div className="mb-5 pb-3 border-b border-hairline">
                <h3 className="font-display text-base font-bold text-ink">
                  OPD Token Status Breakdown
                </h3>
                <p className="text-xs text-muted">
                  Today&apos;s workflow split across completed, waiting &amp; triage stages.
                </p>
              </div>
              <div className="h-64 w-full flex items-center justify-center">
                <Doughnut data={tokenStatusChartData} options={tokenStatusChartOptions} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="editorial-card rounded-2xl p-6 flex flex-col">
              <div className="flex justify-between items-start gap-2 mb-5 pb-3 border-b border-hairline">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">Tokens by Department</h3>
                  <p className="text-xs text-muted">OPD token volume by specialty clinic.</p>
                </div>
                <span className="font-mono text-[10px] font-bold text-cobalt uppercase shrink-0">
                  LIVE QUEUE
                </span>
              </div>
              <div className="h-60 w-full">
                <Bar data={departmentChartData} options={departmentChartOptions} />
              </div>
            </div>

            <div className="editorial-card rounded-2xl p-6 flex flex-col">
              <div className="flex justify-between items-start gap-2 mb-5 pb-3 border-b border-hairline">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">Ward Bed Capacity</h3>
                  <p className="text-xs text-muted">Occupied vs available beds per hospital ward.</p>
                </div>
                <span className="font-mono text-[10px] font-bold text-muted uppercase shrink-0">
                  OCCUPIED VS OPEN
                </span>
              </div>
              <div className="h-60 w-full">
                <Bar data={wardOccupancyChartData} options={wardOccupancyChartOptions} />
              </div>
            </div>

            <div className="editorial-card rounded-2xl p-6 flex flex-col">
              <div className="flex justify-between items-start gap-2 mb-5 pb-3 border-b border-hairline">
                <div>
                  <h3 className="font-display text-base font-bold text-ink">Blood Reserves (8 ABO)</h3>
                  <p className="text-xs text-muted">Crimson bars indicate below 3-unit floor.</p>
                </div>
                <span className="font-mono text-[10px] font-bold text-clinical-danger uppercase shrink-0">
                  RED &lt; 3 UNITS
                </span>
              </div>
              <div className="h-60 w-full">
                <Bar data={bloodStockChartData} options={bloodStockChartOptions} />
              </div>
            </div>
          </div>

          {/* Quick Management Access */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => navigate('/admin/manage')}
              className="editorial-card-interactive p-5 text-left flex items-start gap-4 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-cobalt-tint text-cobalt flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-sm font-bold text-ink">Staff &amp; Department CRUD</h4>
                <p className="text-xs text-muted mt-1">Manage doctors, clinic durations, and role accounts.</p>
                <span className="text-xs font-semibold text-cobalt mt-2.5 block">Manage Directory →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/admin/beds')}
              className="editorial-card-interactive p-5 text-left flex items-start gap-4 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-cobalt-tint text-cobalt flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4v16" />
                  <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                  <path d="M2 17h20" />
                  <path d="M6 8v9" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-sm font-bold text-ink">Inpatient Bed Grid</h4>
                <p className="text-xs text-muted mt-1">Configure ICU/General wards, add beds, monitor admissions.</p>
                <span className="text-xs font-semibold text-cobalt mt-2.5 block">Open Bed Grid →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/bloodbank')}
              className="editorial-card-interactive p-5 text-left flex items-start gap-4 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-clinical-danger flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-sm font-bold text-ink">Blood Bank Stock &amp; Donors</h4>
                <p className="text-xs text-muted mt-1">Track 8 ABO/Rh groups, fulfill requests, contact donors.</p>
                <span className="text-xs font-semibold text-clinical-danger mt-2.5 block">Open Blood Bank →</span>
              </div>
            </button>
          </div>

          {/* Security & Clinical Access Audit Log */}
          <div className="editorial-card overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-hairline flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  {t('auditLogTitle')}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Immutable trail of PHI record views, token mutations, billing events, and RBAC denials.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5 text-[11px] font-semibold">
                  {[
                    { id: 'all', label: 'All Events' },
                    { id: 'phi', label: 'PHI & Mutations' },
                    { id: 'denied', label: 'Denied' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAuditFilter(f.id)}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        auditFilter === f.id ? 'bg-white text-ink shadow-2xs' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Filter actor, action, PAT-ID..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="editorial-input py-1.5 px-3 text-xs w-full sm:w-64"
                />
              </div>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <p className="text-xs text-muted py-10 text-center">No matching audit log events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="min-w-full text-left text-xs divide-y divide-hairline">
                  <thead className="bg-surface text-muted font-mono text-[10px] uppercase tracking-wider font-semibold sticky top-0 border-b border-hairline">
                    <tr>
                      <th className="px-5 py-3">Timestamp</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Resource</th>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-5 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline bg-white">
                    {filteredAuditLogs.slice(0, 40).map((log) => (
                      <tr key={log.id} className="hover:bg-surface/60 transition">
                        <td className="px-5 py-3 whitespace-nowrap text-muted font-mono text-[11px]">
                          {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-ink">@{log.actor_username || 'system'}</span>{' '}
                          <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-surface border border-hairline text-muted">
                            {log.actor_role || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`font-mono px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.action === 'VIEW'
                                ? 'bg-cobalt-tint text-cobalt'
                                : log.action === 'CREATE'
                                ? 'bg-emerald-50 text-clinical-success'
                                : log.action === 'DOWNLOAD'
                                ? 'bg-amber-50 text-clinical-warning'
                                : 'bg-rose-50 text-clinical-danger'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-ink">
                          {log.resource_type} {log.resource_id ? `#${log.resource_id}` : ''}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-cobalt font-semibold">
                          {log.patient_code || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-muted">
                          {log.ip_address || '-'}
                        </td>
                        <td className="px-5 py-3 text-muted max-w-xs truncate" title={log.details}>
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
