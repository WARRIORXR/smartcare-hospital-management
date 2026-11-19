/**
 * src/pages/doctor/DoctorDashboard.jsx
 * ------------------------------------
 * Interactive Live OPD Consultation & Inpatient Admission Dashboard for Doctors.
 *
 * Features:
 *  - Currently Called Patient Card (Hero console)
 *  - Action buttons: "Call Next", "Complete", "Skip", and "🛏️ Admit Patient"
 *  - Auto-assign Bed logic (system finds first available bed in chosen ward type)
 *  - Admitted Inpatients tab with "Discharge Patient" (frees bed back to Available)
 *  - Today's Patient Waiting List sorted in strict priority order:
 *      Emergency -> Senior Citizen -> Normal, then sequential Token Number
 *  - Real-time queue counters & auto-refresh
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import opdService from '../../services/opdService';
import bedService from '../../services/bedService';

const DoctorDashboard = () => {
  const { user } = useAuth();

  // Queue Data
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [activeTab, setActiveTab] = useState('waiting'); // 'waiting' | 'completed' | 'skipped' | 'admitted'

  // Admitted Inpatients Data
  const [admittedList, setAdmittedList] = useState([]);
  const [bedOverview, setBedOverview] = useState(null);

  // Admit Modal State
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [patientToAdmit, setPatientToAdmit] = useState(null);
  const [admitForm, setAdmitForm] = useState({
    ward_type: 'general',
    diagnosis: '',
  });

  // Discharge Modal State
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [admissionToDischarge, setAdmissionToDischarge] = useState(null);
  const [dischargeNotes, setDischargeNotes] = useState('');

  // Load Queue & Active Admissions
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

  const loadAdmittedInpatients = useCallback(async () => {
    try {
      const data = await bedService.getActiveAdmissions({ my_patients: true });
      setAdmittedList(data || []);
      // Also fetch live bed overview for availability numbers in the modal
      const overview = await bedService.getOverview();
      setBedOverview(overview);
    } catch (err) {
      console.error('Failed to load admitted patients', err);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    loadAdmittedInpatients();

    // Auto-refresh queue and admitted patients every 15 seconds
    const interval = setInterval(() => {
      loadQueue(true);
      loadAdmittedInpatients();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadQueue, loadAdmittedInpatients]);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 5000);
  };

  // ─── ACTION HANDLERS ───

  // Call Next Patient
  const handleCallNext = async (tokenId = null) => {
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
    }
  };

  // Mark Consultation Complete
  const handleComplete = async (tokenId = null) => {
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
    }
  };

  // Skip Patient
  const handleSkip = async (tokenId = null) => {
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
    }
  };

  // ─── ADMIT PATIENT (AUTO-ASSIGN BED) ───
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
        ward_type: admitForm.ward_type,
        diagnosis: admitForm.diagnosis,
      };

      const res = await bedService.autoAdmitPatient(payload);
      showAlert(
        'success',
        `🎉 ${res.message || 'Patient admitted successfully!'}`
      );

      setShowAdmitModal(false);
      setPatientToAdmit(null);
      await loadQueue(true);
      await loadAdmittedInpatients();
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

  // ─── DISCHARGE PATIENT (FREES BED BACK TO AVAILABLE) ───
  const handleOpenDischargeModal = (admission) => {
    setAdmissionToDischarge(admission);
    setDischargeNotes('Patient recovered and cleared for discharge.');
    setShowDischargeModal(true);
  };

  const handleConfirmDischarge = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const res = await bedService.dischargePatient(
        admissionToDischarge.id,
        dischargeNotes
      );

      showAlert(
        'success',
        `✅ ${res.message || 'Patient discharged. Bed is now Available again!'}`
      );

      setShowDischargeModal(false);
      setAdmissionToDischarge(null);
      await loadAdmittedInpatients();
      await loadQueue(true);
    } catch (err) {
      console.error('Failed to discharge patient:', err);
      showAlert(
        'error',
        err.response?.data?.error || 'Failed to process patient discharge.'
      );
    } finally {
      setActionLoading(false);
    }
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
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-xs mb-3">
            👨‍⚕️ Clinical Consultation Room
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              loadQueue();
              loadAdmittedInpatients();
            }}
            disabled={actionLoading}
            className="inline-flex items-center px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20"
          >
            🔄 Refresh Queue
          </button>
        </div>
      </div>

      {/* ─── CURRENTLY CALLED PATIENT HERO CONSOLE ─── */}
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
                    ID: <strong className="text-gray-900">{currentPatient.patient_code || 'PAT-0001'}</strong>
                  </span>
                  <span>
                    Blood: <strong className="text-red-600 font-bold">{currentPatient.patient_blood_group || 'N/A'}</strong>
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
                      Chief Complaint / Symptoms:
                    </strong>
                    "{currentPatient.symptoms}"
                  </div>
                )}
              </div>

              {/* Action Buttons for Called Patient */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 w-full lg:w-64">
                {/* 1. Complete Visit */}
                <button
                  onClick={() => handleComplete()}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>✅</span>
                  <span>Complete Consultation</span>
                </button>

                {/* 2. Admit Patient (Auto-assign Bed) */}
                <button
                  onClick={() => handleOpenAdmitModal(currentPatient)}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>🛏️</span>
                  <span>Admit Patient to Ward</span>
                </button>

                {/* 3. Call Next Patient */}
                <button
                  onClick={() => handleCallNext()}
                  disabled={actionLoading || waitingList.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>📢</span>
                  <span>Call Next Patient ({waitingList.length})</span>
                </button>

                {/* 4. Skip Patient */}
                <button
                  onClick={() => handleSkip()}
                  disabled={actionLoading}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition text-center"
                >
                  Skip Patient (Absent)
                </button>
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
                    <th className="px-6 py-3.5">Order</th>
                    <th className="px-6 py-3.5">Token Code</th>
                    <th className="px-6 py-3.5">Patient Details</th>
                    <th className="px-6 py-3.5">Priority</th>
                    <th className="px-6 py-3.5">Chief Complaint</th>
                    <th className="px-6 py-3.5 text-right">Quick Actions</th>
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
                      <td className="px-6 py-4 font-mono font-bold text-gray-400">
                        #{index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-extrabold text-blue-700 text-base">
                          {token.token_code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{token.patient_name}</div>
                        <div className="text-xs text-gray-500">
                          {token.patient_code || 'PAT-0001'} • Blood:{' '}
                          <span className="text-red-600 font-semibold">{token.patient_blood_group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getPriorityBadge(token.priority)}</td>
                      <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                        {token.symptoms || 'General Checkup'}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleCallNext(token.id)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition"
                          title="Call into clinic room"
                        >
                          📢 Call
                        </button>
                        <button
                          onClick={() => handleOpenAdmitModal(token)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                          title="Direct Inpatient Admission"
                        >
                          🛏️ Admit
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
        /* ─── TAB 2: ADMITTED INPATIENTS (DISCHARGE BUTTON) ─── */
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
                    <th className="px-6 py-3.5">Assigned Bed</th>
                    <th className="px-6 py-3.5">Patient Details</th>
                    <th className="px-6 py-3.5">Ward & Category</th>
                    <th className="px-6 py-3.5">Diagnosis</th>
                    <th className="px-6 py-3.5">Admission Date</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {admittedList.map((admission) => (
                    <tr key={admission.id} className="hover:bg-gray-50/80 transition">
                      {/* Bed Badge */}
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-300 font-black text-sm">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                          <span>Bed {admission.bed_number}</span>
                        </div>
                      </td>

                      {/* Patient Details */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{admission.patient_name}</div>
                        <div className="text-xs text-gray-500">
                          {admission.patient_code} • Gender: {admission.patient_gender} • Blood:{' '}
                          <span className="text-red-600 font-semibold">{admission.patient_blood_group}</span>
                        </div>
                      </td>

                      {/* Ward */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-800">{admission.ward_name}</div>
                        <span className="text-[10px] uppercase font-bold text-gray-500">
                          {admission.ward_type}
                        </span>
                      </td>

                      {/* Diagnosis */}
                      <td className="px-6 py-4 text-xs text-gray-700 max-w-xs">
                        <p className="line-clamp-2">{admission.diagnosis || 'Clinical Inpatient Care'}</p>
                      </td>

                      {/* Admission Date */}
                      <td className="px-6 py-4 text-xs text-gray-500">
                        {new Date(admission.admission_date).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      {/* Action: Discharge */}
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenDischargeModal(admission)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition"
                        >
                          Discharge Patient →
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
                <th className="px-6 py-3.5">Token Code</th>
                <th className="px-6 py-3.5">Patient Details</th>
                <th className="px-6 py-3.5">Priority</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {completedList.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50/60">
                  <td className="px-6 py-4 font-mono font-bold text-gray-900">
                    {token.token_code}
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-800">
                    {token.patient_name}
                  </td>
                  <td className="px-6 py-4">{getPriorityBadge(token.priority)}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      Completed ✓
                    </span>
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
                <th className="px-6 py-3.5">Token Code</th>
                <th className="px-6 py-3.5">Patient</th>
                <th className="px-6 py-3.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skippedList.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50/60">
                  <td className="px-6 py-4 font-mono font-bold text-gray-900">
                    {token.token_code}
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-800">
                    {token.patient_name}
                  </td>
                  <td className="px-6 py-4">
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

      {/* ─── MODAL: ADMIT PATIENT (AUTO-ASSIGN BED) ─── */}
      {showAdmitModal && patientToAdmit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <span>🛏️</span> Inpatient Admission & Auto-Assign Bed
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  The hospital system will automatically assign the first available bed.
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
              {/* Patient Info Card */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                    Patient to be Admitted:
                  </span>
                  <h4 className="text-base font-extrabold text-blue-950">
                    {patientToAdmit.patient_name}
                  </h4>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Token: <strong>{patientToAdmit.token_code}</strong> • ID:{' '}
                    <strong>{patientToAdmit.patient_code || 'PAT-0001'}</strong>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-xs">
                  🏥
                </div>
              </div>

              {/* Ward Type Selection */}
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

              {/* Diagnosis / Clinical Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Clinical Diagnosis & Admission Reason *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Acute Respiratory Distress, High Grade Fever with dehydration, Requires IV fluids & continuous monitoring."
                  value={admitForm.diagnosis}
                  onChange={(e) => setAdmitForm({ ...admitForm, diagnosis: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              {/* Footer Actions */}
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

      {/* ─── MODAL: DISCHARGE PATIENT ─── */}
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
                  <strong>Patient:</strong> {admissionToDischarge.patient_name}
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
                  placeholder="e.g. Condition stabilized. Prescribed medications for 7 days. Follow up next Monday."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                ></textarea>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-2xs text-emerald-800 font-semibold">
                ℹ️ Once discharged, Bed {admissionToDischarge.bed_number} will immediately become{' '}
                <strong>Available (Green)</strong> on the live hospital dashboard.
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
    </div>
  );
};

export default DoctorDashboard;
