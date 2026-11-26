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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import bloodBankService from '../../services/bloodBankService';
import bedService from '../../services/bedService';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';
import { Link, Navigate } from 'react-router-dom';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const BloodRequestPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const isAuthUser = Boolean(isAuthenticated && user);
  const isMedicalStaff =
    user?.role === 'doctor' ||
    user?.role === 'bloodbank_staff' ||
    user?.role === 'admin' ||
    user?.is_staff;

  // Requests Data
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const actionRef = useRef(false);

  // Live Stock Cache
  const [liveStock, setLiveStock] = useState({});

  // Matching Donors from low-stock response
  const [matchingDonorsAlert, setMatchingDonorsAlert] = useState(null);

  // Cross-module state: Inpatients & Journey
  const [inpatients, setInpatients] = useState([]);
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);
  const [journeyPatientId, setJourneyPatientId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    patient_id: null,
    patient_name: user?.role === 'patient' && user?.first_name ? `${user.first_name} ${user.last_name}` : '',
    hospital_ward: 'General Ward',
    blood_group: 'O+',
    units_required: 1,
    priority: 'normal', // 'normal' | 'urgent' | 'emergency'
    purpose: 'surgery',
    required_by_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Fetch Live Stock, Requests & Active Inpatients
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [stockData, reqData, inpatientsData] = await Promise.all([
        bloodBankService.getLiveStock(),
        bloodBankService.getRequests(),
        bedService.getActiveAdmissions().catch(() => ({ admissions: [] })),
      ]);

      const stockMap = {};
      (stockData.stock || []).forEach((s) => {
        stockMap[s.blood_group] = s.units_available;
      });
      setLiveStock(stockMap);
      setRequests(reqData || []);
      setInpatients(inpatientsData?.admissions || (Array.isArray(inpatientsData) ? inpatientsData : []));
    } catch (err) {
      console.error('Failed to load blood requests data', err);
      setErrorMsg('Could not load blood requests or inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthUser) return;
    loadData();
  }, [isAuthUser, loadData]);

  // Defensive Guard: Must be authenticated
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthUser) {
    return <Navigate to="/login" replace />;
  }

  // Handler for quick-selecting an active inpatient
  const handleSelectInpatient = (admissionId) => {
    if (!admissionId) return;
    const adm = inpatients.find((a) => String(a.id) === String(admissionId));
    if (!adm) return;

    setFormData((prev) => ({
      ...prev,
      patient_id: adm.patient_id || adm.patient,
      patient_name: adm.patient_name || '',
      hospital_ward: `${adm.ward_name} (Bed ${adm.bed_number})`,
      blood_group: adm.patient_blood_group && BLOOD_GROUPS.includes(adm.patient_blood_group) ? adm.patient_blood_group : prev.blood_group,
    }));
  };

  // Live stock for currently selected group in form
  const currentGroupUnits = liveStock[formData.blood_group] ?? 0;
  const isSelectedGroupLow = currentGroupUnits < 3 || currentGroupUnits < formData.units_required;

  // Handle Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (actionRef.current) return;
    setErrorMsg(null);
    setMatchingDonorsAlert(null);

    if (!formData.patient_name.trim()) {
      setErrorMsg('Please enter patient name.');
      return;
    }

    actionRef.current = true;
    try {
      setSubmitting(true);
      const res = await bloodBankService.createRequest({
        patient_id: formData.patient_id || undefined,
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
        patient_id: null,
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
      actionRef.current = false;
      setSubmitting(false);
    }
  };

  // Staff status update (Approve / Fulfill / Reject)
  const handleUpdateStatus = async (requestId, newStatus) => {
    if (actionRef.current) return;
    actionRef.current = true;
    setUpdatingId(requestId);
    setErrorMsg(null);
    try {
      const res = await bloodBankService.updateRequestStatus(requestId, newStatus);
      setSuccessMsg(res.message || `Request marked as ${newStatus.toUpperCase()}`);
      await loadData();
    } catch (err) {
      console.error('Failed to update request:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update request.');
    } finally {
      setUpdatingId(null);
      actionRef.current = false;
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
    <div className="bg-white">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Success Alert */}
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-clinical-danger text-xs font-semibold flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-clinical-danger hover:opacity-75 font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Matching Donors Alert on Critical Shortage */}
        {matchingDonorsAlert && (
          <div className="p-5 sm:p-6 rounded-xl bg-rose-50/70 border border-rose-200 border-l-4 border-l-clinical-danger space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">
                  Low Stock Alert for {matchingDonorsAlert.blood_group} — {matchingDonorsAlert.available_units} Unit(s) Left
                </h3>
                <p className="text-xs text-red-800 max-w-2xl">
                  Stock is below the safe reserve threshold (&lt; 3 units). Contact verified matching donors below for immediate replacement donation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMatchingDonorsAlert(null)}
                className="text-red-800 hover:opacity-75 font-bold text-base cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matchingDonorsAlert.donors.map((donor) => (
                <div
                  key={donor.id}
                  className="bg-white text-ink p-4 rounded-xl border border-rose-200 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-clinical-danger text-white font-mono font-bold text-xs">
                        {donor.blood_group}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-clinical-success bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Eligible
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-ink mt-2">{donor.name}</h4>
                    <p className="text-xs text-muted">{donor.city || 'Local City'}</p>
                  </div>

                  <div className="pt-2.5 border-t border-hairline flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-cobalt">{donor.phone}</span>
                    <a
                      href={`tel:${donor.phone}`}
                      className="px-3 py-1.5 rounded-lg bg-clinical-danger hover:opacity-95 text-white text-xs font-semibold transition"
                    >
                      Call Donor
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Editorial Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
          <div className="space-y-1.5">
            <span className="editorial-eyebrow">Blood Requisition · Stock Cross-Check</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Emergency &amp; Planned Blood Requests
            </h1>
            <p className="text-xs sm:text-sm text-muted max-w-2xl">
              Submit blood requests with urgency levels. Automatically checks live stock and surfaces eligible donors when inventory is critical.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isMedicalStaff && (
              <>
                <Link to="/bloodbank/stock" className="editorial-btn-secondary">
                  Live Stock
                </Link>
                <Link to="/bloodbank/donors" className="editorial-btn-primary">
                  Donor Registry →
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── LEFT: BLOOD REQUEST FORM ── */}
          <div className="editorial-surface p-6 lg:col-span-1">
            <h2 className="font-display text-base font-bold text-ink">
              Submit Blood Request
            </h2>
            <p className="text-xs text-muted mt-1 mb-5">
              Urgency levels: Normal, Urgent, or Emergency.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Inpatient Quick-Fill Selector */}
              {inpatients && inpatients.length > 0 && (
                <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-200/80">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-2xs font-extrabold text-rose-900 uppercase flex items-center gap-1.5">
                      <span>🛏️</span> Select Admitted Inpatient
                    </label>
                    <span className="text-[10px] font-bold text-rose-700 bg-white px-2 py-0.5 rounded-full border border-rose-200">
                      {inpatients.length} Inpatient{inpatients.length > 1 ? 's' : ''} Admitted
                    </span>
                  </div>
                  <select
                    onChange={(e) => handleSelectInpatient(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-white rounded-xl border border-rose-300 text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    defaultValue=""
                  >
                    <option value="">-- Choose Inpatient to Auto-Fill --</option>
                    {inpatients.map((adm) => (
                      <option key={adm.id} value={adm.id}>
                        {adm.patient_name} ({adm.patient_code || 'ID: ' + adm.id}) - {adm.ward_name} (Bed {adm.bed_number}) - Blood: {adm.patient_blood_group || 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
          <div className="editorial-card p-6 lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-hairline">
                <div>
                  <h2 className="font-display text-base font-bold text-ink">
                    Hospital Blood Requests
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Live blood requisitions with urgency levels, live stock check, and fulfillment status.
                  </p>
                </div>
                <span className="font-mono px-2.5 py-1 rounded bg-surface border border-hairline text-ink text-xs font-semibold">
                  {requests.length} Total
                </span>
              </div>

              {/* Requests Table */}
              {loading ? (
                <div className="py-20 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt mx-auto"></div>
                  <p className="mt-3 text-xs text-muted font-medium">Loading requests...</p>
                </div>
              ) : requests.length === 0 ? (
                <div className="p-12 text-center text-muted">
                  <p className="font-display font-bold text-sm text-ink">No Blood Requests</p>
                  <p className="text-xs text-muted mt-1">
                    There are no active blood requests in the system.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full divide-y divide-hairline text-left text-xs">
                    <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
                      <tr>
                        <th className="px-4 py-3">Group &amp; Units</th>
                        <th className="px-4 py-3">Patient / Ward</th>
                        <th className="px-4 py-3">Urgency</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Stock Check</th>
                        {isMedicalStaff && <th className="px-4 py-3 text-right">Staff Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline bg-white">
                      {requests.map((req) => (
                        <tr key={req.id} className="hover:bg-surface/60 transition">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded bg-rose-50 text-clinical-danger border border-rose-200 font-mono font-bold text-xs">
                                {req.blood_group}
                              </span>
                              <strong className="font-mono text-ink text-xs">
                                ×{req.units_required}u
                              </strong>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink">{req.patient_name}</span>
                              {req.patient_code && (
                                <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cobalt-tint text-cobalt">
                                  {req.patient_code}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {req.hospital_ward || 'General Ward'} · By {req.requested_by_name}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                              {req.patient_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setJourneyPatientId(req.patient_id);
                                    setJourneyModalOpen(true);
                                  }}
                                  className="text-[11px] font-semibold text-cobalt hover:underline cursor-pointer"
                                >
                                  Care Timeline
                                </button>
                              )}
                              <Link
                                to="/beds"
                                className="text-[11px] font-semibold text-muted hover:text-ink hover:underline"
                              >
                                Ward Grid
                              </Link>
                            </div>
                          </td>

                          <td className="px-4 py-3.5">{getPriorityBadge(req.priority)}</td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`font-mono px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${getStatusBadge(
                                req.status
                              )}`}
                            >
                              {req.status_display || req.status}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs">
                            {req.is_stock_low ? (
                              <span className="font-mono text-clinical-danger font-semibold">
                                Low ({req.available_units_now}u)
                              </span>
                            ) : (
                              <span className="font-mono text-clinical-success font-semibold">
                                Safe ({req.available_units_now}u)
                              </span>
                            )}
                          </td>

                          {isMedicalStaff && (
                            <td className="px-4 py-3.5 text-right">
                              {req.status === 'pending' && (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(req.id, 'fulfilled')}
                                    disabled={updatingId === req.id}
                                    className="px-2.5 py-1 rounded-lg bg-clinical-success hover:opacity-95 disabled:opacity-50 text-white font-semibold text-[11px] transition cursor-pointer"
                                  >
                                    {updatingId === req.id ? '...' : 'Fulfill'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(req.id, 'rejected')}
                                    disabled={updatingId === req.id}
                                    className="px-2.5 py-1 rounded-lg bg-surface hover:bg-slate-200 border border-hairline disabled:opacity-50 text-muted font-semibold text-[11px] transition cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {req.status === 'fulfilled' && (
                                <span className="font-mono text-[10px] font-bold uppercase text-clinical-success">Fulfilled ✓</span>
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

            <div className="mt-6 pt-4 border-t border-hairline text-[11px] text-muted flex flex-wrap items-center justify-between gap-2">
              <span>Urgency Levels: Emergency (Immediate), Urgent (2 hrs), Normal</span>
              <Link to="/bloodbank" className="text-cobalt hover:underline font-semibold">
                Check Live Blood Stock Inventory →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Cross-Module Unified Patient Journey Modal ── */}
      <PatientJourneyModal
        isOpen={journeyModalOpen}
        onClose={() => setJourneyModalOpen(false)}
        patientId={journeyPatientId}
      />
    </div>
  );
};

export default BloodRequestPage;
