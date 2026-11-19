/**
 * src/pages/bloodbank/BloodRequestPage.jsx
 * ---------------------------------------
 * Blood Unit Request Feature for Patients & Doctors.
 *
 * Requirements:
 *  - Patient/Doctor can request blood with urgency: Normal / Urgent / Emergency
 *  - If stock is low, displays warning and shows list of matching compatible donors
 *  - Active Requests tracking with approval/fulfillment actions for medical staff
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import bloodBankService from '../../services/bloodBankService';
import Navbar from '../../components/common/Navbar';
import { Link } from 'react-router-dom';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const BloodRequestPage = () => {
  const { user } = useAuth();
  const isMedicalStaff =
    user?.role === 'doctor' ||
    user?.role === 'bloodbank_staff' ||
    user?.role === 'admin' ||
    user?.is_staff;

  // Requests Data
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Live Stock Cache
  const [liveStock, setLiveStock] = useState({});

  // Matching Donors from low-stock response
  const [matchingDonorsAlert, setMatchingDonorsAlert] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    patient_name: user?.role === 'patient' && user?.first_name ? `${user.first_name} ${user.last_name}` : '',
    hospital_ward: 'General Ward',
    blood_group: 'O+',
    units_required: 1,
    priority: 'normal', // 'normal' | 'urgent' | 'emergency'
    purpose: 'surgery',
    required_by_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Fetch Live Stock & Requests
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [stockData, reqData] = await Promise.all([
        bloodBankService.getLiveStock(),
        bloodBankService.getRequests(),
      ]);

      const stockMap = {};
      (stockData.stock || []).forEach((s) => {
        stockMap[s.blood_group] = s.units_available;
      });
      setLiveStock(stockMap);
      setRequests(reqData || []);
    } catch (err) {
      console.error('Failed to load blood requests data', err);
      setErrorMsg('Could not load blood requests or inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live stock for currently selected group in form
  const currentGroupUnits = liveStock[formData.blood_group] ?? 0;
  const isSelectedGroupLow = currentGroupUnits < 3 || currentGroupUnits < formData.units_required;

  // Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setMatchingDonorsAlert(null);

    if (!formData.patient_name.trim()) {
      alert('Please enter patient name.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await bloodBankService.createRequest({
        patient_name: formData.patient_name,
        hospital_ward: formData.hospital_ward,
        blood_group: formData.blood_group,
        units_required: parseInt(formData.units_required, 10),
        priority: formData.priority,
        purpose: formData.purpose,
        required_by_date: formData.required_by_date,
        notes: formData.notes,
      });

      setSuccessMsg(res.message || 'Blood request submitted successfully!');

      // Check if response contains matching donors due to low stock
      if (res.stock_status?.is_stock_low && res.matching_donors?.length > 0) {
        setMatchingDonorsAlert({
          alert_message: res.stock_status.alert_message,
          available_units: res.stock_status.units_available,
          units_required: res.stock_status.units_required,
          blood_group: res.stock_status.blood_group,
          donors: res.matching_donors,
        });
      }

      // Reset form
      setFormData({
        patient_name: user?.role === 'patient' && user?.first_name ? `${user.first_name} ${user.last_name}` : '',
        hospital_ward: 'General Ward',
        blood_group: 'O+',
        units_required: 1,
        priority: 'normal',
        purpose: 'surgery',
        required_by_date: new Date().toISOString().split('T')[0],
        notes: '',
      });

      await loadData();
    } catch (err) {
      console.error('Failed to create blood request:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to submit blood request.');
    } finally {
      setSubmitting(false);
    }
  };

  // Staff status update (Approve / Fulfill / Reject)
  const handleUpdateStatus = async (requestId, newStatus) => {
    try {
      const res = await bloodBankService.updateRequestStatus(requestId, newStatus);
      alert(res.message || `Request marked as ${newStatus.toUpperCase()}`);
      await loadData();
    } catch (err) {
      console.error('Failed to update request:', err);
      alert(err.response?.data?.error || 'Failed to update request.');
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-600 text-white border border-red-700 animate-pulse flex items-center gap-1">
            <span>🚨</span>
            <span>EMERGENCY</span>
          </span>
        );
      case 'urgent':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            ⚡ Urgent
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Normal
          </span>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'fulfilled':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'rejected':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
          <Link to="/bloodbank" className="hover:text-rose-600 transition">
            🩸 Blood Bank Inventory
          </Link>
          <span>/</span>
          <span className="text-gray-900">Blood Requests</span>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between shadow-xs">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-700 hover:text-red-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── CRITICAL SHORTAGE: MATCHING DONORS DISPLAY ── */}
        {matchingDonorsAlert && (
          <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-rose-700 text-white shadow-xl animate-fadeIn">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-4xl">🚨</span>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">
                    Low Stock Alert for {matchingDonorsAlert.blood_group}!
                  </h3>
                  <p className="text-rose-100 text-xs sm:text-sm mt-0.5 max-w-2xl">
                    Blood Bank has only <strong>{matchingDonorsAlert.available_units} unit(s)</strong>{' '}
                    available, which is below the safe threshold (<span className="underline">less than 3 units</span>).
                    Below are verified <strong>matching donors</strong> you can call immediately for replacement donation!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMatchingDonorsAlert(null)}
                className="text-white hover:text-rose-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Matching Donors List Cards */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matchingDonorsAlert.donors.map((donor) => (
                <div
                  key={donor.id}
                  className="bg-white/95 backdrop-blur-xs text-gray-900 p-4 rounded-2xl shadow-sm border border-rose-200 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-lg bg-rose-600 text-white font-black text-xs">
                        {donor.blood_group}
                      </span>
                      <span className="text-2xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Ready to Donate
                      </span>
                    </div>

                    <h4 className="font-extrabold text-sm text-gray-900 mt-2">{donor.name}</h4>
                    <p className="text-xs text-gray-500">📍 City: {donor.city || 'Local'}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-blue-700">{donor.phone}</span>
                    <a
                      href={`tel:${donor.phone}`}
                      className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition"
                    >
                      📞 Call Donor
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-red-800 via-rose-800 to-rose-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-xs mb-3">
              🩸 Emergency Blood Requests
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Request Blood Units for Inpatient / Emergency
            </h1>
            <p className="text-rose-200 text-xs sm:text-sm mt-1 max-w-xl">
              Patients and Doctors can request blood units with urgency levels. The system cross-checks
              live stock and automatically surfaces matching donors when supply is low.
            </p>
          </div>

          <Link
            to="/bloodbank/donors"
            className="px-5 py-2.5 rounded-2xl bg-white text-rose-800 hover:bg-rose-50 text-xs font-black uppercase tracking-wider shadow-md transition self-start md:self-auto"
          >
            👥 Voluntary Donors Directory →
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── LEFT: BLOOD REQUEST FORM ── */}
          <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-8 shadow-xs lg:col-span-1">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span>📝</span> Submit Blood Request
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-6">
              Urgency levels: Normal, Urgent, or Emergency.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Patient Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Patient Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ananya Sharma"
                  value={formData.patient_name}
                  onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                />
              </div>

              {/* Blood Group with Live Stock Hint */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 uppercase">
                    Required Blood Group *
                  </label>
                  <span
                    className={`text-2xs font-bold px-2 py-0.5 rounded-full ${
                      isSelectedGroupLow
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {currentGroupUnits} in stock ({isSelectedGroupLow ? 'Low' : 'Adequate'})
                  </span>
                </div>
                <select
                  value={formData.blood_group}
                  onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-black text-rose-700"
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg} (Stock: {liveStock[bg] ?? 0} Units)
                    </option>
                  ))}
                </select>
              </div>

              {/* Units Required & Urgency Level */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Units Needed *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={formData.units_required}
                    onChange={(e) => setFormData({ ...formData, units_required: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Urgency Level *
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-bold"
                  >
                    <option value="normal">🔵 Normal</option>
                    <option value="urgent">⚡ Urgent</option>
                    <option value="emergency">🚨 Emergency</option>
                  </select>
                </div>
              </div>

              {/* Ward Location & Purpose */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Hospital Ward / Room
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ICU-01, Ward 4"
                    value={formData.hospital_ward}
                    onChange={(e) => setFormData({ ...formData, hospital_ward: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Purpose / Medical Case
                  </label>
                  <select
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  >
                    <option value="surgery">Surgery</option>
                    <option value="accident">Accident / Trauma</option>
                    <option value="anemia">Severe Anemia</option>
                    <option value="thalassemia">Thalassemia</option>
                    <option value="maternity">Maternity Delivery</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Required Date */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Required By Date
                </label>
                <input
                  type="date"
                  value={formData.required_by_date}
                  onChange={(e) => setFormData({ ...formData, required_by_date: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Clinical Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Doctor / Clinical Notes
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Hemoglobin dropped to 6.2 g/dL. Immediate transfusion required before procedure."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-md transition disabled:opacity-50 ${
                    formData.priority === 'emergency'
                      ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitting ? 'Submitting Request...' : 'Submit Blood Request'}
                </button>
              </div>
            </form>
          </div>

          {/* ── RIGHT: ACTIVE BLOOD REQUESTS LEDGER ── */}
          <div className="bg-white rounded-3xl border border-gray-200/90 p-6 sm:p-8 shadow-xs lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <span>📋</span> Hospital Blood Requests
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Live patient blood requests with urgency levels and allocation status.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">
                  {requests.length} Total
                </span>
              </div>

              {/* Requests Table */}
              {loading ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto"></div>
                  <p className="mt-3 text-xs text-gray-500 font-semibold">Loading requests...</p>
                </div>
              ) : requests.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <span className="text-4xl block mb-2">🩸</span>
                  <p className="font-bold text-sm">No Blood Requests</p>
                  <p className="text-xs text-gray-400 mt-1">
                    There are no active blood requests in the system.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Group & Units</th>
                        <th className="px-4 py-3">Patient / Ward</th>
                        <th className="px-4 py-3">Urgency</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Stock Check</th>
                        {isMedicalStaff && <th className="px-4 py-3 text-right">Staff Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-gray-50/70 transition">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 font-black text-xs">
                                {req.blood_group}
                              </span>
                              <strong className="text-gray-900 text-sm">
                                x{req.units_required} unit(s)
                              </strong>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900">{req.patient_name}</div>
                            <div className="text-2xs text-gray-500">
                              Ward: {req.hospital_ward || 'Not specified'} • By:{' '}
                              {req.requested_by_name}
                            </div>
                          </td>

                          <td className="px-4 py-3">{getPriorityBadge(req.priority)}</td>

                          <td className="px-4 py-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-2xs font-bold border ${getStatusBadge(
                                req.status
                              )}`}
                            >
                              {req.status_display || req.status}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-xs">
                            {req.is_stock_low ? (
                              <span className="text-red-600 font-bold flex items-center gap-1">
                                <span>⚠️</span>
                                <span>Stock Low ({req.available_units_now})</span>
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">
                                ✅ Sufficient ({req.available_units_now})
                              </span>
                            )}
                          </td>

                          {isMedicalStaff && (
                            <td className="px-4 py-3 text-right">
                              {req.status === 'pending' && (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleUpdateStatus(req.id, 'fulfilled')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition"
                                    title="Fulfill and allocate blood units"
                                  >
                                    Fulfill
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStatus(req.id, 'rejected')}
                                    className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xs transition"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {req.status === 'fulfilled' && (
                                <span className="text-2xs font-bold text-emerald-700">Fulfilled ✓</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 text-2xs text-gray-500 flex items-center justify-between">
              <span>Urgency Levels: Emergency (Immediate), Urgent (2 hrs), Normal</span>
              <Link to="/bloodbank" className="text-rose-600 hover:underline font-bold">
                Check Live Blood Stock Inventory →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BloodRequestPage;
