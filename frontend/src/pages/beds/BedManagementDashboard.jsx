/**
 * src/pages/beds/BedManagementDashboard.jsx
 * -----------------------------------------
 * Live Bed Availability & Ward Management Dashboard.
 *
 * Features:
 *  - Live bed availability statistics (Total, Available, Occupied, Cleaning)
 *  - Strict color coding:
 *      * Available -> GREEN (Emerald)
 *      * Occupied  -> RED (Rose)
 *      * Cleaning  -> YELLOW / AMBER
 *  - Admin Ward Creation (General, ICU, Private, etc.)
 *  - Admin Bed Creation (Single & Batch bed generator)
 *  - Instant one-click Bed Status Toggle (Available <-> Occupied <-> Cleaning)
 *  - Ward filter tabs (General, ICU, Private) and Status filters
 *  - Real-time auto-refresh option (5s polling)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import bedService from '../../services/bedService';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';
import bloodBankService from '../../services/bloodBankService';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';

const WARD_TYPE_LABELS = {
  general: 'General Ward',
  icu: 'ICU',
  private: 'Private Room',
  semi: 'Semi-Private Room',
  emergency: 'Emergency Ward',
  pediatric: 'Pediatric Ward',
  maternity: 'Maternity Ward',
};

const BedManagementDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Defensive Guard: Only Admin and Doctor can manage beds
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthenticated || !user || !['admin', 'doctor'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const isAdmin = user?.role === 'admin' || user?.is_staff;
  const isDoctor = user?.role === 'doctor';
  const canAdmit = isAdmin || isDoctor;

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [summary, setSummary] = useState({
    total_beds: 0,
    available_beds: 0,
    occupied_beds: 0,
    cleaning_beds: 0,
    maintenance_beds: 0,
    occupancy_rate: 0,
  });
  const [wards, setWards] = useState([]);
  const [activeAdmissions, setActiveAdmissions] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [viewTab, setViewTab] = useState('grid'); // 'grid' | 'admissions'

  // Filter states
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddWardModal, setShowAddWardModal] = useState(false);
  const [showAddBedModal, setShowAddBedModal] = useState(false);
  const [selectedBedForAction, setSelectedBedForAction] = useState(null);

  // Cross-Module Modals (Admit, Blood Request, Journey)
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [opdWaitingTokens, setOpdWaitingTokens] = useState([]);
  const [registeredPatients, setRegisteredPatients] = useState([]);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [admitForm, setAdmitForm] = useState({
    patient_source: 'opd', // 'opd' | 'registered'
    token_id: '',
    patient_id: '',
    ward_type: 'general',
    diagnosis: '',
    attending_doctor_id: '',
  });

  const [showBloodModal, setShowBloodModal] = useState(false);
  const [bloodForm, setBloodForm] = useState({
    patient_id: '',
    patient_name: '',
    blood_group: 'O+',
    hospital_ward: '',
    units_required: 1,
    priority: 'urgent',
    purpose: 'surgery',
    notes: '',
  });

  const [journeyModalOpen, setJourneyModalOpen] = useState(false);
  const [journeyPatientId, setJourneyPatientId] = useState(null);

  // Form states: New Ward
  const [wardForm, setWardForm] = useState({
    name: '',
    ward_type: 'general',
    floor_number: 1,
    total_beds: 10,
  });

  // Form states: New Bed
  const [bedForm, setBedForm] = useState({
    ward: '',
    bed_number: '',
    status: 'available',
    has_oxygen: false,
    has_ventilator: false,
    has_monitor: false,
    // Batch generation helper
    is_batch: false,
    batch_prefix: 'B-',
    batch_start: 101,
    batch_count: 5,
  });

  // Fetch live overview & active admissions
  const fetchOverview = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [overviewData, admissionsData] = await Promise.all([
        bedService.getOverview(),
        bedService.getActiveAdmissions().catch(() => []),
      ]);
      setSummary(overviewData.summary || {});
      setWards(overviewData.wards || []);
      setActiveAdmissions(admissionsData || []);
    } catch (err) {
      console.error('Failed to fetch bed overview:', err);
      setError('Could not load live bed availability. Ensure backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchOverview(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchOverview]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Handle Quick Status Change
  const handleStatusChange = async (bedId, newStatus) => {
    try {
      await bedService.updateBedStatus(bedId, newStatus);
      setSuccessMsg(`Bed status successfully updated to ${newStatus.toUpperCase()}`);
      // Refresh overview silently
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to update bed status:', err);
      alert('Failed to update bed status: ' + (err.response?.data?.error || err.message));
    }
  };

  // Handle Delete Bed
  const handleDeleteBed = async (bedId, bedNumber) => {
    if (!window.confirm(`Are you sure you want to remove Bed ${bedNumber}?`)) return;
    try {
      await bedService.deleteBed(bedId);
      setSuccessMsg(`Bed ${bedNumber} removed successfully.`);
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to delete bed:', err);
      alert('Failed to delete bed: ' + (err.response?.data?.error || err.message));
    }
  };

  // Handle Discharge Inpatient (Bed becomes Available again)
  const handleDischargePatient = async (admissionId, bedNumber, patientName = 'Patient') => {
    const notes = prompt(`Enter discharge summary notes for ${patientName}:`, 'Patient recovered and discharged.');
    if (notes === null) return; // user cancelled

    try {
      const res = await bedService.dischargePatient(admissionId, notes);
      setSuccessMsg(`Patient ${patientName} discharged. Bed ${bedNumber} is now Available again!`);
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to discharge patient:', err);
      alert('Failed to discharge patient: ' + (err.response?.data?.error || err.message));
    }
  };

  // ─── CROSS-MODULE 1: ADMIT PATIENT FROM OPD / REGISTERED ───
  const openAdmitModal = async () => {
    try {
      const [tokenData, patData, docData] = await Promise.all([
        opdService.getTokens({ status: 'waiting' }).catch(() => []),
        hospitalService.getPatients().catch(() => []),
        hospitalService.getDoctors({ available: true }).catch(() => []),
      ]);
      setOpdWaitingTokens(tokenData || []);
      setRegisteredPatients(patData || []);
      setAvailableDoctors(docData || []);

      const defaultToken = tokenData?.[0];
      const defaultPat = patData?.[0];

      setAdmitForm({
        patient_source: tokenData?.length > 0 ? 'opd' : 'registered',
        token_id: defaultToken?.id || '',
        patient_id: defaultToken?.patient || defaultPat?.id || '',
        ward_type: 'general',
        diagnosis: defaultToken?.symptoms || 'Patient Observation & Care',
        attending_doctor_id: defaultToken?.doctor || docData?.[0]?.id || '',
      });
      setShowAdmitModal(true);
    } catch (err) {
      console.error('Failed to open admit modal', err);
      alert('Could not retrieve OPD queue data.');
    }
  };

  const handleAutoAdmitSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        patient_id: Number(admitForm.patient_id),
        token_id: admitForm.patient_source === 'opd' && admitForm.token_id ? Number(admitForm.token_id) : null,
        ward_type: admitForm.ward_type,
        diagnosis: admitForm.diagnosis,
        attending_doctor_id: admitForm.attending_doctor_id ? Number(admitForm.attending_doctor_id) : null,
      };

      const res = await bedService.autoAdmitPatient(payload);
      setSuccessMsg(res.message || 'Patient successfully admitted!');
      setShowAdmitModal(false);
      fetchOverview(true);
    } catch (err) {
      console.error('Admit failed', err);
      alert(err?.response?.data?.error || 'Failed to admit patient.');
    }
  };

  // ─── CROSS-MODULE 2: BLOOD REQUEST FOR INPATIENT ───
  const openBloodModalForInpatient = (patientId, patientName, bloodGroup, wardLocation) => {
    setBloodForm({
      patient_id: patientId || '',
      patient_name: patientName || '',
      blood_group: bloodGroup || 'O+',
      hospital_ward: wardLocation || '',
      units_required: 1,
      priority: 'urgent',
      purpose: 'surgery',
      notes: `Requested for inpatient in ${wardLocation}`,
    });
    setShowBloodModal(true);
  };

  const handleBloodSubmit = async (e) => {
    e.preventDefault();
    try {
      await bloodBankService.createRequest(bloodForm);
      setSuccessMsg(`Blood request for ${bloodForm.units_required} unit(s) ${bloodForm.blood_group} submitted successfully!`);
      setShowBloodModal(false);
    } catch (err) {
      console.error('Failed to submit blood request', err);
      alert(err?.response?.data?.detail || 'Failed to submit blood request.');
    }
  };

  // ─── CROSS-MODULE 3: VIEW COMPLETE PATIENT JOURNEY ───
  const openJourneyForPatient = (patientId) => {
    if (!patientId) {
      alert('No Patient ID linked to this record.');
      return;
    }
    setJourneyPatientId(patientId);
    setJourneyModalOpen(true);
  };

  // Handle Create Ward
  const handleCreateWard = async (e) => {
    e.preventDefault();
    try {
      await bedService.createWard({
        name: wardForm.name,
        ward_type: wardForm.ward_type,
        floor_number: Number(wardForm.floor_number),
        total_beds: Number(wardForm.total_beds),
        is_active: true,
      });
      setSuccessMsg(`Ward "${wardForm.name}" created successfully!`);
      setShowAddWardModal(false);
      setWardForm({ name: '', ward_type: 'general', floor_number: 1, total_beds: 10 });
      fetchOverview(true);
    } catch (err) {
      console.error('Failed to create ward:', err);
      alert('Error creating ward: ' + (err.response?.data?.name?.[0] || err.message));
    }
  };

  // Handle Create Bed(s)
  const handleCreateBed = async (e) => {
    e.preventDefault();
    if (!bedForm.ward) {
      alert('Please select a ward.');
      return;
    }

    try {
      if (bedForm.is_batch) {
        // Generate batch list
        const bedsList = [];
        const start = parseInt(bedForm.batch_start, 10) || 101;
        const count = parseInt(bedForm.batch_count, 10) || 5;
        const prefix = bedForm.batch_prefix || 'B-';

        for (let i = 0; i < count; i++) {
          bedsList.push({
            ward: bedForm.ward,
            bed_number: `${prefix}${start + i}`,
            status: bedForm.status,
            has_oxygen: bedForm.has_oxygen,
            has_ventilator: bedForm.has_ventilator,
            has_monitor: bedForm.has_monitor,
          });
        }
        await bedService.createBed(bedsList);
        setSuccessMsg(`Successfully generated ${count} beds in ward.`);
      } else {
        await bedService.createBed({
          ward: bedForm.ward,
          bed_number: bedForm.bed_number,
          status: bedForm.status,
          has_oxygen: bedForm.has_oxygen,
          has_ventilator: bedForm.has_ventilator,
          has_monitor: bedForm.has_monitor,
        });
        setSuccessMsg(`Bed "${bedForm.bed_number}" created successfully!`);
      }

      setShowAddBedModal(false);
      setBedForm({
        ward: '',
        bed_number: '',
        status: 'available',
        has_oxygen: false,
        has_ventilator: false,
        has_monitor: false,
        is_batch: false,
        batch_prefix: 'B-',
        batch_start: 101,
        batch_count: 5,
      });
      fetchOverview(true);
    } catch (err) {
      console.error('Failed to create bed:', err);
      alert('Error creating bed: ' + (err.response?.data?.non_field_errors?.[0] || err.message));
    }
  };

  // Helper for Bed Status Color Scheme
  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
        return {
          pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          tileBg: 'bg-emerald-50/60 hover:bg-emerald-100/70 border-emerald-300',
          iconColor: 'text-emerald-600',
          indicator: 'bg-emerald-500',
          label: 'Available',
        };
      case 'occupied':
        return {
          pill: 'bg-rose-100 text-rose-800 border-rose-300',
          tileBg: 'bg-rose-50/60 hover:bg-rose-100/70 border-rose-300',
          iconColor: 'text-rose-600',
          indicator: 'bg-rose-500',
          label: 'Occupied',
        };
      case 'cleaning':
        return {
          pill: 'bg-amber-100 text-amber-800 border-amber-300',
          tileBg: 'bg-amber-50/60 hover:bg-amber-100/70 border-amber-300',
          iconColor: 'text-amber-600',
          indicator: 'bg-amber-500',
          label: 'Cleaning',
        };
      default:
        return {
          pill: 'bg-gray-100 text-gray-800 border-gray-300',
          tileBg: 'bg-gray-50 hover:bg-gray-100 border-gray-300',
          iconColor: 'text-gray-500',
          indicator: 'bg-gray-400',
          label: status,
        };
    }
  };

  // Filtered Wards & Beds
  const filteredWards = wards
    .filter((ward) => {
      if (selectedType !== 'all' && ward.ward_type !== selectedType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const wardMatches = ward.name.toLowerCase().includes(q);
        const bedMatches = ward.beds?.some((b) => b.bed_number.toLowerCase().includes(q));
        return wardMatches || bedMatches;
      }
      return true;
    })
    .map((ward) => {
      let beds = ward.beds || [];
      if (selectedStatus !== 'all') {
        beds = beds.filter((b) => b.status === selectedStatus);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        beds = beds.filter((b) => b.bed_number.toLowerCase().includes(q) || ward.name.toLowerCase().includes(q));
      }
      return { ...ward, filteredBeds: beds };
    });

  return (
    <div className="min-h-screen bg-gray-50/50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner Alert if any */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-sm transition-all animate-fadeIn">
            <div className="flex items-center space-x-2">
              <span>✅</span>
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Dashboard Title & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🛏️</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Live Bed Availability Dashboard
              </h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Real-time hospital bed occupancy, ward capacity, and color-coded status monitoring.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold transition border shadow-xs ${
                autoRefresh
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-200'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full mr-2 ${autoRefresh ? 'bg-white animate-ping' : 'bg-gray-400'}`} />
              {autoRefresh ? 'Live Updates (5s)' : 'Auto-Refresh: Off'}
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchOverview(true)}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-2 rounded-xl bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-xs transition"
              title="Refresh now"
            >
              <span className={`mr-1 ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
              Refresh
            </button>

            {/* Cross-Module Action: Admit Patient to Ward */}
            {canAdmit && (
              <button
                onClick={openAdmitModal}
                className="inline-flex items-center px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition gap-1.5"
                title="Admit an OPD waiting patient or registered patient"
              >
                <span>🛏️</span>
                <span>+ Admit Patient</span>
              </button>
            )}

            {/* Admin Action Buttons */}
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowAddWardModal(true)}
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <span className="mr-1.5 text-sm">+</span> Add Ward
                </button>
                <button
                  onClick={() => setShowAddBedModal(true)}
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <span className="mr-1.5 text-sm">+</span> Add Bed
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Summary Counters with Strict Color Coding ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {/* Total Beds */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Beds</span>
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl text-base">🛏️</span>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">{summary.total_beds}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{wards.length} Wards Active</p>
          </div>

          {/* Available Beds -> GREEN */}
          <div className="bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 p-5 rounded-2xl border border-emerald-300 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Available</span>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
              </span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-700 mt-2">{summary.available_beds}</p>
            <p className="text-xs text-emerald-800 mt-1 font-semibold">
              Ready for immediate admission
            </p>
          </div>

          {/* Occupied Beds -> RED */}
          <div className="bg-gradient-to-br from-rose-50/70 to-rose-100/40 p-5 rounded-2xl border border-rose-300 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Occupied</span>
              <span className="w-3 h-3 rounded-full bg-rose-600"></span>
            </div>
            <p className="text-3xl font-extrabold text-rose-700 mt-2">{summary.occupied_beds}</p>
            <p className="text-xs text-rose-800 mt-1 font-semibold">
              Currently admitted patients
            </p>
          </div>

          {/* Cleaning Beds -> AMBER/YELLOW */}
          <div className="bg-gradient-to-br from-amber-50/70 to-amber-100/40 p-5 rounded-2xl border border-amber-300 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Cleaning / Sanitize</span>
              <span className="text-base">🧹</span>
            </div>
            <p className="text-3xl font-extrabold text-amber-700 mt-2">{summary.cleaning_beds}</p>
            <p className="text-xs text-amber-800 mt-1 font-semibold">
              Undergoing disinfection
            </p>
          </div>

          {/* Occupancy Rate */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Occupancy Rate</span>
              <span className="p-2 bg-purple-50 text-purple-600 rounded-xl text-base">📊</span>
            </div>
            <p className="text-3xl font-extrabold text-gray-900 mt-2">{summary.occupancy_rate}%</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-2 overflow-hidden">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(summary.occupancy_rate, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* ── Main View Selector Tabs ── */}
        <div className="flex items-center gap-3 border-b border-gray-200 pb-3 mb-6">
          <button
            onClick={() => setViewTab('grid')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              viewTab === 'grid'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>🛏️</span>
            <span>Live Ward & Bed Grid</span>
          </button>

          <button
            onClick={() => setViewTab('admissions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              viewTab === 'admissions'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>📋</span>
            <span>Active Inpatients ({activeAdmissions.length})</span>
          </button>
        </div>

        {viewTab === 'admissions' ? (
          /* ── Inpatient Admissions Table ── */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Current Inpatient Admissions</h2>
                <p className="text-xs text-gray-500">
                  Patients currently occupying hospital beds. Discharging a patient frees their bed to Available.
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
                {activeAdmissions.length} Admitted
              </span>
            </div>

            {activeAdmissions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <span className="text-4xl block mb-2">🛏️</span>
                <p className="font-bold text-sm">No Patients Currently Admitted</p>
                <p className="text-xs text-gray-400 mt-1">All hospital beds are currently free or cleaning.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Assigned Bed</th>
                      <th className="px-6 py-3.5">Patient Details</th>
                      <th className="px-6 py-3.5">Ward & Category</th>
                      <th className="px-6 py-3.5">Attending Doctor</th>
                      <th className="px-6 py-3.5">Diagnosis</th>
                      <th className="px-6 py-3.5">Admitted On</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeAdmissions.map((adm) => (
                      <tr key={adm.id} className="hover:bg-gray-50/80 transition">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-300 font-black text-xs">
                            <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                            <span>{adm.bed_number}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{adm.patient_name}</div>
                          <div className="text-xs text-gray-500">
                            {adm.patient_code} • Gender: {adm.patient_gender} • Blood:{' '}
                            <span className="text-red-600 font-semibold">{adm.patient_blood_group}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{adm.ward_name}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-500">{adm.ward_type}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-gray-700">
                          {adm.attending_doctor_name || 'Not Assigned'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                          {adm.diagnosis || 'Clinical Care'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {new Date(adm.admission_date).toLocaleString([], {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openBloodModalForInpatient(adm.patient_id || adm.patient, adm.patient_name, adm.patient_blood_group, `${adm.ward_name} (Bed ${adm.bed_number})`)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition"
                              title="Request blood for this inpatient"
                            >
                              🩸 Blood
                            </button>
                            <button
                              onClick={() => openJourneyForPatient(adm.patient_id || adm.patient)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                              title="View complete medical timeline"
                            >
                              📜 Journey
                            </button>
                            <button
                              onClick={() => handleDischargePatient(adm.id, adm.bed_number, adm.patient_name)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition"
                            >
                              Discharge →
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* ── Grid View ── */
          <>
            {/* ── Filter Controls ── */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 mb-8 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Ward Type Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedType('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedType === 'all'
                    ? 'bg-gray-900 text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All Wards
              </button>
              <button
                onClick={() => setSelectedType('general')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedType === 'general'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🏥 General Ward
              </button>
              <button
                onClick={() => setSelectedType('icu')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedType === 'icu'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🚨 ICU
              </button>
              <button
                onClick={() => setSelectedType('private')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedType === 'private'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                ⭐ Private Room
              </button>
            </div>

            {/* Right: Status Filter & Search */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs">
                <button
                  onClick={() => setSelectedStatus('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedStatus === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600'
                  }`}
                >
                  All Status
                </button>
                <button
                  onClick={() => setSelectedStatus('available')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedStatus === 'available' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700'
                  }`}
                >
                  ● Available
                </button>
                <button
                  onClick={() => setSelectedStatus('occupied')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedStatus === 'occupied' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-700'
                  }`}
                >
                  ● Occupied
                </button>
                <button
                  onClick={() => setSelectedStatus('cleaning')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedStatus === 'cleaning' ? 'bg-amber-500 text-white shadow-xs' : 'text-amber-700'
                  }`}
                >
                  ● Cleaning
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search ward or bed #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 sm:w-56 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
                />
                <span className="absolute left-2.5 top-2 text-xs text-gray-400">🔍</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Color Legend Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-white rounded-xl border border-gray-200 text-xs text-gray-600 mb-6 shadow-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-bold text-gray-800">Status Color Code:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 border border-emerald-600"></span>
              <strong className="text-emerald-700">Green = Available</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500 border border-rose-600"></span>
              <strong className="text-rose-700">Red = Occupied</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-400 border border-amber-500"></span>
              <strong className="text-amber-700">Yellow = Cleaning</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 text-gray-500">
            <span>💨 Oxygen</span>
            <span>🫁 Ventilator</span>
            <span>📟 Monitor</span>
            {isAdmin && <span className="font-semibold text-blue-600">💡 Click any bed to change status</span>}
          </div>
        </div>

        {/* ── Main Live Bed Grid by Ward ── */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-sm text-gray-500 font-semibold">Loading live bed occupancy...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700">
            <p className="font-bold text-base">{error}</p>
            <button
              onClick={() => fetchOverview()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        ) : filteredWards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-xs">
            <span className="text-4xl">🛏️</span>
            <h3 className="text-base font-bold text-gray-900 mt-2">No Wards or Beds Found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {isAdmin
                ? 'Get started by creating your hospital wards (General, ICU, Private) and adding beds.'
                : 'No bed records are matching your active filter criteria.'}
            </p>
            {isAdmin && (
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setShowAddWardModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
                >
                  + Create First Ward
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {filteredWards.map((ward) => {
              const beds = ward.filteredBeds || [];
              return (
                <div
                  key={ward.id}
                  className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden transition"
                >
                  {/* Ward Header */}
                  <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-lg shadow-xs">
                        {ward.ward_type === 'icu' ? '🚨' : ward.ward_type === 'private' ? '⭐' : '🏥'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-gray-900">{ward.name}</h2>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-200 text-gray-700">
                            {WARD_TYPE_LABELS[ward.ward_type] || ward.ward_type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Floor {ward.floor_number} • Capacity: {ward.total_beds} Beds
                        </p>
                      </div>
                    </div>

                    {/* Ward Quick Stats Pill */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                        {ward.available_beds_count} Free
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold border border-rose-300">
                        {ward.occupied_beds_count} Occupied
                      </span>
                      {ward.cleaning_beds_count > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold border border-amber-300">
                          {ward.cleaning_beds_count} Cleaning
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ward Beds Grid */}
                  <div className="p-6">
                    {beds.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-xs">
                        No beds match active filters in this ward.
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setBedForm((prev) => ({ ...prev, ward: ward.id }));
                              setShowAddBedModal(true);
                            }}
                            className="block mx-auto mt-2 text-blue-600 hover:text-blue-800 font-bold"
                          >
                            + Add Bed to {ward.name}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {beds.map((bed) => {
                          const badge = getStatusBadge(bed.status);
                          return (
                            <div
                              key={bed.id}
                              onClick={() => {
                                if (isAdmin) setSelectedBedForAction(bed);
                              }}
                              className={`p-3.5 rounded-xl border-2 transition-all relative flex flex-col justify-between cursor-pointer group ${badge.tileBg}`}
                            >
                              {/* Top row: Bed # and status indicator dot */}
                              <div className="flex items-center justify-between">
                                <span className="font-black text-gray-900 text-sm tracking-tight">
                                  {bed.bed_number}
                                </span>
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${badge.indicator} ${
                                    bed.status === 'available' ? 'animate-pulse' : ''
                                  }`}
                                  title={badge.label}
                                />
                              </div>

                              {/* Middle: Equipment tags & Patient Name if occupied */}
                              <div className="my-2 space-y-1">
                                {bed.status === 'occupied' && (
                                  <div className="text-2xs font-semibold text-rose-900 truncate">
                                    👤 {bed.current_patient_name || 'Patient Admitted'}
                                  </div>
                                )}

                                <div className="flex items-center gap-1 text-xs">
                                  {bed.has_oxygen && <span title="Oxygen Support">💨</span>}
                                  {bed.has_ventilator && <span title="Ventilator Equipped">🫁</span>}
                                  {bed.has_monitor && <span title="Cardiac Monitor">📟</span>}
                                </div>
                              </div>

                              {/* Bottom: Status Pill */}
                              <div className="mt-1 flex items-center justify-between">
                                <span
                                  className={`text-2xs font-bold px-2 py-0.5 rounded-md border ${badge.pill}`}
                                >
                                  {badge.label}
                                </span>

                                {isAdmin && (
                                  <span className="text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition">
                                    ⚙️
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    )}
  </main>

      {/* ── Modal: Add Ward ── */}
      {showAddWardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>🏥</span> Add Hospital Ward
              </h3>
              <button
                onClick={() => setShowAddWardModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWard} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Ward Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Ward A, ICU-1, Deluxe Private"
                  value={wardForm.name}
                  onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Ward Category *
                </label>
                <select
                  value={wardForm.ward_type}
                  onChange={(e) => setWardForm({ ...wardForm, ward_type: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="general">General Ward</option>
                  <option value="icu">ICU (Intensive Care Unit)</option>
                  <option value="private">Private Room</option>
                  <option value="semi">Semi-Private Room</option>
                  <option value="emergency">Emergency Ward</option>
                  <option value="pediatric">Pediatric Ward</option>
                  <option value="maternity">Maternity Ward</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase">
                    Floor Number
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wardForm.floor_number}
                    onChange={(e) => setWardForm({ ...wardForm, floor_number: e.target.value })}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase">
                    Total Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={wardForm.total_beds}
                    onChange={(e) => setWardForm({ ...wardForm, total_beds: e.target.value })}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddWardModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
                >
                  Save Ward
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add Bed ── */}
      {showAddBedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>🛏️</span> Add Bed(s) to Ward
              </h3>
              <button
                onClick={() => setShowAddBedModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBed} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Target Ward *
                </label>
                <select
                  required
                  value={bedForm.ward}
                  onChange={(e) => setBedForm({ ...bedForm, ward: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Choose Ward --</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({WARD_TYPE_LABELS[w.ward_type] || w.ward_type}) - Floor {w.floor_number}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode Toggle: Single or Batch */}
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl">
                <input
                  type="checkbox"
                  id="batch_mode"
                  checked={bedForm.is_batch}
                  onChange={(e) => setBedForm({ ...bedForm, is_batch: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="batch_mode" className="text-xs font-semibold text-blue-900 cursor-pointer">
                  Batch Add multiple beds automatically (e.g. B-101 to B-105)
                </label>
              </div>

              {bedForm.is_batch ? (
                <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <label className="block text-2xs font-bold text-gray-600 uppercase">
                      Prefix
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. GEN-"
                      value={bedForm.batch_prefix}
                      onChange={(e) => setBedForm({ ...bedForm, batch_prefix: e.target.value })}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold text-gray-600 uppercase">
                      Start #
                    </label>
                    <input
                      type="number"
                      value={bedForm.batch_start}
                      onChange={(e) => setBedForm({ ...bedForm, batch_start: e.target.value })}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold text-gray-600 uppercase">
                      Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={bedForm.batch_count}
                      onChange={(e) => setBedForm({ ...bedForm, batch_count: e.target.value })}
                      className="mt-1 w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase">
                    Bed Identifier / Number *
                  </label>
                  <input
                    type="text"
                    required={!bedForm.is_batch}
                    placeholder="e.g. G-101, ICU-01, PVT-204"
                    value={bedForm.bed_number}
                    onChange={(e) => setBedForm({ ...bedForm, bed_number: e.target.value })}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>
              )}

              {/* Initial Status */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Initial Status
                </label>
                <select
                  value={bedForm.status}
                  onChange={(e) => setBedForm({ ...bedForm, status: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="available">Available (Green)</option>
                  <option value="occupied">Occupied (Red)</option>
                  <option value="cleaning">Cleaning (Yellow)</option>
                </select>
              </div>

              {/* Equipment Support */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                  Equipment Facilities
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_oxygen}
                      onChange={(e) => setBedForm({ ...bedForm, has_oxygen: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>💨 Oxygen Pipeline Support</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_ventilator}
                      onChange={(e) => setBedForm({ ...bedForm, has_ventilator: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>🫁 Ventilator Support (ICU standard)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_monitor}
                      onChange={(e) => setBedForm({ ...bedForm, has_monitor: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>📟 Cardiac & Vitals Monitor</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddBedModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
                >
                  Save Bed(s)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Bed Quick Action & Status Changer ── */}
      {selectedBedForAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-900">
                  Bed {selectedBedForAction.bed_number}
                </h3>
                <p className="text-xs text-gray-500">{selectedBedForAction.ward_name}</p>
              </div>
              <button
                onClick={() => setSelectedBedForAction(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Change Bed Status:
              </p>

              {/* Status Buttons */}
              <div className="grid grid-cols-1 gap-2">
                {/* Available -> GREEN */}
                <button
                  onClick={() => handleStatusChange(selectedBedForAction.id, 'available')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold border flex items-center justify-between transition ${
                    selectedBedForAction.status === 'available'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Mark Available (Free)
                  </span>
                  <span className="text-2xs font-semibold">GREEN</span>
                </button>

                {/* Occupied -> RED */}
                <button
                  onClick={() => handleStatusChange(selectedBedForAction.id, 'occupied')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold border flex items-center justify-between transition ${
                    selectedBedForAction.status === 'occupied'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                      : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Mark Occupied (Admitted)
                  </span>
                  <span className="text-2xs font-semibold">RED</span>
                </button>

                {/* Cleaning -> AMBER */}
                <button
                  onClick={() => handleStatusChange(selectedBedForAction.id, 'cleaning')}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold border flex items-center justify-between transition ${
                    selectedBedForAction.status === 'cleaning'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Mark Cleaning (Disinfection)
                  </span>
                  <span className="text-2xs font-semibold">YELLOW</span>
                </button>
              </div>

              {/* Equipment Info */}
              <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                <p>
                  <strong>Oxygen:</strong> {selectedBedForAction.has_oxygen ? '✅ Yes' : '❌ No'}
                </p>
                <p>
                  <strong>Ventilator:</strong>{' '}
                  {selectedBedForAction.has_ventilator ? '✅ Yes' : '❌ No'}
                </p>
                {selectedBedForAction.current_patient_name && (
                  <p className="text-rose-700 font-semibold">
                    <strong>Patient:</strong> {selectedBedForAction.current_patient_name}
                  </p>
                )}
              </div>

              {/* Cross-Module Actions if Bed Occupied */}
              {selectedBedForAction.status === 'occupied' && (
                <div className="pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const b = selectedBedForAction;
                        setSelectedBedForAction(null);
                        openBloodModalForInpatient(
                          b.current_patient_id,
                          b.current_patient_name,
                          b.current_patient_blood_group,
                          `${b.ward_name} (Bed ${b.bed_number})`
                        );
                      }}
                      className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition flex items-center justify-center gap-1"
                    >
                      <span>🩸</span>
                      <span>Request Blood</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const b = selectedBedForAction;
                        setSelectedBedForAction(null);
                        if (b.current_patient_id) {
                          openJourneyForPatient(b.current_patient_id);
                        } else {
                          alert('Patient record is not directly linked.');
                        }
                      }}
                      className="py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition flex items-center justify-center gap-1"
                    >
                      <span>📜</span>
                      <span>View Journey</span>
                    </button>
                  </div>

                  {selectedBedForAction.current_admission_id && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDischargePatient(
                          selectedBedForAction.current_admission_id,
                          selectedBedForAction.bed_number,
                          selectedBedForAction.current_patient_name
                        )
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                    >
                      <span>🚪</span>
                      <span>Discharge Patient & Free Bed</span>
                    </button>
                  )}
                  <p className="text-2xs text-gray-500 text-center">
                    Bed will automatically become Available (Green) upon discharge.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() =>
                  handleDeleteBed(selectedBedForAction.id, selectedBedForAction.bed_number)
                }
                className="text-xs text-red-600 hover:text-red-800 font-bold"
              >
                🗑️ Delete Bed
              </button>
              <button
                onClick={() => setSelectedBedForAction(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Cross-Module Modal: Admit Patient to Ward */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showAdmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-purple-50 text-purple-700 rounded-xl text-lg">🛏️</span>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Admit Patient to Ward</h3>
                  <p className="text-xs text-gray-500">Auto-assigns first available bed of chosen type</p>
                </div>
              </div>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAutoAdmitSubmit} className="mt-4 space-y-4">
              {/* Patient Source Toggle */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Select Patient Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const t = opdWaitingTokens?.[0];
                      setAdmitForm({
                        ...admitForm,
                        patient_source: 'opd',
                        token_id: t?.id || '',
                        patient_id: t?.patient || '',
                        diagnosis: t?.symptoms || admitForm.diagnosis,
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      admitForm.patient_source === 'opd'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    🎟️ Today's OPD Queue ({opdWaitingTokens.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = registeredPatients?.[0];
                      setAdmitForm({
                        ...admitForm,
                        patient_source: 'registered',
                        token_id: '',
                        patient_id: p?.id || '',
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      admitForm.patient_source === 'registered'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    👤 All Registered Patients ({registeredPatients.length})
                  </button>
                </div>
              </div>

              {/* Patient Selection Dropdown */}
              {admitForm.patient_source === 'opd' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase">
                    Select OPD Waiting Token *
                  </label>
                  {opdWaitingTokens.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs mt-1">
                      No active OPD waiting tokens today. Switch to "All Registered Patients" above.
                    </div>
                  ) : (
                    <select
                      value={admitForm.token_id}
                      onChange={(e) => {
                        const selTok = opdWaitingTokens.find((t) => t.id === Number(e.target.value));
                        setAdmitForm({
                          ...admitForm,
                          token_id: e.target.value,
                          patient_id: selTok?.patient || '',
                          diagnosis: selTok?.symptoms || admitForm.diagnosis,
                        });
                      }}
                      required
                      className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    >
                      {opdWaitingTokens.map((tok) => (
                        <option key={tok.id} value={tok.id}>
                          {tok.token_code} — {tok.patient_name || 'Patient'} ({tok.priority.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase">
                    Select Patient *
                  </label>
                  <select
                    value={admitForm.patient_id}
                    onChange={(e) => setAdmitForm({ ...admitForm, patient_id: e.target.value })}
                    required
                    className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    {registeredPatients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_id} — {p.user?.first_name} {p.user?.last_name || ''} ({p.blood_group})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Ward Type Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Target Ward Type *
                </label>
                <select
                  value={admitForm.ward_type}
                  onChange={(e) => setAdmitForm({ ...admitForm, ward_type: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white font-semibold"
                >
                  <option value="general">🏥 General Ward</option>
                  <option value="icu">🚨 Intensive Care Unit (ICU)</option>
                  <option value="private">⭐ Private Deluxe Room</option>
                  <option value="emergency">🚑 Emergency Casualty Ward</option>
                </select>
              </div>

              {/* Attending Doctor */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Attending Physician
                </label>
                <select
                  value={admitForm.attending_doctor_id}
                  onChange={(e) => setAdmitForm({ ...admitForm, attending_doctor_id: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">-- Assign Later / On-Duty Staff --</option>
                  {availableDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.name || doc.user?.username} ({doc.department_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Clinical Diagnosis / Admission Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  Admission Diagnosis / Clinical Reason
                </label>
                <textarea
                  rows="2"
                  value={admitForm.diagnosis}
                  onChange={(e) => setAdmitForm({ ...admitForm, diagnosis: e.target.value })}
                  placeholder="e.g. Inpatient Observation, Post-surgical Recovery, Acute Care"
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition"
                >
                  🛏️ Auto-Assign Bed & Admit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Cross-Module Modal: Quick Blood Request for Inpatient */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showBloodModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-50 text-rose-700 rounded-xl text-lg">🩸</span>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Request Blood for Inpatient</h3>
                  <p className="text-xs text-gray-500">Links directly to Blood Bank Module</p>
                </div>
              </div>
              <button
                onClick={() => setShowBloodModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBloodSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 uppercase">Patient Name</label>
                <input
                  type="text"
                  readOnly
                  value={bloodForm.patient_name}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase">Blood Group *</label>
                  <select
                    value={bloodForm.blood_group}
                    onChange={(e) => setBloodForm({ ...bloodForm, blood_group: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 font-bold text-red-600 bg-white"
                  >
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase">Units Required *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={bloodForm.units_required}
                    onChange={(e) => setBloodForm({ ...bloodForm, units_required: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase">Urgency *</label>
                  <select
                    value={bloodForm.priority}
                    onChange={(e) => setBloodForm({ ...bloodForm, priority: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 font-bold bg-white"
                  >
                    <option value="normal">Normal (Within 24h)</option>
                    <option value="urgent">Urgent (Within 4h)</option>
                    <option value="emergency">🚨 Emergency (Immediate)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase">Ward / Bed Location</label>
                  <input
                    type="text"
                    value={bloodForm.hospital_ward}
                    onChange={(e) => setBloodForm({ ...bloodForm, hospital_ward: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase">Clinical Purpose</label>
                <select
                  value={bloodForm.purpose}
                  onChange={(e) => setBloodForm({ ...bloodForm, purpose: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-300 bg-white"
                >
                  <option value="surgery">Surgical Procedure</option>
                  <option value="accident">Accident / Trauma / Emergency</option>
                  <option value="anemia">Severe Anemia</option>
                  <option value="thalassemia">Thalassemia</option>
                  <option value="maternity">Maternity / Delivery</option>
                  <option value="other">Other Medical Condition</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBloodModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
                >
                  🩸 Dispatch Blood Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Cross-Module Modal: Unified Patient Medical Journey */}
      {/* ───────────────────────────────────────────────────────────── */}
      <PatientJourneyModal
        isOpen={journeyModalOpen}
        onClose={() => setJourneyModalOpen(false)}
        patientId={journeyPatientId}
      />
    </div>
  );
};

export default BedManagementDashboard;
