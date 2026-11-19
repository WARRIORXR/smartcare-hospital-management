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
import { useAuth } from '../../context/AuthContext';
import bloodBankService from '../../services/bloodBankService';
import Navbar from '../../components/common/Navbar';
import { Link } from 'react-router-dom';

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
  const { user } = useAuth();
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

  const [autoRefresh, setAutoRefresh] = useState(false);
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
    fetchStock();
  }, [fetchStock]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStock(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStock]);

  // Auto-dismiss notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

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
    <div className="min-h-screen bg-gray-50/50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Alert Banner */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs transition-all animate-fadeIn">
            <div className="flex items-center space-x-2">
              <span className="text-lg">✅</span>
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── RED ALERT BANNER (If any stock < 3 units) ── */}
        {summary.has_red_alert && (
          <div className="mb-8 p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 text-white shadow-xl animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <span className="text-3xl sm:text-4xl">🚨</span>
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight">
                    Critical Red Alert: Emergency Blood Shortage!
                  </h3>
                  <p className="text-rose-100 text-xs sm:text-sm mt-0.5">
                    <strong>{summary.critical_count} blood group(s)</strong> have fallen below safe
                    reserve (<span className="underline font-bold">less than 3 units</span>):{' '}
                    <strong className="text-white text-base">
                      {summary.critical_groups.join(', ')}
                    </strong>
                  </p>
                </div>
              </div>

              {canManage && (
                <button
                  onClick={() =>
                    handleOpenUpdate(summary.critical_groups[0] || 'O-', 'add')
                  }
                  className="px-5 py-2.5 rounded-2xl bg-white text-red-700 hover:bg-red-50 text-xs font-black uppercase tracking-wider shadow-md transition self-start sm:self-center"
                >
                  + Add Emergency Units Now
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Title & Global Controls ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🩸</span>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                Blood Bank Stock & Inventory
              </h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Real-time units monitoring across all 8 ABO/Rh blood groups with expiry tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold transition border shadow-2xs ${
                autoRefresh
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-2 ${
                  autoRefresh ? 'bg-white animate-ping' : 'bg-gray-400'
                }`}
              />
              {autoRefresh ? 'Live Polling (5s)' : 'Auto-Refresh: Off'}
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchStock(true)}
              disabled={refreshing}
              className="inline-flex items-center px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition"
              title="Refresh inventory now"
            >
              <span className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
              Refresh
            </button>

            {/* Staff Add/Update Units Button */}
            {canManage && (
              <button
                onClick={() => handleOpenUpdate('O-', 'add')}
                className="inline-flex items-center px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition"
              >
                <span className="mr-1 text-sm">+</span> Add / Update Units
              </button>
            )}
          </div>
        </div>

        {/* ── Summary Counters ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Total Units In Bank
            </span>
            <p className="text-3xl font-black text-gray-900 mt-2">{summary.total_units} Units</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">8 ABO/Rh Groups Tracked</p>
          </div>

          <div
            className={`p-5 rounded-2xl border shadow-2xs ${
              summary.critical_count > 0
                ? 'bg-red-50/80 border-red-300 text-red-900'
                : 'bg-white border-gray-200/90 text-gray-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Critical Deficit (&lt; 3)</span>
              {summary.critical_count > 0 && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
              )}
            </div>
            <p
              className={`text-3xl font-black mt-2 ${
                summary.critical_count > 0 ? 'text-red-600' : 'text-gray-900'
              }`}
            >
              {summary.critical_count} Groups
            </p>
            <p className="text-xs text-red-700 mt-1 font-semibold">
              {summary.critical_count > 0 ? '🚨 Immediate Donors Needed' : 'All groups safe (≥ 3)'}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
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

        {/* ── Tab Switcher: Cards View vs Batch Log vs Donors vs Requests ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 mb-6">
          <button
            onClick={() => setActiveViewTab('cards')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeViewTab === 'cards'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>🩸</span>
            <span>Live Stock Cards (8 Groups)</span>
          </button>

          <Link
            to="/bloodbank/donors"
            className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-gray-700 hover:bg-gray-100 bg-white border border-gray-200 shadow-2xs"
          >
            <span>👥</span>
            <span>Register as Donor / Directory</span>
          </Link>

          <Link
            to="/bloodbank/requests"
            className="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-gray-700 hover:bg-gray-100 bg-white border border-gray-200 shadow-2xs"
          >
            <span>📋</span>
            <span>Request Blood Units</span>
          </Link>

          <button
            onClick={() => setActiveViewTab('batches')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeViewTab === 'batches'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>📦</span>
            <span>Batch & Expiry Ledger ({batches.length})</span>
          </button>
        </div>

        {/* ── 8 LIVE STOCK CARDS (A+, A-, B+, B-, O+, O-, AB+, AB-) ── */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600 mx-auto"></div>
            <p className="mt-4 text-sm text-gray-500 font-semibold">
              Loading live blood inventory...
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center text-red-700">
            <p className="font-bold text-base">{error}</p>
            <button
              onClick={() => fetchStock()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition"
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

              return (
                <div
                  key={item.blood_group}
                  className={`rounded-3xl p-6 transition-all relative flex flex-col justify-between ${
                    isRedAlert
                      ? 'bg-gradient-to-br from-rose-50 via-red-50/70 to-red-100/50 border-2 border-red-500 shadow-md shadow-red-100/60 ring-2 ring-red-400/20'
                      : 'bg-white border border-gray-200/90 shadow-2xs hover:shadow-md'
                  }`}
                >
                  {/* Top Bar: Group Name & Alert Badge */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-4xl font-black text-gray-900 tracking-tight block">
                          {item.blood_group}
                        </span>
                        <span className="text-xs font-semibold text-gray-500 block mt-0.5">
                          {info.label || item.blood_group_display}
                        </span>
                      </div>

                      {/* Red Alert Pill if < 3 Units */}
                      {isRedAlert ? (
                        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-xs animate-bounce">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                          <span>&lt; 3 RED ALERT</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                          Adequate
                        </span>
                      )}
                    </div>

                    {/* Units Counter */}
                    <div className="my-5">
                      <div className="flex items-baseline space-x-2">
                        <span
                          className={`text-4xl sm:text-5xl font-black tracking-tight ${
                            isRedAlert ? 'text-red-700' : 'text-gray-900'
                          }`}
                        >
                          {item.units_available}
                        </span>
                        <span className="text-sm font-bold text-gray-500 uppercase">
                          Units in Stock
                        </span>
                      </div>

                      {isRedAlert && (
                        <p className="mt-1.5 text-xs font-bold text-red-700 flex items-center gap-1">
                          <span>⚠️</span>
                          <span>Critical deficit! Requires urgent donor replenishment.</span>
                        </p>
                      )}
                    </div>

                    {/* Compatibility Info */}
                    <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 text-2xs space-y-1 mb-4">
                      <p className="text-gray-600 font-medium">
                        <strong>Match:</strong> {info.badge}
                      </p>
                      <span className="inline-block px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-500 font-semibold">
                        {info.tag}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Expiry Date & Quick Action */}
                  <div className="pt-3 border-t border-gray-100/90 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Nearest Expiry:</span>
                      <strong
                        className={`font-semibold ${
                          daysLeft !== null && daysLeft <= 7 ? 'text-red-600 font-bold' : 'text-gray-800'
                        }`}
                      >
                        {item.expiry_date
                          ? `${item.expiry_date} (${
                              daysLeft !== null
                                ? daysLeft > 0
                                  ? `${daysLeft}d left`
                                  : 'Expired'
                                : ''
                            })`
                          : 'Not recorded'}
                      </strong>
                    </div>

                    {/* Quick Update Button */}
                    {canManage && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleOpenUpdate(item.blood_group, 'add')}
                          className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition text-center"
                        >
                          + Add Units
                        </button>
                        <button
                          onClick={() => handleOpenUpdate(item.blood_group, 'set')}
                          className="py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-xs border border-gray-200 transition text-center"
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
          /* ── BATCH LEDGER TABLE ── */
          <div className="bg-white rounded-3xl border border-gray-200 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Logged Blood Unit Batches</h3>
                <p className="text-xs text-gray-500">
                  Individual blood units stored with expiration deadlines.
                </p>
              </div>
              {canManage && (
                <button
                  onClick={() => handleOpenUpdate('O-', 'add')}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 shadow-2xs transition"
                >
                  + Log Batch
                </button>
              )}
            </div>

            {batches.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <span className="text-4xl block mb-2">📦</span>
                <p className="font-bold text-sm">No Batch Records Yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the "+ Add / Update Units" button above to log newly collected blood bags with
                  expiry dates.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Batch Code</th>
                      <th className="px-6 py-3.5">Blood Group</th>
                      <th className="px-6 py-3.5">Units</th>
                      <th className="px-6 py-3.5">Expiry Date</th>
                      <th className="px-6 py-3.5">Donor / Source</th>
                      <th className="px-6 py-3.5">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {batches.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/80 transition">
                        <td className="px-6 py-4 font-mono font-bold text-gray-900">
                          {b.batch_number || `BATCH-${b.id}`}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-extrabold text-xs">
                            {b.blood_group}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">{b.units} Bags</td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{b.expiry_date}</div>
                          <span className="text-2xs text-gray-500 font-medium">
                            {b.days_until_expiry !== null && b.days_until_expiry > 0
                              ? `Expires in ${b.days_until_expiry} days`
                              : 'Expired'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600">
                          {b.donor_name || 'Hospital Donation Drive'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
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
      </main>

      {/* ── MODAL: ADD / UPDATE BLOOD UNITS WITH EXPIRY DATE ── */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <span>🩸</span> Add / Update Blood Units
              </h3>
              <button
                onClick={() => setShowUpdateModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
              {/* Select Blood Group */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Blood Group *
                </label>
                <select
                  value={updateForm.blood_group}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, blood_group: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-bold"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg} ({BLOOD_GROUP_INFO[bg]?.label || bg})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action: Add vs Set vs Deduct */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Operation Action *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'add' })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      updateForm.action === 'add'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    + Add Units
                  </button>

                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'set' })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      updateForm.action === 'set'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Set Total
                  </button>

                  <button
                    type="button"
                    onClick={() => setUpdateForm({ ...updateForm, action: 'deduct' })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      updateForm.action === 'deduct'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    - Deduct
                  </button>
                </div>
              </div>

              {/* Units Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
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
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                />
                <span className="text-2xs text-gray-500 mt-0.5 block">
                  1 unit ≈ 450 ml of whole blood.
                </span>
              </div>

              {/* Mandatory Expiry Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Expiry Date *
                </label>
                <input
                  type="date"
                  required
                  value={updateForm.expiry_date}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, expiry_date: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="text-2xs text-gray-500 mt-0.5 block">
                  Default: 35 days shelf-life at 2°C–6°C.
                </span>
              </div>

              {/* Donor Name (optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Donor / Camp Source (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Voluntary Blood Drive / Donor #104"
                  value={updateForm.donor_name}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, donor_name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md transition disabled:opacity-50"
                >
                  Save Stock & Expiry
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
