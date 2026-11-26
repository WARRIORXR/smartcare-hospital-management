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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthorizedBedStaff = Boolean(
    isAuthenticated && user && ['admin', 'doctor', 'reception'].includes(user.role)
  );
  const isAdmin = user?.role === 'admin' || user?.is_staff;
  const isDoctor = user?.role === 'doctor';
  const isReception = user?.role === 'reception';
  const canAdmit = isAdmin || isDoctor || isReception;

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const actionRef = useRef(false);

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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const viewTab = location.pathname === '/beds/inpatients' ? 'admissions' : 'grid'; // 'grid' | 'admissions'

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
    if (!isAuthorizedBedStaff) return;
    fetchOverview();
  }, [isAuthorizedBedStaff, fetchOverview]);

  // Auto-refresh interval (every 5s live sync)
  useEffect(() => {
    if (!isAuthorizedBedStaff || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchOverview(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthorizedBedStaff, autoRefresh, fetchOverview]);

  // Auto-dismiss success notification
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Defensive Guard: Only Admin, Doctor, and Receptionist can manage beds
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthorizedBedStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  // Handle Quick Status Change
  const handleStatusChange = async (bedId, newStatus) => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      await bedService.updateBedStatus(bedId, newStatus);
      setSuccessMsg(`Bed status successfully updated to ${newStatus.toUpperCase()}`);
      // Refresh overview silently
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to update bed status:', err);
      alert('Failed to update bed status: ' + (err.response?.data?.error || err.message));
    } finally {
      actionRef.current = false;
    }
  };

  // Handle Delete Bed
  const handleDeleteBed = async (bedId, bedNumber) => {
    if (!window.confirm(`Are you sure you want to remove Bed ${bedNumber}?`)) return;
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      await bedService.deleteBed(bedId);
      setSuccessMsg(`Bed ${bedNumber} removed successfully.`);
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to delete bed:', err);
      alert('Failed to delete bed: ' + (err.response?.data?.error || err.message));
    } finally {
      actionRef.current = false;
    }
  };

  // Handle Discharge Inpatient (Bed becomes Available again)
  const handleDischargePatient = async (admissionId, bedNumber, patientName = 'Patient') => {
    const notes = prompt(`Enter discharge summary notes for ${patientName}:`, 'Patient recovered and discharged.');
    if (notes === null) return; // user cancelled
    if (actionRef.current) return;
    actionRef.current = true;

    try {
      await bedService.dischargePatient(admissionId, notes);
      setSuccessMsg(`Patient ${patientName} discharged. Bed ${bedNumber} is now Available again!`);
      fetchOverview(true);
      setSelectedBedForAction(null);
    } catch (err) {
      console.error('Failed to discharge patient:', err);
      alert('Failed to discharge patient: ' + (err.response?.data?.error || err.message));
    } finally {
      actionRef.current = false;
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
    if (actionRef.current) return;
    actionRef.current = true;
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
    } finally {
      actionRef.current = false;
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
    <div className="bg-white">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Banner Alert if any */}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-clinical-success text-xs font-semibold flex items-center justify-between">
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} className="text-clinical-success hover:opacity-75 font-bold cursor-pointer">
              ×
            </button>
          </div>
        )}

        {/* Editorial Header & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-hairline">
          <div className="space-y-1.5">
            <span className="editorial-eyebrow">Inpatient Care · Real-Time Bed Grid (5s Sync)</span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
              Ward &amp; Bed Management
            </h1>
            <p className="text-xs sm:text-sm text-muted">
              Monitor live bed availability, admit OPD patients cleanly, coordinate ward care, and discharge directly to billing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              onClick={() => fetchOverview(true)}
              disabled={refreshing}
              className="editorial-btn-secondary"
              title="Refresh now"
            >
              Refresh
            </button>

            {canAdmit && (
              <button
                type="button"
                onClick={openAdmitModal}
                className="editorial-btn-primary"
                title="Admit an OPD waiting patient or registered patient"
              >
                + Admit Patient
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddWardModal(true)}
                  className="editorial-btn-secondary"
                >
                  + Add Ward
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBedModal(true)}
                  className="editorial-btn-secondary"
                >
                  + Add Bed
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="editorial-card p-5">
            <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Total Beds</span>
            <p className="font-display text-3xl font-bold text-ink mt-1.5">{summary.total_beds}</p>
            <p className="text-xs text-muted mt-1">{wards.length} Wards Active</p>
          </div>

          <div className="editorial-card p-5 border-emerald-200 bg-emerald-50/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold text-clinical-success uppercase tracking-wider">Available</span>
              <span className="w-2 h-2 rounded-full bg-clinical-success animate-pulse" />
            </div>
            <p className="font-display text-3xl font-bold text-clinical-success mt-1.5">{summary.available_beds}</p>
            <p className="text-xs text-clinical-success mt-1 font-medium">
              Ready for admission
            </p>
          </div>

          <div className="editorial-card p-5 border-rose-200 bg-rose-50/40">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold text-clinical-danger uppercase tracking-wider">Occupied</span>
              <span className="w-2 h-2 rounded-full bg-clinical-danger" />
            </div>
            <p className="font-display text-3xl font-bold text-clinical-danger mt-1.5">{summary.occupied_beds}</p>
            <p className="text-xs text-clinical-danger mt-1 font-medium">
              Admitted inpatients
            </p>
          </div>

          <div className="editorial-card p-5 border-amber-200 bg-amber-50/40">
            <span className="font-mono text-[10px] font-semibold text-clinical-warning uppercase tracking-wider">Cleaning</span>
            <p className="font-display text-3xl font-bold text-clinical-warning mt-1.5">{summary.cleaning_beds}</p>
            <p className="text-xs text-clinical-warning mt-1 font-medium">
              Undergoing sanitization
            </p>
          </div>

          <div className="editorial-card p-5 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">Occupancy Rate</span>
              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-cobalt-tint text-cobalt">LIVE</span>
            </div>
            <p className="font-display text-3xl font-bold text-ink mt-1.5">{summary.occupancy_rate}%</p>
            <div className="w-full bg-surface border border-hairline rounded-full h-1.5 mt-2.5 overflow-hidden">
              <div
                className="bg-cobalt h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(summary.occupancy_rate, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main View Selector Tabs */}
        <div className="flex items-center gap-2 border-b border-hairline pb-3">
          <button
            type="button"
            onClick={() => navigate('/beds')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              viewTab === 'grid'
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-white text-muted border-hairline hover:text-ink hover:bg-surface'
            }`}
          >
            Live Ward &amp; Bed Grid
          </button>

          <button
            type="button"
            onClick={() => navigate('/beds/inpatients')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              viewTab === 'admissions'
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-white text-muted border-hairline hover:text-ink hover:bg-surface'
            }`}
          >
            Active Inpatients ({activeAdmissions.length})
          </button>
        </div>

        {viewTab === 'admissions' ? (
          <div className="editorial-card overflow-hidden">
            <div className="px-6 py-4 bg-surface border-b border-hairline flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-ink">Current Inpatient Admissions</h2>
                <p className="text-xs text-muted">
                  Patients currently occupying hospital beds. Discharging releases the bed immediately.
                </p>
              </div>
              <span className="font-mono px-3 py-1 rounded-lg bg-cobalt-tint text-cobalt text-xs font-semibold border border-cobalt/20">
                {activeAdmissions.length} Admitted
              </span>
            </div>

            {activeAdmissions.length === 0 ? (
              <div className="p-12 text-center text-muted">
                <p className="font-display font-bold text-sm text-ink">No Patients Currently Admitted</p>
                <p className="text-xs mt-1">All hospital beds are currently available or being sanitized.</p>
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
                              type="button"
                              onClick={() => openBloodModalForInpatient(adm.patient_id || adm.patient, adm.patient_name, adm.patient_blood_group, `${adm.ward_name} (Bed ${adm.bed_number})`)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-clinical-danger bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                              title="Request blood for this inpatient"
                            >
                              Blood
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/patient/journey/${adm.patient_id || adm.patient}`)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cobalt bg-cobalt-tint hover:bg-blue-100 border border-cobalt/20 transition cursor-pointer"
                              title="View complete medical timeline"
                            >
                              Journey
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/billing/new?patient=${adm.patient_id || adm.patient}`)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-clinical-success bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer"
                              title="Generate inpatient ward bill"
                            >
                              Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDischargePatient(adm.id, adm.bed_number, adm.patient_name)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink bg-surface hover:bg-slate-200 border border-hairline transition cursor-pointer"
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
            {/* Filter Controls */}
            <div className="editorial-surface p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Ward Type Tabs */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'all', label: 'All Wards' },
                    { id: 'general', label: 'General Ward' },
                    { id: 'icu', label: 'ICU' },
                    { id: 'private', label: 'Private Room' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedType(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        selectedType === tab.id
                          ? 'bg-cobalt text-white border-cobalt'
                          : 'bg-white text-muted border-hairline hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Status Filter & Search */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex items-center gap-1 bg-white p-1 rounded-lg border border-hairline text-xs">
                    {[
                      { id: 'all', label: 'All', cls: 'bg-ink text-white' },
                      { id: 'available', label: 'Available', cls: 'bg-clinical-success text-white' },
                      { id: 'occupied', label: 'Occupied', cls: 'bg-clinical-danger text-white' },
                      { id: 'cleaning', label: 'Cleaning', cls: 'bg-clinical-warning text-white' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStatus(s.id)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                          selectedStatus === s.id ? s.cls : 'text-muted hover:text-ink'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Search ward or bed #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="editorial-input py-1.5 px-3 text-xs w-48 sm:w-56"
                  />
                </div>
              </div>
            </div>

            {/* Color & Equipment Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-2 py-1 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Status:</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-clinical-success">
                  <span className="w-2.5 h-2.5 rounded-full bg-clinical-success" />
                  Available
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-clinical-danger">
                  <span className="w-2.5 h-2.5 rounded-full bg-clinical-danger" />
                  Occupied
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-clinical-warning">
                  <span className="w-2.5 h-2.5 rounded-full bg-clinical-warning" />
                  Cleaning
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
                <span className="px-2 py-0.5 rounded bg-surface border border-hairline">O2 Oxygen</span>
                <span className="px-2 py-0.5 rounded bg-surface border border-hairline">VENT Ventilator</span>
                <span className="px-2 py-0.5 rounded bg-surface border border-hairline">MON Monitor</span>
                {isAdmin && <span className="text-cobalt font-semibold ml-1">Click any bed to edit status</span>}
              </div>
            </div>

            {/* Live Bed Grid by Ward */}
            {loading ? (
              <div className="py-20 text-center">
                <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-cobalt mx-auto"></div>
                <p className="mt-4 text-xs text-muted font-medium">Loading live bed occupancy...</p>
              </div>
            ) : error ? (
              <div className="p-8 bg-rose-50 border border-rose-200 rounded-xl text-center text-clinical-danger">
                <p className="font-semibold text-sm">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchOverview()}
                  className="mt-3 px-4 py-2 bg-clinical-danger text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : filteredWards.length === 0 ? (
              <div className="editorial-card p-12 text-center space-y-3">
                <h3 className="font-display text-base font-bold text-ink">No Wards or Beds Found</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  {isAdmin
                    ? 'Create hospital wards (General, ICU, Private) and add beds to track occupancy.'
                    : 'No bed records match your active filter criteria.'}
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddWardModal(true)}
                    className="editorial-btn-primary"
                  >
                    + Create First Ward
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {filteredWards.map((ward) => {
                  const beds = ward.filteredBeds || [];
                  return (
                    <div
                      key={ward.id}
                      className="editorial-card overflow-hidden"
                    >
                      {/* Ward Header */}
                      <div className="px-6 py-4 bg-surface border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className="font-display text-base font-bold text-ink">{ward.name}</h2>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded font-semibold bg-white border border-hairline text-muted uppercase">
                              {WARD_TYPE_LABELS[ward.ward_type] || ward.ward_type}
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-muted mt-0.5">
                            Floor {ward.floor_number} · Capacity {ward.total_beds} Beds
                          </p>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-clinical-success font-semibold border border-emerald-200">
                            {ward.available_beds_count} Free
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-rose-50 text-clinical-danger font-semibold border border-rose-200">
                            {ward.occupied_beds_count} Occupied
                          </span>
                          {ward.cleaning_beds_count > 0 && (
                            <span className="px-2.5 py-1 rounded-md bg-amber-50 text-clinical-warning font-semibold border border-amber-200">
                              {ward.cleaning_beds_count} Cleaning
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ward Beds Grid */}
                      <div className="p-6">
                        {beds.length === 0 ? (
                          <div className="text-center py-6 text-muted text-xs">
                            No beds match active filters in this ward.
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBedForm((prev) => ({ ...prev, ward: ward.id }));
                                  setShowAddBedModal(true);
                                }}
                                className="block mx-auto mt-2 text-cobalt font-semibold hover:underline cursor-pointer"
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
                                  className={`p-3.5 rounded-xl border transition-all relative flex flex-col justify-between cursor-pointer group ${badge.tileBg}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono font-bold text-ink text-sm">
                                      {bed.bed_number}
                                    </span>
                                    <span
                                      className={`w-2 h-2 rounded-full ${badge.indicator} ${
                                        bed.status === 'available' ? 'animate-pulse' : ''
                                      }`}
                                      title={badge.label}
                                    />
                                  </div>

                                  <div className="my-2.5 space-y-1.5">
                                    {bed.status === 'occupied' && (
                                      <div className="text-[11px] font-semibold text-red-900 truncate">
                                        {bed.current_patient_name || 'Patient Admitted'}
                                      </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-1 font-mono text-[9px] font-bold">
                                      {bed.has_oxygen && (
                                        <span className="px-1.5 py-0.5 rounded bg-white/80 border border-hairline text-ink">O2</span>
                                      )}
                                      {bed.has_ventilator && (
                                        <span className="px-1.5 py-0.5 rounded bg-white/80 border border-hairline text-clinical-danger">VENT</span>
                                      )}
                                      {bed.has_monitor && (
                                        <span className="px-1.5 py-0.5 rounded bg-white/80 border border-hairline text-cobalt">MON</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-1 flex items-center justify-between">
                                    <span
                                      className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${badge.pill}`}
                                    >
                                      {badge.label}
                                    </span>
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
  </div>

      {/* ── Modal: Add Ward ── */}
      {showAddWardModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Ward Configuration</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Add Hospital Ward
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddWardModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateWard} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Ward Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Ward A, ICU-1, Deluxe Private"
                  value={wardForm.name}
                  onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })}
                  className="editorial-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Ward Category *
                </label>
                <select
                  value={wardForm.ward_type}
                  onChange={(e) => setWardForm({ ...wardForm, ward_type: e.target.value })}
                  className="editorial-input"
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
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Floor Number
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={wardForm.floor_number}
                    onChange={(e) => setWardForm({ ...wardForm, floor_number: e.target.value })}
                    className="editorial-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Total Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={wardForm.total_beds}
                    onChange={(e) => setWardForm({ ...wardForm, total_beds: e.target.value })}
                    className="editorial-input font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowAddWardModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="editorial-btn-primary px-5"
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
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Capacity Setup</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Add Bed(s) to Ward
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBedModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateBed} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Target Ward *
                </label>
                <select
                  required
                  value={bedForm.ward}
                  onChange={(e) => setBedForm({ ...bedForm, ward: e.target.value })}
                  className="editorial-input"
                >
                  <option value="">-- Choose Ward --</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({WARD_TYPE_LABELS[w.ward_type] || w.ward_type}) - Floor {w.floor_number}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2.5 p-3 bg-surface border border-hairline rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  id="batch_mode"
                  checked={bedForm.is_batch}
                  onChange={(e) => setBedForm({ ...bedForm, is_batch: e.target.checked })}
                  className="rounded text-cobalt w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-ink">
                  Batch add multiple beds (e.g. G-101 to G-105)
                </span>
              </label>

              {bedForm.is_batch ? (
                <div className="grid grid-cols-3 gap-2 p-3 bg-surface rounded-xl border border-hairline">
                  <div>
                    <label className="block font-mono text-[10px] font-semibold text-muted uppercase">
                      Prefix
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. G-"
                      value={bedForm.batch_prefix}
                      onChange={(e) => setBedForm({ ...bedForm, batch_prefix: e.target.value })}
                      className="editorial-input mt-1 py-1.5 px-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] font-semibold text-muted uppercase">
                      Start #
                    </label>
                    <input
                      type="number"
                      value={bedForm.batch_start}
                      onChange={(e) => setBedForm({ ...bedForm, batch_start: e.target.value })}
                      className="editorial-input mt-1 py-1.5 px-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] font-semibold text-muted uppercase">
                      Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={bedForm.batch_count}
                      onChange={(e) => setBedForm({ ...bedForm, batch_count: e.target.value })}
                      className="editorial-input mt-1 py-1.5 px-2 text-xs font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Bed Identifier / Number *
                  </label>
                  <input
                    type="text"
                    required={!bedForm.is_batch}
                    placeholder="e.g. G-101, ICU-01, PVT-204"
                    value={bedForm.bed_number}
                    onChange={(e) => setBedForm({ ...bedForm, bed_number: e.target.value })}
                    className="editorial-input font-mono uppercase"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Initial Status
                </label>
                <select
                  value={bedForm.status}
                  onChange={(e) => setBedForm({ ...bedForm, status: e.target.value })}
                  className="editorial-input"
                >
                  <option value="available">Available (Green)</option>
                  <option value="occupied">Occupied (Red)</option>
                  <option value="cleaning">Cleaning (Amber)</option>
                </select>
              </div>

              <div className="pt-1 space-y-2">
                <span className="block font-mono text-[10px] font-semibold text-muted uppercase">
                  Equipment Facilities
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink p-2 rounded-lg border border-hairline cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_oxygen}
                      onChange={(e) => setBedForm({ ...bedForm, has_oxygen: e.target.checked })}
                      className="rounded text-cobalt w-3.5 h-3.5"
                    />
                    <span className="font-mono text-[11px] font-semibold">O2</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-ink p-2 rounded-lg border border-hairline cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_ventilator}
                      onChange={(e) => setBedForm({ ...bedForm, has_ventilator: e.target.checked })}
                      className="rounded text-cobalt w-3.5 h-3.5"
                    />
                    <span className="font-mono text-[11px] font-semibold">VENT</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-ink p-2 rounded-lg border border-hairline cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bedForm.has_monitor}
                      onChange={(e) => setBedForm({ ...bedForm, has_monitor: e.target.checked })}
                      className="rounded text-cobalt w-3.5 h-3.5"
                    />
                    <span className="font-mono text-[11px] font-semibold">MON</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowAddBedModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="editorial-btn-primary px-5"
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
