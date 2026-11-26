/**
 * src/pages/doctor/DoctorDashboard.jsx
 * ------------------------------------
 * Interactive Unified Consultation Dashboard for Doctors.
 *
 * Connects all 5 hospital modules in one seamless workflow:
 *  - Module 1: OPD Consultation & Live 5s Token Queue + Duty / Leave Controls
 *  - Module 2: Inpatient Bed Admission (Auto-Assigns Bed) & Discharge
 *  - Module 3: Blood Bank Unit Request & Donor Matching
 *  - Module 4: Prescriptions, Visit Notes & Lab Records Shortcut
 *  - Unified Patient Journey Timeline Modal (Modules 1-5)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import opdService from '../../services/opdService';
import bedService from '../../services/bedService';
import bloodBankService from '../../services/bloodBankService';
import hospitalService from '../../services/hospitalService';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';

const DoctorDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Queue Data
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const actionRef = useRef(false);
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [activeTab, setActiveTab] = useState('waiting'); // 'waiting' | 'completed' | 'skipped' | 'admitted'

  // Availability & Leaves State
  const [leaves, setLeaves] = useState([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: '',
  });

  // Admitted Inpatients Data & Bed Overview
  const [admittedList, setAdmittedList] = useState([]);
  const [bedOverview, setBedOverview] = useState(null);
  const [liveStock, setLiveStock] = useState({});

  // 1. Admit Modal State
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [patientToAdmit, setPatientToAdmit] = useState(null);
  const [admitForm, setAdmitForm] = useState({
    ward_type: 'general',
    diagnosis: '',
  });

  // 2. Discharge Modal State
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [admissionToDischarge, setAdmissionToDischarge] = useState(null);
  const [dischargeNotes, setDischargeNotes] = useState('');

  // 3. Blood Request Modal State (Connected to Patient ID)
  const [showBloodModal, setShowBloodModal] = useState(false);
  const [patientForBlood, setPatientForBlood] = useState(null);
  const [bloodModalLoading, setBloodModalLoading] = useState(false);
  const [bloodModalResult, setBloodModalResult] = useState(null);
  const [bloodForm, setBloodForm] = useState({
    blood_group: 'O+',
    units_required: 1,
    priority: 'normal', // 'normal' | 'urgent' | 'emergency'
    hospital_ward: 'General Ward',
    purpose: 'surgery',
    notes: '',
  });

  // 4. Unified Patient Journey Modal State (Modules 1-5)
  const [journeyPatientId, setJourneyPatientId] = useState(null);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 5000);
  };

  // Load Queue, Active Admissions, Live Blood Stock, and Leaves
  const loadQueue = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await opdService.getDoctorQueue();
      setQueueData(data);
    } catch (err) {
      console.error('Failed to load doctor queue', err);
      if (!silent) showAlert('error', 'Could not load today’s OPD queue.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadHospitalData = useCallback(async () => {
    try {
      const [admissionsData, overviewData, stockData, leavesData] = await Promise.all([
        bedService.getActiveAdmissions({ my_patients: true }),
        bedService.getOverview().catch(() => null),
        bloodBankService.getLiveStock().catch(() => null),
        hospitalService.getLeaves().catch(() => []),
      ]);

      setAdmittedList(admissionsData || []);
      setBedOverview(overviewData);
      setLeaves(Array.isArray(leavesData) ? leavesData : leavesData?.results || []);

      if (stockData?.stock) {
        const stockMap = {};
        stockData.stock.forEach((s) => {
          stockMap[s.blood_group] = s.units_available;
        });
        setLiveStock(stockMap);
      }
    } catch (err) {
      console.error('Failed to load hospital bed/blood data', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'doctor') return;
    loadQueue();
    loadHospitalData();

    // Auto-refresh live queue and hospital state every 5 seconds
    const interval = setInterval(() => {
      loadQueue(true);
      loadHospitalData();
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user, loadQueue, loadHospitalData]);

  // Defensive Guard: Only Doctors can access Doctor Queue Dashboard
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isAuthenticated || !user || user.role !== 'doctor') {
    return <Navigate to="/dashboard" replace />;
  }

  // Duty Status & Leave Handlers
  const handleToggleAvailability = async () => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setTogglingDuty(true);
      const nextStatus = !(queueData?.doctor?.is_available ?? true);
      const res = await hospitalService.toggleDoctorAvailability({ is_available: nextStatus });
      showAlert('success', res.message || `Duty status updated to ${nextStatus ? 'On Duty' : 'Off Duty'}.`);
      await loadQueue(true);
    } catch (err) {
      showAlert('error', err.response?.data?.detail || 'Could not toggle availability status.');
    } finally {
      setTogglingDuty(false);
      actionRef.current = false;
    }
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setActionLoading(true);
      await hospitalService.createLeave(leaveForm);
      showAlert('success', `Leave scheduled (${leaveForm.start_date} to ${leaveForm.end_date}).`);
      setLeaveForm({
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        reason: '',
      });
      await loadHospitalData();
    } catch (err) {
      showAlert('error', err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Failed to schedule leave.');
    } finally {
      setActionLoading(false);
      actionRef.current = false;
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    try {
      await hospitalService.deleteLeave(leaveId);
      showAlert('success', 'Leave cancelled.');
      await loadHospitalData();
    } catch (err) {
      showAlert('error', err.response?.data?.detail || 'Failed to cancel leave.');
    }
  };

  // ─── ACTION HANDLERS ───

  // Call Next Patient
  const handleCallNext = async (tokenId = null) => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setActionLoading(true);
      const res = await opdService.callNextPatient(tokenId);
      showAlert('success', res.message || 'Next patient called into room!');
      await loadQueue(true);
    } catch (err) {
      console.error(err);
      showAlert('error', err.response?.data?.detail || 'Failed to call next patient.');
    } finally {
      setActionLoading(false);
      actionRef.current = false;
    }
  };

  // Mark Consultation Complete
  const handleComplete = async (tokenId = null) => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setActionLoading(true);
      const res = await opdService.completeConsultation(tokenId);
      showAlert('success', res.message || 'Consultation completed.');
      await loadQueue(true);
    } catch (err) {
      console.error(err);
      showAlert('error', err.response?.data?.detail || 'Failed to complete visit.');
    } finally {
      setActionLoading(false);
      actionRef.current = false;
    }
  };

  // Skip Patient
  const handleSkip = async (tokenId = null) => {
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setActionLoading(true);
      const res = await opdService.skipPatient(tokenId);
      showAlert('success', res.message || 'Patient skipped.');
      await loadQueue(true);
    } catch (err) {
      console.error(err);
      showAlert('error', err.response?.data?.detail || 'Failed to skip patient.');
    } finally {
      setActionLoading(false);
      actionRef.current = false;
    }
  };

  // ─── 1. ADMIT PATIENT (BED MODULE) ───
  const handleOpenAdmitModal = (token) => {
    setPatientToAdmit(token);
    setAdmitForm({
      ward_type: 'general',
      diagnosis: token?.symptoms ? `Admitted for observation: ${token.symptoms}` : '',
    });
    setShowAdmitModal(true);
  };

  const handleConfirmAutoAdmit = async (e) => {
    e.preventDefault();
    if (!admitForm.diagnosis.trim()) {
      alert('Please enter a clinical diagnosis or reason for admission.');
      return;
    }

    try {
      setActionLoading(true);
      const payload = {
        token_id: patientToAdmit.id,
        patient_id: patientToAdmit.patient || patientToAdmit.patient_id,
        ward_type: admitForm.ward_type,
        diagnosis: admitForm.diagnosis,
      };

      const res = await bedService.autoAdmitPatient(payload);
      showAlert('success', `🎉 ${res.message || 'Patient admitted successfully!'}`);

      setShowAdmitModal(false);
      setPatientToAdmit(null);
      await loadQueue(true);
      await loadHospitalData();
    } catch (err) {
      console.error('Failed to auto-admit patient:', err);
      showAlert(
        'error',
        err.response?.data?.error || 'Failed to admit patient. No available bed found.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ─── 2. DISCHARGE PATIENT (BED MODULE) ───
  const handleOpenDischargeModal = (admission) => {
    setAdmissionToDischarge(admission);
    setDischargeNotes('Patient recovered and cleared for discharge.');
    setShowDischargeModal(true);
  };

  const handleConfirmDischarge = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const res = await bedService.dischargePatient(admissionToDischarge.id, dischargeNotes);

      showAlert('success', `✅ ${res.message || 'Patient discharged. Bed is now Available again!'}`);

      setShowDischargeModal(false);
      setAdmissionToDischarge(null);
      await loadHospitalData();
      await loadQueue(true);
    } catch (err) {
      console.error('Failed to discharge patient:', err);
      showAlert('error', err.response?.data?.error || 'Failed to process patient discharge.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── 3. REQUEST BLOOD (BLOOD BANK MODULE LINKED BY PATIENT ID) ───
  const handleOpenBloodModal = (patientOrToken) => {
    setPatientForBlood(patientOrToken);
    setBloodModalResult(null);

    // Resolve patient blood group if present
    const group = patientOrToken?.patient_blood_group || patientOrToken?.blood_group || 'O+';

    // Auto-fill ward location if patient is already admitted
    const activeAdm = admittedList.find(
      (a) =>
        a.patient === patientOrToken.patient ||
        a.patient === patientOrToken.id ||
        a.patient_code === patientOrToken.patient_code
    );

    const defaultWard = activeAdm
      ? `${activeAdm.ward_name} (Bed ${activeAdm.bed_number})`
      : queueData?.doctor?.room_number
      ? `OPD ${queueData.doctor.room_number}`
      : 'General Ward';

    setBloodForm({
      blood_group: group,
      units_required: 1,
      priority: 'urgent',
      hospital_ward: defaultWard,
      purpose: 'surgery',
      notes: patientOrToken?.symptoms ? `For patient with: ${patientOrToken.symptoms}` : '',
    });

    setShowBloodModal(true);
  };

  const handleConfirmBloodRequest = async (e) => {
    e.preventDefault();
    try {
      setBloodModalLoading(true);
      setBloodModalResult(null);

      const patientId =
        patientForBlood.patient ||
        patientForBlood.patient_id ||
        (typeof patientForBlood.id === 'number' && !patientForBlood.token_code
          ? patientForBlood.id
          : null);

      const payload = {
        patient_id: patientId,
        patient_name: patientForBlood.patient_name || patientForBlood.name,
        hospital_ward: bloodForm.hospital_ward,
        blood_group: bloodForm.blood_group,
        units_required: parseInt(bloodForm.units_required, 10),
        priority: bloodForm.priority,
        purpose: bloodForm.purpose,
        notes: bloodForm.notes,
        required_by_date: new Date().toISOString().split('T')[0],
      };

      const res = await bloodBankService.createRequest(payload);
      setBloodModalResult(res);

      showAlert('success', res.message || 'Blood unit request submitted successfully!');
      await loadHospitalData();
    } catch (err) {
      console.error('Failed to submit blood request:', err);
      showAlert('error', err.response?.data?.error || 'Failed to submit blood request.');
    } finally {
      setBloodModalLoading(false);
    }
  };

  // ─── 4. UNIFIED PATIENT JOURNEY TIMELINE (LINKED VIA PATIENT ID) ───
  const handleOpenJourneyModal = (patientId) => {
    if (!patientId) {
      showAlert('error', 'Patient ID not available for this record.');
      return;
    }
    setJourneyPatientId(patientId);
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 animate-pulse">
            🚨 EMERGENCY
          </span>
        );
      case 'senior_citizen':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            👴 Senior Citizen
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
            Normal
          </span>
        );
    }
  };

  const currentPatient = queueData?.current_patient;
  const waitingList = queueData?.waiting_list || [];
  const completedList = queueData?.completed_list || [];
  const skippedList = queueData?.skipped_list || [];
  const stats = queueData?.stats || {};

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Alert Notification */}
      {alert.message && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center justify-between text-xs font-semibold border transition-all ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-clinical-success border-emerald-200'
              : 'bg-rose-50 text-clinical-danger border-rose-200'
          }`}
        >
          <span>{alert.message}</span>
          <button
            onClick={() => setAlert({ type: '', message: '' })}
            className="font-mono text-[11px] font-bold uppercase tracking-wider ml-4 hover:opacity-75 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Editorial Header Strip */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 mb-8 border-b border-hairline">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="editorial-eyebrow">{t('doctorPortal')}</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-clinical-success border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-clinical-success animate-pulse" />
              {t('liveQueueActive')}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                queueData?.doctor?.is_available ?? true
                  ? 'bg-cobalt-tint text-cobalt border-cobalt/20'
                  : 'bg-rose-50 text-clinical-danger border-rose-200'
              }`}
            >
              {(queueData?.doctor?.is_available ?? true) ? '● On Duty' : '● Off Duty'}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Dr. {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            {queueData?.doctor?.department_name || 'General OPD'} · Room{' '}
            <span className="font-mono font-semibold text-ink">{queueData?.doctor?.room_number || 'OPD-1'}</span> · Avg Visit{' '}
            <span className="font-mono font-semibold text-ink">{queueData?.doctor?.avg_consult_minutes || 10}m</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleAvailability}
            disabled={togglingDuty}
            className={`editorial-btn-secondary ${
              queueData?.doctor?.is_available ?? true
                ? 'border-emerald-200 text-clinical-success bg-emerald-50/50 hover:bg-emerald-50'
                : 'border-rose-200 text-clinical-danger bg-rose-50/50 hover:bg-rose-50'
            }`}
          >
            {togglingDuty
              ? 'Updating...'
              : (queueData?.doctor?.is_available ?? true)
              ? 'On Duty (Switch Off)'
              : 'Off Duty (Go On Duty)'}
          </button>
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="editorial-btn-secondary"
          >
            Leave ({leaves.length})
          </button>
          <button
            type="button"
            onClick={() => navigate('/records/new')}
            className="editorial-btn-primary"
          >
            + Clinical Rx / Notes
          </button>
          <button
            type="button"
            onClick={() => {
              loadQueue();
              loadHospitalData();
            }}
            disabled={actionLoading}
            className="editorial-btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ─── CURRENTLY CALLED PATIENT HERO CONSOLE ─── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[11px] font-semibold text-muted uppercase tracking-wider">
            Now in Clinic Room
          </h2>
          {currentPatient && (
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-cobalt text-white">
              ACTIVE CONSULTATION
            </span>
          )}
        </div>

        {currentPatient ? (
          <div className="editorial-card border-cobalt/30 bg-gradient-to-br from-white to-cobalt-tint/25 p-6 sm:p-7">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-cobalt text-white font-mono font-bold text-base rounded-lg">
                    {currentPatient.token_code}
                  </span>
                  {getPriorityBadge(currentPatient.priority)}
                </div>

                <h3 className="font-display text-2xl sm:text-3xl font-bold text-ink">
                  {currentPatient.patient_name}
                </h3>

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
                  <span>
                    Patient ID:{' '}
                    <strong className="text-ink font-mono font-semibold">
                      {currentPatient.patient_code || `PAT-${currentPatient.patient || 1}`}
                    </strong>
                  </span>
                  <span>
                    Blood Group:{' '}
                    <strong className="text-clinical-danger font-mono font-bold">
                      {currentPatient.patient_blood_group || 'N/A'}
                    </strong>
                  </span>
                  <span>
                    Gender:{' '}
                    <strong className="text-ink">
                      {currentPatient.patient_gender === 'M'
                        ? 'Male'
                        : currentPatient.patient_gender === 'F'
                        ? 'Female'
                        : 'Other'}
                    </strong>
                  </span>
                  <span>
                    Mobile: <strong className="text-ink font-mono">{currentPatient.patient_phone || 'N/A'}</strong>
                  </span>
                </div>

                {currentPatient.symptoms && (
                  <div className="p-3.5 bg-surface rounded-xl border border-hairline text-xs text-ink">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1">
                      Chief Complaint / Clinical Symptoms
                    </span>
                    “{currentPatient.symptoms}”
                  </div>
                )}
              </div>

              {/* ── Connected Clinical Actions ── */}
              <div className="flex flex-col gap-2 w-full lg:w-72 shrink-0">
                <button
                  onClick={() => handleComplete()}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-clinical-success hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
                >
                  Complete Consultation
                </button>

                <button
                  onClick={() => handleOpenAdmitModal(currentPatient)}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-cobalt hover:bg-cobalt-hover transition disabled:opacity-50 cursor-pointer"
                >
                  Admit Patient (Ward Bed)
                </button>

                <button
                  onClick={() => handleOpenBloodModal(currentPatient)}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-clinical-danger hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
                >
                  Request Blood (Blood Bank)
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate(`/patient/journey/${currentPatient.patient}`)}
                    disabled={actionLoading || !currentPatient.patient}
                    className="editorial-btn-secondary py-2 px-2 text-[11px]"
                  >
                    Care Timeline
                  </button>
                  <button
                    onClick={() => navigate(`/records/new?patient=${currentPatient.patient}`)}
                    className="editorial-btn-secondary py-2 px-2 text-[11px]"
                  >
                    + Rx / Lab
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/billing/new?patient=${currentPatient.patient}&token=${currentPatient.id}`)}
                  className="editorial-btn-secondary py-2 px-3 text-[11px] border-cobalt/20 text-cobalt bg-cobalt-tint/30 hover:bg-cobalt-tint/60"
                >
                  Generate OPD Invoice →
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-hairline">
                  <button
                    onClick={() => handleCallNext()}
                    disabled={actionLoading || waitingList.length === 0}
                    className="py-2 px-2 rounded-lg text-[11px] font-semibold text-cobalt bg-cobalt-tint hover:bg-blue-100 transition disabled:opacity-50 cursor-pointer"
                  >
                    Call Next ({waitingList.length})
                  </button>
                  <button
                    onClick={() => handleSkip()}
                    disabled={actionLoading}
                    className="py-2 px-2 rounded-lg text-[11px] font-semibold text-muted bg-surface hover:bg-slate-100 border border-hairline transition cursor-pointer"
                  >
                    Skip (Absent)
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="editorial-card border-dashed p-8 text-center bg-surface/50">
            <h3 className="font-display text-lg font-bold text-ink">No Patient Currently Called</h3>
            <p className="text-xs text-muted mt-1 mb-5">
              The clinic room is free. Call the next waiting patient from your queue.
            </p>

            <button
              onClick={() => handleCallNext()}
              disabled={actionLoading || waitingList.length === 0}
              className="editorial-btn-primary px-6 py-3 text-sm"
            >
              Call Next Patient ({waitingList.length} in queue)
            </button>
          </div>
        )}
      </div>

      {/* ─── QUEUE METRICS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
            Waiting in Lounge
          </span>
          <span className="font-display text-3xl font-bold text-clinical-warning mt-1.5 block">
            {stats.waiting_count || 0}
          </span>
        </div>

        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
            Consulted Today
          </span>
          <span className="font-display text-3xl font-bold text-clinical-success mt-1.5 block">
            {stats.completed_count || 0}
          </span>
        </div>

        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
            Admitted Inpatients
          </span>
          <span className="font-display text-3xl font-bold text-cobalt mt-1.5 block">
            {admittedList.length}
          </span>
        </div>

        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
            Hospital Free Beds
          </span>
          <span className="font-display text-3xl font-bold text-ink mt-1.5 block">
            {bedOverview?.summary?.available_beds ?? '--'} Free
          </span>
        </div>
      </div>

      {/* ─── NAVIGATION TABS ─── */}
      <div className="flex border-b border-hairline mb-6 gap-2 sm:gap-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('waiting')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'waiting'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Waiting List ({waitingList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('admitted')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'admitted'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Admitted Inpatients ({admittedList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'completed'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Completed Today ({completedList.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skipped')}
          className={`pb-3 px-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'skipped'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Skipped / Absent ({skippedList.length})
        </button>
      </div>

      {/* ─── TAB 1: WAITING LIST (IN PRIORITY ORDER) ─── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt"></div>
        </div>
      ) : activeTab === 'waiting' ? (
        <div>
          {waitingList.length === 0 ? (
            <div className="editorial-card p-12 text-center">
              <h3 className="font-display text-lg font-bold text-ink">Queue is Clear</h3>
              <p className="text-xs text-muted mt-1">
                No patients are currently waiting in the OPD lounge.
              </p>
            </div>
          ) : (
            <div className="editorial-card overflow-x-auto">
              <table className="min-w-full divide-y divide-hairline text-left text-xs">
                <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
                  <tr>
                    <th className="px-5 py-3.5">Order</th>
                    <th className="px-4 py-3.5">Token Code</th>
                    <th className="px-4 py-3.5">Patient Details</th>
                    <th className="px-4 py-3.5">Priority</th>
                    <th className="px-4 py-3.5">Chief Complaint</th>
                    <th className="px-5 py-3.5 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-white">
                  {waitingList.map((token, index) => (
                    <tr
                      key={token.id}
                      className={`hover:bg-surface/60 transition ${
                        token.priority === 'emergency' ? 'bg-rose-50/40' : ''
                      }`}
                    >
                      <td className="px-5 py-4 font-mono font-semibold text-muted">
                        #{index + 1}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono font-bold text-cobalt text-sm">
                          {token.token_code}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-ink">{token.patient_name}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {token.patient_code || `PAT-${token.patient}`} ·{' '}
                          <span className="text-clinical-danger font-bold">{token.patient_blood_group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">{getPriorityBadge(token.priority)}</td>
                      <td className="px-4 py-4 text-xs text-muted max-w-xs truncate">
                        {token.symptoms || 'General Checkup'}
                      </td>
                      <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCallNext(token.id)}
                          disabled={actionLoading}
                          className="editorial-btn-primary py-1.5 px-3 text-[11px]"
                        >
                          Call In
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenAdmitModal(token)}
                          disabled={actionLoading}
                          className="editorial-btn-secondary py-1.5 px-2.5 text-[11px]"
                        >
                          Admit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenBloodModal(token)}
                          disabled={actionLoading}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-clinical-danger bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                        >
                          Blood
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenJourneyModal(token.patient)}
                          disabled={actionLoading}
                          className="editorial-btn-secondary py-1.5 px-2.5 text-[11px]"
                        >
                          Journey
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'admitted' ? (
        <div>
          {admittedList.length === 0 ? (
            <div className="editorial-card p-12 text-center">
              <h3 className="font-display text-lg font-bold text-ink">No Currently Admitted Patients</h3>
              <p className="text-xs text-muted mt-1">
                You do not have any patients currently admitted in hospital wards.
              </p>
            </div>
          ) : (
            <div className="editorial-card overflow-x-auto">
              <table className="min-w-full divide-y divide-hairline text-left text-xs">
                <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
                  <tr>
                    <th className="px-5 py-3.5">Assigned Bed</th>
                    <th className="px-4 py-3.5">Patient Details</th>
                    <th className="px-4 py-3.5">Ward &amp; Category</th>
                    <th className="px-4 py-3.5">Diagnosis</th>
                    <th className="px-4 py-3.5">Admitted On</th>
                    <th className="px-5 py-3.5 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline bg-white">
                  {admittedList.map((admission) => (
                    <tr key={admission.id} className="hover:bg-surface/60 transition">
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-50 text-clinical-danger border border-rose-200 font-mono font-bold text-[11px]">
                          Bed {admission.bed_number}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-ink">{admission.patient_name}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {admission.patient_code} · <span className="text-clinical-danger font-bold">{admission.patient_blood_group}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-ink">{admission.ward_name}</div>
                        <span className="font-mono text-[10px] uppercase text-muted">
                          {admission.ward_type}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-xs text-muted max-w-xs truncate">
                        {admission.diagnosis || 'Clinical Care'}
                      </td>

                      <td className="px-4 py-4 font-mono text-[11px] text-muted">
                        {new Date(admission.admission_date).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenBloodModal(admission)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-clinical-danger bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer"
                        >
                          Blood
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenJourneyModal(admission.patient)}
                          className="editorial-btn-secondary py-1.5 px-2.5 text-[11px]"
                        >
                          Journey
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/billing?patient=${admission.patient}&new=1`)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-cobalt bg-cobalt-tint hover:bg-blue-100 border border-cobalt/20 transition cursor-pointer"
                        >
                          Bill
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDischargeModal(admission)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-ink bg-surface hover:bg-slate-200 border border-hairline transition cursor-pointer"
                        >
                          Discharge →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'completed' ? (
        <div className="editorial-card overflow-x-auto">
          <table className="min-w-full divide-y divide-hairline text-left text-xs">
            <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
              <tr>
                <th className="px-5 py-3.5">Token Code</th>
                <th className="px-4 py-3.5">Patient Details</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Follow-Up Workflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-white">
              {completedList.map((token) => (
                <tr key={token.id} className="hover:bg-surface/60">
                  <td className="px-5 py-4 font-mono font-bold text-ink">
                    {token.token_code}
                  </td>
                  <td className="px-4 py-4 font-semibold text-ink">
                    {token.patient_name}
                  </td>
                  <td className="px-4 py-4">{getPriorityBadge(token.priority)}</td>
                  <td className="px-4 py-4">
                    <span className="font-mono text-[10px] font-bold uppercase text-clinical-success bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                      Completed
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => navigate(`/records?patient=${token.patient}&new=1`)}
                      className="editorial-btn-secondary py-1 px-2.5 text-[11px]"
                    >
                      + Rx / Lab
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/billing?patient=${token.patient}&token=${token.id}&new=1`)}
                      className="editorial-btn-secondary py-1 px-2.5 text-[11px]"
                    >
                      Bill →
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenJourneyModal(token.patient)}
                      className="editorial-btn-secondary py-1 px-2.5 text-[11px]"
                    >
                      Timeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="editorial-card overflow-x-auto">
          <table className="min-w-full divide-y divide-hairline text-left text-xs">
            <thead className="bg-surface text-muted uppercase font-mono text-[10px] font-semibold tracking-wider border-b border-hairline">
              <tr>
                <th className="px-5 py-3.5">Token Code</th>
                <th className="px-4 py-3.5">Patient</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-white">
              {skippedList.map((token) => (
                <tr key={token.id} className="hover:bg-surface/60">
                  <td className="px-5 py-4 font-mono font-bold text-ink">
                    {token.token_code}
                  </td>
                  <td className="px-4 py-4 font-semibold text-ink">
                    {token.patient_name}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleCallNext(token.id)}
                      className="editorial-btn-primary py-1.5 px-3 text-[11px]"
                    >
                      Recall Patient Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODAL 1: ADMIT PATIENT (BED MODULE) ─── */}
      {showAdmitModal && patientToAdmit && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-lg w-full p-6 sm:p-7 shadow-2xl">
            <div className="flex items-start justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Module 2 · Inpatient Admission</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Admit Patient &amp; Auto-Assign Bed
                </h3>
                <p className="text-xs text-muted mt-0.5 font-mono">
                  Patient ID: {patientToAdmit.patient_code || `PAT-${patientToAdmit.patient || 1}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdmitModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleConfirmAutoAdmit} className="mt-5 space-y-4">
              <div className="p-3.5 bg-cobalt-tint/50 border border-cobalt/20 rounded-xl">
                <span className="font-mono text-[10px] font-semibold text-cobalt uppercase tracking-wider block">
                  Admission Target
                </span>
                <h4 className="font-display text-base font-bold text-ink mt-0.5">
                  {patientToAdmit.patient_name}
                </h4>
                <p className="text-xs text-muted mt-0.5 font-mono">
                  Token: {patientToAdmit.token_code} · Blood Group: {patientToAdmit.patient_blood_group || 'N/A'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Select Ward Category *
                </label>
                <select
                  value={admitForm.ward_type}
                  onChange={(e) => setAdmitForm({ ...admitForm, ward_type: e.target.value })}
                  className="editorial-input"
                >
                  <option value="general">
                    General Ward ({bedOverview?.ward_types?.general?.available ?? 0} free beds)
                  </option>
                  <option value="icu">
                    ICU - Intensive Care Unit ({bedOverview?.ward_types?.icu?.available ?? 0} free beds)
                  </option>
                  <option value="private">
                    Private Room ({bedOverview?.ward_types?.private?.available ?? 0} free beds)
                  </option>
                  <option value="semi">Semi-Private Room</option>
                  <option value="emergency">Emergency Ward</option>
                  <option value="pediatric">Pediatric Ward</option>
                  <option value="maternity">Maternity Ward</option>
                </select>
                <p className="text-[11px] text-muted mt-1">
                  Auto-assigns the lowest floor and lowest available bed number in this category.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Clinical Diagnosis &amp; Admission Reason *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Acute Respiratory Distress, High Grade Fever with dehydration."
                  value={admitForm.diagnosis}
                  onChange={(e) => setAdmitForm({ ...admitForm, diagnosis: e.target.value })}
                  className="editorial-input resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="editorial-btn-primary px-5"
                >
                  Confirm &amp; Auto-Assign Bed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: DISCHARGE PATIENT (BED MODULE) ─── */}
      {showDischargeModal && admissionToDischarge && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-md w-full p-6 sm:p-7 shadow-2xl">
            <div className="flex items-start justify-between pb-3 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Ward Release</span>
                <h3 className="font-display text-base font-bold text-ink mt-0.5">
                  Patient Discharge &amp; Bed Release
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDischargeModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleConfirmDischarge} className="mt-4 space-y-4">
              <div className="p-3.5 bg-surface border border-hairline rounded-xl text-xs space-y-1">
                <p>
                  <span className="text-muted">Patient:</span>{' '}
                  <strong className="text-ink">{admissionToDischarge.patient_name}</strong>{' '}
                  <span className="font-mono text-muted">({admissionToDischarge.patient_code})</span>
                </p>
                <p>
                  <span className="text-muted">Assigned Bed:</span>{' '}
                  <strong className="text-clinical-danger font-mono">
                    Bed {admissionToDischarge.bed_number} ({admissionToDischarge.ward_name})
                  </strong>
                </p>
                <p>
                  <span className="text-muted">Admitted On:</span>{' '}
                  <span className="font-mono text-ink">{new Date(admissionToDischarge.admission_date).toLocaleString()}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Discharge Summary / Clinical Notes
                </label>
                <textarea
                  rows="3"
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  placeholder="e.g. Condition stabilized. Prescribed medications for 7 days."
                  className="editorial-input text-xs resize-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-clinical-success font-medium">
                Once discharged, Bed {admissionToDischarge.bed_number} will immediately become Available.
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-clinical-danger hover:opacity-95 text-white transition disabled:opacity-50 cursor-pointer"
                >
                  Confirm Discharge &amp; Free Bed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: REQUEST BLOOD ─── */}
      {showBloodModal && patientForBlood && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-lg w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow text-clinical-danger">Module 3 · Blood Requisition</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Request Blood Units
                </h3>
                <p className="text-xs text-muted mt-0.5 font-mono">
                  Patient ID: {patientForBlood.patient_code || `PAT-${patientForBlood.patient || patientForBlood.id || 1}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBloodModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            {bloodModalResult?.stock_status?.is_stock_low && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-red-900 text-xs space-y-2">
                <p className="font-bold text-sm text-clinical-danger">
                  Low Blood Stock Warning
                </p>
                <p>
                  Only <strong>{bloodModalResult.stock_status.units_available} units</strong> of{' '}
                  <strong>{bloodModalResult.stock_status.blood_group}</strong> available in bank.
                </p>

                {bloodModalResult.matching_donors?.length > 0 && (
                  <div className="pt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {bloodModalResult.matching_donors.slice(0, 4).map((d) => (
                      <div
                        key={d.id}
                        className="p-2 bg-white rounded-lg border border-rose-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <strong className="text-ink">{d.name}</strong> ({d.blood_group}) · {d.city}
                        </div>
                        <a
                          href={`tel:${d.phone}`}
                          className="px-2.5 py-1 rounded bg-clinical-danger text-white font-mono font-bold text-[11px]"
                        >
                          {d.phone}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleConfirmBloodRequest} className="mt-4 space-y-4">
              <div className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-xl">
                <span className="font-mono text-[10px] font-semibold text-clinical-danger uppercase tracking-wider block">
                  Patient Recipient
                </span>
                <h4 className="font-display text-base font-bold text-ink mt-0.5">
                  {patientForBlood.patient_name || patientForBlood.name}
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Blood Group: <strong className="font-mono text-clinical-danger">{patientForBlood.patient_blood_group || patientForBlood.blood_group || 'O+'}</strong> · Location: <strong className="text-ink">{bloodForm.hospital_ward}</strong>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink">
                    Blood Group Required *
                  </label>
                  <span className="font-mono text-[11px] font-bold text-clinical-danger bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {liveStock[bloodForm.blood_group] ?? 0}u in stock
                  </span>
                </div>
                <select
                  value={bloodForm.blood_group}
                  onChange={(e) => setBloodForm({ ...bloodForm, blood_group: e.target.value })}
                  className="editorial-input font-mono font-bold text-clinical-danger"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg} ({liveStock[bg] ?? 0} units available)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Units Needed *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={bloodForm.units_required}
                    onChange={(e) => setBloodForm({ ...bloodForm, units_required: e.target.value })}
                    className="editorial-input font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Urgency Priority *
                  </label>
                  <select
                    value={bloodForm.priority}
                    onChange={(e) => setBloodForm({ ...bloodForm, priority: e.target.value })}
                    className="editorial-input font-semibold"
                  >
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent (2–4 hrs)</option>
                    <option value="emergency">Emergency (Immediate)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Hospital Location
                  </label>
                  <input
                    type="text"
                    value={bloodForm.hospital_ward}
                    onChange={(e) => setBloodForm({ ...bloodForm, hospital_ward: e.target.value })}
                    className="editorial-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Purpose / Case
                  </label>
                  <select
                    value={bloodForm.purpose}
                    onChange={(e) => setBloodForm({ ...bloodForm, purpose: e.target.value })}
                    className="editorial-input"
                  >
                    <option value="surgery">Surgery</option>
                    <option value="accident">Accident / Trauma</option>
                    <option value="anemia">Severe Anemia</option>
                    <option value="thalassemia">Thalassemia</option>
                    <option value="maternity">Maternity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Doctor Clinical Orders
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Prepare for emergency cross-matching before procedure."
                  value={bloodForm.notes}
                  onChange={(e) => setBloodForm({ ...bloodForm, notes: e.target.value })}
                  className="editorial-input text-xs resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowBloodModal(false)}
                  className="editorial-btn-secondary"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={bloodModalLoading}
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-clinical-danger hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {bloodModalLoading ? 'Submitting...' : 'Dispatch Blood Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: UNIFIED PATIENT JOURNEY TIMELINE ─── */}
      <PatientJourneyModal
        isOpen={Boolean(journeyPatientId)}
        onClose={() => setJourneyPatientId(null)}
        patientId={journeyPatientId}
      />

      {/* ─── MODAL 5: DOCTOR LEAVE SCHEDULE ─── */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="editorial-card max-w-lg w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Availability Control</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">Manage Availability &amp; Leaves</h3>
                <p className="text-xs text-muted mt-0.5">
                  Patients booking advance OPD tokens are blocked on your scheduled leave dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="text-muted hover:text-ink font-bold text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateLeave} className="mt-4 space-y-3 bg-surface p-4 rounded-xl border border-hairline">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="editorial-input py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    min={leaveForm.start_date}
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="editorial-input py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Reason / Coverage Note</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Medical Conference / Planned Leave"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="editorial-input py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full editorial-btn-primary py-2.5"
              >
                {actionLoading ? 'Saving Leave...' : '+ Add Leave Window'}
              </button>
            </form>

            <div className="mt-5">
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-2.5">
                Scheduled Leaves ({leaves.length})
              </h4>
              {leaves.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center">No scheduled leaves.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {leaves.map((lv) => (
                    <div
                      key={lv.id}
                      className="p-3 rounded-xl border border-hairline bg-white flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-mono font-bold text-ink">
                          {lv.start_date} &rarr; {lv.end_date}
                        </p>
                        <p className="text-muted text-[11px]">{lv.reason || 'Planned Leave'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeave(lv.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-clinical-danger border border-rose-200 font-semibold text-[11px] transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
