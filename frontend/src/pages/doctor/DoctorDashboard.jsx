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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Alert Notification */}
      {alert.message && (
        <div
          className={`mb-6 p-4 rounded-2xl flex items-center justify-between text-sm font-semibold shadow-sm transition-all animate-fadeIn ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{alert.message}</span>
          <button
            onClick={() => setAlert({ type: '', message: '' })}
            className="text-xs font-bold uppercase tracking-wider ml-4 hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Profile Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-xs">
              👨‍⚕️ {t('doctorPortal')}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 border border-white/20 text-blue-100">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {t('liveQueueActive')}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                queueData?.doctor?.is_available ?? true
                  ? 'bg-emerald-500/25 text-emerald-100 border border-emerald-400/40'
                  : 'bg-rose-500/30 text-rose-100 border border-rose-300/40'
              }`}
            >
              {(queueData?.doctor?.is_available ?? true) ? '● On Duty' : '● Off Duty'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Dr. {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.username}
          </h1>
          <p className="text-blue-100 text-xs sm:text-sm mt-1">
            Department: <strong>{queueData?.doctor?.department_name || 'General OPD'}</strong> • Room:{' '}
            <strong>{queueData?.doctor?.room_number || 'OPD-1'}</strong> • Avg Visit:{' '}
            <strong>{queueData?.doctor?.avg_consult_minutes || 10} min</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleAvailability}
            disabled={togglingDuty}
            className={`inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold transition border shadow-2xs ${
              queueData?.doctor?.is_available ?? true
                ? 'bg-emerald-500/25 hover:bg-emerald-500/35 text-white border-emerald-300/40'
                : 'bg-rose-500/35 hover:bg-rose-500/45 text-white border-rose-300/40'
            }`}
          >
            {togglingDuty
              ? 'Updating...'
              : (queueData?.doctor?.is_available ?? true)
              ? '🟢 On Duty (Switch Off)'
              : '🔴 Off Duty (Go On Duty)'}
          </button>
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 shadow-2xs"
          >
            📅 Leave ({leaves.length})
          </button>
          <button
            type="button"
            onClick={() => navigate('/records')}
            className="inline-flex items-center px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition shadow-xs"
          >
            🩺 + Clinical Rx / Notes
          </button>
          <button
            type="button"
            onClick={() => {
              loadQueue();
              loadHospitalData();
            }}
            disabled={actionLoading}
            className="inline-flex items-center px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 shadow-2xs"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ─── CURRENTLY CALLED PATIENT HERO CONSOLE (STEP 13 HUB) ─── */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
          Now in Clinic Room
        </h2>

        {currentPatient ? (
          <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white border-2 border-blue-400 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-bl-2xl shadow-xs">
              ACTIVE CONSULTATION
            </div>

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center space-x-3">
                  <span className="px-3 py-1 bg-blue-600 text-white font-mono font-black text-sm rounded-lg shadow-xs">
                    {currentPatient.token_code}
                  </span>
                  {getPriorityBadge(currentPatient.priority)}
                </div>

                <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">
                  {currentPatient.patient_name}
                </h3>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                  <span>
                    Patient ID:{' '}
                    <strong className="text-blue-900 font-mono font-black">
                      {currentPatient.patient_code || `PAT-${currentPatient.patient || 1}`}
                    </strong>
                  </span>
                  <span>
                    Blood Group:{' '}
                    <strong className="text-red-600 font-black">
                      {currentPatient.patient_blood_group || 'N/A'}
                    </strong>
                  </span>
                  <span>
                    Gender:{' '}
                    <strong className="text-gray-900">
                      {currentPatient.patient_gender === 'M'
                        ? 'Male'
                        : currentPatient.patient_gender === 'F'
                        ? 'Female'
                        : 'Other'}
                    </strong>
                  </span>
                  <span>
                    Mobile: <strong className="text-gray-900">{currentPatient.patient_phone || 'N/A'}</strong>
                  </span>
                </div>

                {currentPatient.symptoms && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-blue-100 text-xs text-gray-700 shadow-2xs">
                    <strong className="text-gray-500 block uppercase text-[10px]">
                      Chief Complaint / Clinical Symptoms:
                    </strong>
                    "{currentPatient.symptoms}"
                  </div>
                )}
              </div>

              {/* ── All 3 Modules Connected in Doctor Actions ── */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2 w-full lg:w-72">
                {/* Module 1 Action: Complete Visit */}
                <button
                  onClick={() => handleComplete()}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>✅</span>
                  <span>Complete Consultation</span>
                </button>

                {/* Module 2 Connection: Admit Patient to Bed */}
                <button
                  onClick={() => handleOpenAdmitModal(currentPatient)}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>🛏️</span>
                  <span>Admit Patient (Bed Module)</span>
                </button>

                {/* Module 3 Connection: Request Blood for Patient */}
                <button
                  onClick={() => handleOpenBloodModal(currentPatient)}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>🩸</span>
                  <span>Request Blood (Blood Bank)</span>
                </button>

                {/* Step 13: Complete Unified Patient Journey Timeline */}
                <button
                  onClick={() => handleOpenJourneyModal(currentPatient.patient)}
                  disabled={actionLoading}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition text-center flex items-center justify-center gap-1"
                >
                  <span>📜</span>
                  <span>View Patient Journey Timeline</span>
                </button>

                {/* Module 4 Connection: Write Rx / Clinical Note / Upload Lab */}
                <button
                  onClick={() => navigate('/records')}
                  className="w-full py-2 px-4 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition text-center flex items-center justify-center gap-1"
                >
                  <span>🩺</span>
                  <span>+ Add Clinical Record / Rx</span>
                </button>

                {/* Call Next & Skip */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleCallNext()}
                    disabled={actionLoading || waitingList.length === 0}
                    className="py-2 px-2 rounded-xl text-2xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 text-center"
                  >
                    📢 Call Next ({waitingList.length})
                  </button>
                  <button
                    onClick={() => handleSkip()}
                    disabled={actionLoading}
                    className="py-2 px-2 rounded-xl text-2xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-center"
                  >
                    Skip (Absent)
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-8 text-center shadow-xs">
            <span className="text-4xl block mb-2">🪑</span>
            <h3 className="text-lg font-bold text-gray-800">No Patient Currently Called</h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              The clinic room is free. Click below to call the next waiting patient.
            </p>

            <button
              onClick={() => handleCallNext()}
              disabled={actionLoading || waitingList.length === 0}
              className="inline-flex items-center px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="mr-2 text-lg">📢</span>
              <span>Call Next Patient ({waitingList.length} in queue)</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── QUEUE METRICS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Waiting in Lounge
          </span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {stats.waiting_count || 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Consulted Today
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {stats.completed_count || 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Admitted Inpatients
          </span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">
            {admittedList.length}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Hospital Bed Availability
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {bedOverview?.summary?.available_beds ?? '--'} Free
          </span>
        </div>
      </div>

      {/* ─── NAVIGATION TABS ─── */}
      <div className="flex border-b border-gray-200 mb-6 gap-2 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('waiting')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'waiting'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Waiting List ({waitingList.length})
        </button>

        <button
          onClick={() => setActiveTab('admitted')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'admitted'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🛏️ Admitted Inpatients ({admittedList.length})
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'completed'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Completed Today ({completedList.length})
        </button>

        <button
          onClick={() => setActiveTab('skipped')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
            activeTab === 'skipped'
              ? 'border-gray-600 text-gray-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Skipped / Absent ({skippedList.length})
        </button>
      </div>

      {/* ─── TAB 1: WAITING LIST (IN PRIORITY ORDER) ─── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'waiting' ? (
        <div>
          {waitingList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-4xl block mb-2">🎉</span>
              <h3 className="text-lg font-bold text-gray-800">Queue is Clear!</h3>
              <p className="text-xs text-gray-500 mt-1">
                No patients are currently waiting in the OPD lounge.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-3xl shadow-xs border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Order</th>
                    <th className="px-4 py-3.5">Token Code</th>
                    <th className="px-4 py-3.5">Patient Details</th>
                    <th className="px-4 py-3.5">Priority</th>
                    <th className="px-4 py-3.5">Chief Complaint</th>
                    <th className="px-4 py-3.5 text-right">Quick Journey Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {waitingList.map((token, index) => (
                    <tr
                      key={token.id}
                      className={`hover:bg-gray-50/80 transition ${
                        token.priority === 'emergency' ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-4 font-mono font-bold text-gray-400">
                        #{index + 1}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono font-extrabold text-blue-700 text-base">
                          {token.token_code}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{token.patient_name}</div>
                        <div className="text-xs text-gray-500">
                          {token.patient_code || `PAT-${token.patient}`} • Blood:{' '}
                          <span className="text-red-600 font-bold">{token.patient_blood_group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">{getPriorityBadge(token.priority)}</td>
                      <td className="px-4 py-4 text-xs text-gray-600 max-w-xs truncate">
                        {token.symptoms || 'General Checkup'}
                      </td>
                      <td className="px-4 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleCallNext(token.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition"
                          title="Call into clinic room"
                        >
                          📢 Call
                        </button>
                        <button
                          onClick={() => handleOpenAdmitModal(token)}
                          disabled={actionLoading}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                          title="Direct Inpatient Bed Admission"
                        >
                          🛏️ Admit
                        </button>
                        <button
                          onClick={() => handleOpenBloodModal(token)}
                          disabled={actionLoading}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition"
                          title="Direct Blood Bank Request"
                        >
                          🩸 Blood
                        </button>
                        <button
                          onClick={() => handleOpenJourneyModal(token.patient)}
                          disabled={actionLoading}
                          className="px-2 py-1.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                          title="View Unified Patient Journey Timeline"
                        >
                          📜
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
        /* ─── TAB 2: ADMITTED INPATIENTS (STEP 13 ACTIONS) ─── */
        <div>
          {admittedList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-200 shadow-xs">
              <span className="text-4xl block mb-2">🛏️</span>
              <h3 className="text-lg font-bold text-gray-800">No Currently Admitted Patients</h3>
              <p className="text-xs text-gray-500 mt-1">
                You do not have any patients currently admitted in hospital wards.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-3xl shadow-xs border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Assigned Bed</th>
                    <th className="px-4 py-3.5">Patient Details</th>
                    <th className="px-4 py-3.5">Ward & Category</th>
                    <th className="px-4 py-3.5">Diagnosis</th>
                    <th className="px-4 py-3.5">Admission Date</th>
                    <th className="px-4 py-3.5 text-right">Journey Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {admittedList.map((admission) => (
                    <tr key={admission.id} className="hover:bg-gray-50/80 transition">
                      <td className="px-4 py-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-300 font-black text-xs">
                          <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                          <span>Bed {admission.bed_number}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{admission.patient_name}</div>
                        <div className="text-xs text-gray-500">
                          {admission.patient_code} • Blood:{' '}
                          <span className="text-red-600 font-bold">{admission.patient_blood_group}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-800">{admission.ward_name}</div>
                        <span className="text-[10px] uppercase font-bold text-gray-500">
                          {admission.ward_type}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-xs text-gray-700 max-w-xs truncate">
                        {admission.diagnosis || 'Clinical Care'}
                      </td>

                      <td className="px-4 py-4 text-xs text-gray-500">
                        {new Date(admission.admission_date).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      <td className="px-4 py-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenBloodModal(admission)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition"
                          title="Request Blood for this admitted patient"
                        >
                          🩸 Blood
                        </button>
                        <button
                          onClick={() => handleOpenJourneyModal(admission.patient)}
                          className="px-2 py-1.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                          title="View Journey"
                        >
                          📜
                        </button>
                        <button
                          onClick={() => handleOpenDischargeModal(admission)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition"
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
        /* ─── TAB 3: COMPLETED CONSULTATIONS ─── */
        <div className="overflow-x-auto bg-white rounded-3xl shadow-xs border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Token Code</th>
                <th className="px-4 py-3.5">Patient Details</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Patient Journey</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {completedList.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-4 font-mono font-bold text-gray-900">
                    {token.token_code}
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-800">
                    {token.patient_name}
                  </td>
                  <td className="px-4 py-4">{getPriorityBadge(token.priority)}</td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      Completed ✓
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => handleOpenJourneyModal(token.patient)}
                      className="px-3 py-1 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                    >
                      📜 View Full Journey
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── TAB 4: SKIPPED / ABSENT ─── */
        <div className="overflow-x-auto bg-white rounded-3xl shadow-xs border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Token Code</th>
                <th className="px-4 py-3.5">Patient</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skippedList.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-4 font-mono font-bold text-gray-900">
                    {token.token_code}
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-800">
                    {token.patient_name}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => handleCallNext(token.id)}
                      className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <span>🛏️</span> Module 2: Admit Patient & Auto-Assign Bed
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Linked to Patient ID: <strong>{patientToAdmit.patient_code || `PAT-${patientToAdmit.patient || 1}`}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAdmitModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAutoAdmit} className="mt-5 space-y-4">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                    Inpatient Admission Target:
                  </span>
                  <h4 className="text-base font-extrabold text-blue-950">
                    {patientToAdmit.patient_name}
                  </h4>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Token: <strong>{patientToAdmit.token_code}</strong> • Blood:{' '}
                    <strong>{patientToAdmit.patient_blood_group || 'N/A'}</strong>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-xs">
                  🛏️
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Select Ward Category *
                </label>
                <select
                  value={admitForm.ward_type}
                  onChange={(e) => setAdmitForm({ ...admitForm, ward_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="general">
                    🏥 General Ward ({bedOverview?.ward_types?.general?.available ?? 0} free beds)
                  </option>
                  <option value="icu">
                    🚨 ICU - Intensive Care Unit ({bedOverview?.ward_types?.icu?.available ?? 0} free beds)
                  </option>
                  <option value="private">
                    ⭐ Private Room ({bedOverview?.ward_types?.private?.available ?? 0} free beds)
                  </option>
                  <option value="semi">Semi-Private Room</option>
                  <option value="emergency">Emergency Ward</option>
                  <option value="pediatric">Pediatric Ward</option>
                  <option value="maternity">Maternity Ward</option>
                </select>
                <p className="text-2xs text-gray-500 mt-1">
                  ⚡ Auto-Assign Rule: Assigns the lowest floor and lowest available bed number in this category.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Clinical Diagnosis & Admission Reason *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Acute Respiratory Distress, High Grade Fever with dehydration."
                  value={admitForm.diagnosis}
                  onChange={(e) => setAdmitForm({ ...admitForm, diagnosis: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAdmitModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  <span>Confirm & Auto-Assign Bed</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: DISCHARGE PATIENT (BED MODULE) ─── */}
      {showDischargeModal && admissionToDischarge && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <span>🚪</span> Patient Discharge & Bed Release
              </h3>
              <button
                onClick={() => setShowDischargeModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDischarge} className="mt-4 space-y-4">
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-1">
                <p>
                  <strong>Patient:</strong> {admissionToDischarge.patient_name} (ID: {admissionToDischarge.patient_code})
                </p>
                <p>
                  <strong>Current Bed:</strong>{' '}
                  <span className="text-rose-700 font-bold">
                    Bed {admissionToDischarge.bed_number} ({admissionToDischarge.ward_name})
                  </span>
                </p>
                <p>
                  <strong>Admitted On:</strong>{' '}
                  {new Date(admissionToDischarge.admission_date).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Discharge Summary / Clinical Notes
                </label>
                <textarea
                  rows="3"
                  value={dischargeNotes}
                  onChange={(e) => setDischargeNotes(e.target.value)}
                  placeholder="e.g. Condition stabilized. Prescribed medications for 7 days."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-2xs text-emerald-800 font-semibold">
                ℹ️ Once discharged, Bed {admissionToDischarge.bed_number} will immediately become{' '}
                <strong>Available (Green)</strong> on the hospital dashboard.
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowDischargeModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md transition disabled:opacity-50"
                >
                  Confirm Discharge & Free Bed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: REQUEST BLOOD (BLOOD BANK MODULE LINKED VIA PATIENT ID) ─── */}
      {showBloodModal && patientForBlood && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <span>🩸</span> Module 3: Request Blood Units
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Linked to Patient ID:{' '}
                  <strong>
                    {patientForBlood.patient_code || `PAT-${patientForBlood.patient || patientForBlood.id || 1}`}
                  </strong>
                </p>
              </div>
              <button
                onClick={() => setShowBloodModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* If result had matching donors because of low stock */}
            {bloodModalResult?.stock_status?.is_stock_low && (
              <div className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs">
                <p className="font-extrabold flex items-center gap-1.5 text-sm text-red-700">
                  <span>🚨</span> Low Blood Stock Warning!
                </p>
                <p className="mt-1">
                  Only <strong>{bloodModalResult.stock_status.units_available} units</strong> of{' '}
                  <strong>{bloodModalResult.stock_status.blood_group}</strong> available in bank.
                </p>

                {bloodModalResult.matching_donors?.length > 0 && (
                  <div className="mt-3">
                    <p className="font-bold text-2xs uppercase tracking-wider text-red-800 mb-1">
                      Matching Donors to Contact Immediately:
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {bloodModalResult.matching_donors.slice(0, 4).map((d) => (
                        <div
                          key={d.id}
                          className="p-2 bg-white rounded-xl border border-red-100 flex items-center justify-between text-2xs"
                        >
                          <div>
                            <strong className="text-gray-900">{d.name}</strong> ({d.blood_group}) • {d.city}
                          </div>
                          <a
                            href={`tel:${d.phone}`}
                            className="px-2 py-0.5 rounded-lg bg-red-600 text-white font-bold"
                          >
                            📞 {d.phone}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleConfirmBloodRequest} className="mt-4 space-y-4">
              {/* Patient Info Card */}
              <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                    Patient Needing Blood:
                  </span>
                  <h4 className="text-base font-extrabold text-rose-950">
                    {patientForBlood.patient_name || patientForBlood.name}
                  </h4>
                  <p className="text-xs text-rose-800 mt-0.5">
                    Blood Group: <strong>{patientForBlood.patient_blood_group || patientForBlood.blood_group || 'O+'}</strong> • Location: <strong>{bloodForm.hospital_ward}</strong>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-xl shadow-xs">
                  🩸
                </div>
              </div>

              {/* Blood Group with Live Stock Hint */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 uppercase">
                    Blood Group Required *
                  </label>
                  <span className="text-2xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                    {liveStock[bloodForm.blood_group] ?? 0} units in blood bank
                  </span>
                </div>
                <select
                  value={bloodForm.blood_group}
                  onChange={(e) => setBloodForm({ ...bloodForm, blood_group: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-black text-rose-700"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg} (In stock: {liveStock[bg] ?? 0} units)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity & Urgency Level */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Units Needed (Bags) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={bloodForm.units_required}
                    onChange={(e) => setBloodForm({ ...bloodForm, units_required: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Urgency Priority *
                  </label>
                  <select
                    value={bloodForm.priority}
                    onChange={(e) => setBloodForm({ ...bloodForm, priority: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white font-bold"
                  >
                    <option value="normal">🔵 Normal</option>
                    <option value="urgent">⚡ Urgent (2-4 hrs)</option>
                    <option value="emergency">🚨 Emergency (Immediate)</option>
                  </select>
                </div>
              </div>

              {/* Ward Location & Clinical Purpose */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Hospital Location
                  </label>
                  <input
                    type="text"
                    value={bloodForm.hospital_ward}
                    onChange={(e) => setBloodForm({ ...bloodForm, hospital_ward: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Purpose / Case
                  </label>
                  <select
                    value={bloodForm.purpose}
                    onChange={(e) => setBloodForm({ ...bloodForm, purpose: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
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

              {/* Clinical Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Doctor Clinical Orders
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Prepare for emergency cross-matching before procedure."
                  value={bloodForm.notes}
                  onChange={(e) => setBloodForm({ ...bloodForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowBloodModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={bloodModalLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 shadow-md transition disabled:opacity-50"
                >
                  {bloodModalLoading ? 'Submitting...' : 'Dispatch Blood Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: UNIFIED PATIENT JOURNEY TIMELINE (MODULES 1-5) ─── */}
      <PatientJourneyModal
        isOpen={Boolean(journeyPatientId)}
        onClose={() => setJourneyPatientId(null)}
        patientId={journeyPatientId}
      />

      {/* ─── MODAL 5: DOCTOR LEAVE SCHEDULE ─── */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900">📅 Manage Availability & Leaves</h3>
                <p className="text-xs text-gray-500">
                  Patients booking advance OPD tokens are blocked on your scheduled leave dates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLeave} className="mt-4 space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    min={leaveForm.start_date}
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Reason / Coverage Note</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Medical Conference / Planned Leave"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition disabled:opacity-50"
              >
                {actionLoading ? 'Saving Leave...' : '+ Add Leave Window'}
              </button>
            </form>

            <div className="mt-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Scheduled Leaves ({leaves.length})
              </h4>
              {leaves.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-4 text-center">No scheduled leaves.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {leaves.map((lv) => (
                    <div
                      key={lv.id}
                      className="p-3 rounded-xl border border-gray-200 bg-white flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-gray-900">
                          {lv.start_date} &rarr; {lv.end_date}
                        </p>
                        <p className="text-gray-500 text-[11px]">{lv.reason || 'Planned Leave'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteLeave(lv.id)}
                        className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-[11px] transition"
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
