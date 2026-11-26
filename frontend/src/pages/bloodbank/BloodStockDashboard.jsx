/**
 * src/pages/bloodbank/BloodStockDashboard.jsx
 * -------------------------------------------
 * Live Blood Bank Stock Inventory Dashboard.
 *
 * Features:
 *  - Live stock cards for all 8 blood groups: A+, A-, B+, B-, O+, O-, AB+, AB-
 *  - Red Alert condition: Highlights groups with LESS THAN 3 UNITS in urgent red with pulse
 *  - Expiry Date tracking for every blood group
 *  - Modal for Blood Bank Staff / Admin to Add or Update Units (+, -, or Set) with Expiry Date
 *  - Real-time auto-refresh option (5s polling)
 *  - Blood compatibility & clinical guidance badges
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import bloodBankService from '../../services/bloodBankService';

// Clinical description of each blood group
const BLOOD_GROUP_INFO = {
  'O-': { label: 'Universal Red Cell Donor', badge: 'Can donate to any blood group', tag: 'High Emergency Demand' },
  'O+': { label: 'Most Common Blood Type', badge: 'Can donate to O+, A+, B+, AB+', tag: 'Frequent Transfusion' },
  'A-': { label: 'Rare Blood Type', badge: 'Can donate to A-, A+, AB-, AB+', tag: 'Emergency Priority' },
  'A+': { label: 'Second Most Common', badge: 'Can donate to A+, AB+', tag: 'Standard Transfusion' },
  'B-': { label: 'Rare Rh Negative', badge: 'Can donate to B-, B+, AB-, AB+', tag: 'Low Global Inventory' },
  'B+': { label: 'Common in South Asia', badge: 'Can donate to B+, AB+', tag: 'Regular Demand' },
  'AB-': { label: 'Rarest Blood Group', badge: 'Can donate to AB-, AB+', tag: 'Ultra Rare (< 1%)' },
  'AB+': { label: 'Universal Recipient', badge: 'Can receive from any blood group', tag: 'Universal Plasma Donor' },
};

const BloodStockDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const isAuthorizedBloodStaff = Boolean(
    isAuthenticated && user && ['admin', 'doctor', 'bloodbank_staff'].includes(user.role)
  );
  const canManage =
    user?.role === 'bloodbank_staff' ||
    user?.role === 'admin' ||
    user?.is_staff ||
    user?.is_superuser;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [stockList, setStockList] = useState([]);
  const [summary, setSummary] = useState({
    total_units: 0,
    critical_count: 0,
    critical_groups: [],
    has_red_alert: false,
  });

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeViewTab, setActiveViewTab] = useState('cards'); // 'cards' | 'batches'
  const [batches, setBatches] = useState([]);

  // Modal State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    blood_group: 'O-',
    action: 'add',
    units: 5,
    expiry_date: '',
    donor_name: '',
    notes: '',
  });

  // Calculate default expiry date (35 days from today)
  const getDefaultExpiryDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 35);
    return d.toISOString().split('T')[0];
  };

  // Fetch Live Stock
  const fetchStock = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const data = await bloodBankService.getLiveStock();
      setStockList(data.stock || []);
      setSummary(data.summary || {});

      // Also fetch batches silently
      bloodBankService.getBatches().then((b) => setBatches(b || [])).catch(() => {});
    } catch (err) {
      console.error('Failed to load blood stock:', err);
      setError('Could not retrieve live blood bank inventory. Ensure backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorizedBloodStaff) return;
    fetchStock();
  }, [isAuthorizedBloodStaff, fetchStock]);

  // Auto-refresh timer (every 5s live sync)
  useEffect(() => {
    if (!isAuthorizedBloodStaff || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchStock(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthorizedBloodStaff, autoRefresh, fetchStock]);

  // Auto-dismiss notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Defensive Guard: Only Admin, Doctor, and Blood Bank Staff can access inventory dashboard
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthorizedBloodStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  // Open Update Modal for a specific group
  const handleOpenUpdate = (bloodGroup = 'O-', initialAction = 'add') => {
    setUpdateForm({
      blood_group: bloodGroup,
      action: initialAction,
      units: initialAction === 'set' ? 10 : 2,
      expiry_date: getDefaultExpiryDate(),
      donor_name: '',
      notes: '',
    });
    setShowUpdateModal(true);
  };

  // Submit Stock Update
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!updateForm.expiry_date) {
      alert('Please specify an expiry date for the blood batch.');
      return;
    }

    try {
      setModalLoading(true);
      const res = await bloodBankService.updateStock({
        blood_group: updateForm.blood_group,
        units: parseInt(updateForm.units, 10),
        action: updateForm.action,
        expiry_date: updateForm.expiry_date,
        donor_name: updateForm.donor_name,
        notes: updateForm.notes,
      });

      setSuccessMsg(res.message || 'Blood stock updated successfully!');
      setShowUpdateModal(false);
      await fetchStock(true);
    } catch (err) {
      console.error('Failed to update stock:', err);
      alert('Error updating blood stock: ' + (err.response?.data?.error || err.message));
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <div className="bg-white">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Success Alert Banner */}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-clinical-success text-xs font-semibold flex items-center justify-between">
            <span>{successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-clinical-success hover:opacity-75 font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Critical Blood Reserve Banner */}
        {summary.has_red_alert && (
          <div className="p-4 sm:p-5 rounded-xl bg-rose-50/80 border border-rose-200 border-l-4 border-l-clinical-danger flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-red-900 uppercase tracking-wide">
                Critical Red Alert — {summary.critical_count} Blood Group(s) Below 3 Units
              </h3>
              <p className="text-xs text-red-800">
                Low inventory detected in{' '}
                <span className="font-mono font-bold">{summary.critical_groups.join(', ')}</span>. Add incoming batches or contact matching donors.
              </p>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <Link to="/bloodbank/donors" className="editorial-btn-secondary border-rose-200 text-clinical-danger">
                  Contact Donors
                </Link>
                <button
                  type="button"
                  onClick={() => handleOpenUpdate(summary.critical_groups[0] || 'O-', 'add')}
                  className="px-4 py-2 rounded-lg bg-clinical-danger hover:opacity-95 text-white text-xs font-semibold transition cursor-pointer"
                >
                  + Add Emergency Units
                </button>
              </div>
            )}
          </div>
        )}

        {/* Editorial Header & Connected Module Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-hairline">
          <div className="space-y-1.5">
            <span className="editorial-eyebrow">Blood Bank Operations · Live 5s Inventory</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Blood Bank Stock &amp; Inventory
            </h1>
            <p className="text-xs sm:text-sm text-muted">
              Real-time unit monitoring across all 8 ABO/Rh blood groups with batch expiry tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link to="/bloodbank/requests" className="editorial-btn-secondary">
              Requests Queue
            </Link>
            <Link to="/bloodbank/donors" className="editorial-btn-secondary">
              Donor Registry
            </Link>
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`editorial-btn-secondary ${
                autoRefresh ? 'border-emerald-200 text-clinical-success bg-emerald-50/50' : ''
              }`}
            >
              {autoRefresh ? 'Live (5s)' : 'Paused'}
            </button>
            <button
              type="button"
              onClick={() => fetchStock(true)}
              disabled={refreshing}
              className="editorial-btn-secondary"
            >
              Refresh
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => handleOpenUpdate('O-', 'add')}
                className="editorial-btn-primary"
              >
                + Add / Update Units
              </button>
            )}
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="editorial-card p-5">
            <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider block">
              Total Units In Bank
            </span>
            <p className="font-display text-3xl font-bold text-ink mt-1.5">{summary.total_units} Units</p>
            <p className="text-xs text-muted mt-1">8 ABO/Rh Groups Tracked</p>
          </div>

          <div
            className={`editorial-card p-5 ${
              summary.critical_count > 0 ? 'bg-rose-50/60 border-rose-200' : ''
            }`}
          >
            <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider block">
              Critical Deficit (&lt; 3)
            </span>
            <p
              className={`font-display text-3xl font-bold mt-1.5 ${
                summary.critical_count > 0 ? 'text-clinical-danger' : 'text-ink'
              }`}
            >
              {summary.critical_count} Groups
            </p>
            <p className={`text-xs mt-1 font-medium ${summary.critical_count > 0 ? 'text-clinical-danger' : 'text-clinical-success'}`}>
              {summary.critical_count > 0 ? 'Immediate Donors Needed' : 'All groups safe (≥ 3)'}
            </p>
          </div>

          <div className="editorial-card p-5">
            <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider block">
              Red Alert Threshold
            </span>
            <p className="text-3xl font-black text-gray-900 mt-2">&lt; 3 Units</p>
            <p className="text-xs text-amber-600 mt-1 font-semibold">
              Emergency protocol triggers at 2 units
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Storage Refrigerator
            </span>
            <p className="text-2xl font-black text-emerald-600 mt-2">2°C to 6°C</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">Whole Blood & PRBC Standards</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
          <button
            type="button"
            onClick={() => setActiveViewTab('cards')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              activeViewTab === 'cards'
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-white text-muted border-hairline hover:text-ink hover:bg-surface'
            }`}
          >
            Live Stock Cards (8 Groups)
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('batches')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              activeViewTab === 'batches'
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-white text-muted border-hairline hover:text-ink hover:bg-surface'
            }`}
          >
            Batch &amp; Expiry Ledger ({batches.length})
          </button>
        </div>

        {/* 8 Live ABO/Rh Stock Cards */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-cobalt mx-auto"></div>
            <p className="mt-4 text-xs text-muted font-medium">
              Loading live blood inventory...
            </p>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center text-clinical-danger">
            <p className="font-semibold text-sm">{error}</p>
            <button
              type="button"
              onClick={() => fetchStock()}
              className="mt-3 px-4 py-2 bg-clinical-danger text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : activeViewTab === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {stockList.map((item) => {
              const isRedAlert = item.units_available < 3;
              const info = BLOOD_GROUP_INFO[item.blood_group] || {};
              const daysLeft = item.days_until_expiry;
              const fillPct = Math.min(100, Math.round((item.units_available / 10) * 100));

              return (
                <div
                  key={item.blood_group}
                  className={`editorial-card p-5 flex flex-col justify-between transition ${
                    isRedAlert
                      ? 'border-clinical-danger/60 bg-rose-50/40'
                      : 'hover:border-cobalt/40'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-3xl font-bold text-ink tracking-tight block">
                          {item.blood_group}
                        </span>
                        <span className="text-xs text-muted block mt-0.5">
                          {info.label || item.blood_group_display}
                        </span>
                      </div>

                      {isRedAlert ? (
                        <span className="font-mono px-2 py-0.5 rounded bg-clinical-danger text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
                          &lt; 3u Critical
                        </span>
                      ) : (
                        <span className="font-mono px-2 py-0.5 rounded bg-emerald-50 text-clinical-success text-[10px] font-semibold border border-emerald-200 shrink-0">
                          Adequate
                        </span>
                      )}
                    </div>

                    {/* Units Counter & Safety Gauge */}
                    <div className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-display text-3xl font-bold tracking-tight ${
                            isRedAlert ? 'text-clinical-danger' : 'text-ink'
                          }`}
                        >
                          {item.units_available}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-muted uppercase">
                          Units Available
                        </span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-surface border border-hairline overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isRedAlert ? 'bg-clinical-danger' : 'bg-cobalt'
                          }`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>

                      {isRedAlert && (
                        <p className="text-[11px] font-semibold text-clinical-danger">
                          Below 3-unit safety floor. Urgent donor replenishment needed.
                        </p>
                      )}
                    </div>

                    {/* Match Profile */}
                    <div className="p-3 bg-surface rounded-lg border border-hairline text-[11px] space-y-1">
                      <p className="text-muted">
                        <strong className="text-ink">Match:</strong> {info.badge}
                      </p>
                      <span className="inline-block font-mono text-[10px] text-cobalt font-semibold">
                        {info.tag}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Expiry Date & Quick Actions */}
                  <div className="mt-4 pt-3.5 border-t border-hairline flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>Nearest Expiry</span>
                      <span
                        className={`font-mono font-semibold ${
                          daysLeft !== null && daysLeft <= 7 ? 'text-clinical-danger' : 'text-ink'
                        }`}
                      >
                        {item.expiry_date
                          ? `${item.expiry_date} (${
                              daysLeft !== null
                                ? daysLeft > 0
                                  ? `${daysLeft}d`
                                  : 'Expired'
                                : ''
                            })`
                          : 'Not recorded'}
                      </span>
                    </div>

                    {canManage && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenUpdate(item.blood_group, 'add')}
                          className="editorial-btn-primary py-1.5 px-2 text-[11px]"
                        >
                          + Add Units
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenUpdate(item.blood_group, 'set')}
                          className="editorial-btn-secondary py-1.5 px-2 text-[11px]"
                        >
                          Set / Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Batch Ledger Table */
          <div className="editorial-card overflow-hidden">
            <div className="px-6 py-4 bg-surface border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-ink">Logged Blood Unit Batches</h3>
                <p className="text-xs text-muted">
                  Individual blood units tracked with batch codes and expiration dates.
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleOpenUpdate('O-', 'add')}
                  className="editorial-btn-primary py-1.5 px-3"
                >
                  + Log Batch
                </button>
              )}
            </div>

            {batches.length === 0 ? (
              <div className="p-12 text-center text-muted">
                <p className="font-display font-bold text-sm text-ink">No Batch Records Yet</p>
                <p className="text-xs text-muted mt-1">
                  Use &ldquo;+ Add / Update Units&rdquo; above to log incoming blood bags with expiry dates.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-hairline text-left text-xs">
                  <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
                    <tr>
                      <th className="px-6 py-3.5">Batch Code</th>
                      <th className="px-4 py-3.5">Blood Group</th>
                      <th className="px-4 py-3.5">Units</th>
                      <th className="px-4 py-3.5">Expiry Date</th>
                      <th className="px-4 py-3.5">Donor / Source</th>
                      <th className="px-6 py-3.5">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline bg-white">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-surface/60 transition">
                        <td className="px-6 py-4 font-mono font-bold text-ink">
                          {b.batch_number || `BATCH-${b.id}`}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2.5 py-0.5 rounded bg-rose-50 text-clinical-danger border border-rose-200 font-mono font-bold text-xs">
                            {b.blood_group}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono font-bold text-ink">{b.units} Bags</td>
                        <td className="px-4 py-4">
                          <div className="font-mono font-semibold text-ink">{b.expiry_date}</div>
                          <span className="text-[11px] text-muted">
                            {b.days_until_expiry !== null && b.days_until_expiry > 0
                              ? `${b.days_until_expiry} days left`
                              : 'Expired'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted">
                          {b.donor_name || 'Hospital Donation Drive'}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted">
                          {b.recorded_by_name || 'Staff'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Add / Update Blood Units */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-md w-full p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Inventory Update</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Add / Update Blood Units
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUpdateModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Blood Group *
                </label>
                <select
                  value={updateForm.blood_group}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, blood_group: e.target.value })
                  }
                  className="editorial-input font-mono font-bold"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg} ({BLOOD_GROUP_INFO[bg]?.label || bg})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Operation Action *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'add' })}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      updateForm.action === 'add'
                        ? 'bg-clinical-success text-white border-clinical-success'
                        : 'bg-white text-muted border-hairline'
                    }`}
                  >
                    + Add Units
                  </button>

                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'set' })}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      updateForm.action === 'set'
                        ? 'bg-cobalt text-white border-cobalt'
                        : 'bg-white text-muted border-hairline'
                    }`}
                  >
                    Set Total
                  </button>

                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'deduct' })}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      updateForm.action === 'deduct'
                        ? 'bg-clinical-danger text-white border-clinical-danger'
                        : 'bg-white text-muted border-hairline'
                    }`}
                  >
                    - Deduct
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Quantity (Units / Bags) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={updateForm.units}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, units: e.target.value })
                  }
                  className="editorial-input font-mono font-bold"
                />
                <span className="text-[11px] text-muted mt-1 block">
                  1 unit ≈ 450 ml of whole blood.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Expiry Date *
                </label>
                <input
                  type="date"
                  required
                  value={updateForm.expiry_date}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, expiry_date: e.target.value })
                  }
                  className="editorial-input"
                />
                <span className="text-[11px] text-muted mt-1 block">
                  Default: 35 days shelf-life at 2°C–6°C.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Donor / Camp Source (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Voluntary Blood Drive / Donor #104"
                  value={updateForm.donor_name}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, donor_name: e.target.value })
                  }
                  className="editorial-input"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="editorial-btn-primary px-5"
                >
                  Save Stock &amp; Expiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BloodStockDashboard;
