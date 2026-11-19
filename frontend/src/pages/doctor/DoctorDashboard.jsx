/**
 * src/pages/doctor/DoctorDashboard.jsx
 * ------------------------------------
 * Interactive Live OPD Consultation Dashboard for Doctors.
 * Features:
 *  - Currently Called Patient Card (Hero console)
 *  - Action buttons: "Call Next", "Complete", "Skip"
 *  - Today's Patient Waiting List sorted in strict priority order:
 *      Emergency -> Senior Citizen -> Normal, then sequential Token Number
 *  - Real-time queue counters & auto-refresh
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import opdService from '../../services/opdService';

const DoctorDashboard = () => {
  const { user } = useAuth();

  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [activeTab, setActiveTab] = useState('waiting'); // 'waiting' | 'completed' | 'skipped'

  const loadQueue = async (silent = false) => {
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
  };

  useEffect(() => {
    loadQueue();
    // Auto-refresh queue every 15 seconds to receive new patient tokens live
    const interval = setInterval(() => loadQueue(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4500);
  };

  // ─── ACTION HANDLERS ───

  // Call Next Patient (either top of queue or a specific token)
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

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return 'bg-red-100 text-red-800 border-red-300 font-extrabold';
      case 'senior_citizen':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const currentPatient = queueData?.current_called_token;
  const waitingList = queueData?.waiting_list || [];
  const completedList = queueData?.completed_list || [];
  const skippedList = queueData?.skipped_list || [];
  const stats = queueData?.stats || {};

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ─── DOCTOR CLINIC HEADER ─── */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
              <span>👨‍⚕️</span>
              <span>OPD Consultation Room</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {queueData?.doctor?.doctor_name || `Dr. ${user?.first_name} ${user?.last_name}`}
            </h1>
            <p className="mt-1 text-blue-200 text-sm">
              {queueData?.doctor?.department_name || 'General OPD'} • 📍 <strong className="text-white">{queueData?.doctor?.room_number || 'Room 101'}</strong> • ⏱️ {queueData?.doctor?.avg_consult_minutes || 15} mins / patient
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href={queueData?.doctor?.id ? `/display/${queueData.doctor.id}` : '/display'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold transition flex items-center space-x-1 shadow-sm"
              title="Open public TV screen display in a new window"
            >
              <span>📺</span>
              <span>Open TV Display ↗</span>
            </a>

            <button
              onClick={() => loadQueue(false)}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition flex items-center space-x-1"
            >
              <span>🔄</span>
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alert Notification */}
      {alert.message && (
        <div
          className={`mb-6 p-4 rounded-2xl text-sm font-medium border flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{alert.message}</span>
          <button onClick={() => setAlert({ type: '', message: '' })} className="font-bold text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
      )}

      {/* ─── CURRENTLY CALLED PATIENT HERO SECTION ─── */}
      <div className="mb-8">
        {currentPatient ? (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 border-2 border-blue-400 rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              {/* Left Details */}
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="flex items-center text-xs font-extrabold text-blue-800 bg-blue-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-blue-600 mr-1.5"></span>
                    Currently Called Into Room
                  </span>
                  <span className={`text-xs uppercase px-2 py-0.5 rounded-full border ${getPriorityBadge(currentPatient.priority)}`}>
                    {currentPatient.priority.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-4xl font-black text-blue-700 tracking-wider font-mono my-1">
                  {currentPatient.token_code}
                </div>

                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">
                  {currentPatient.patient_name}
                </h3>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                  <span>ID: <strong className="text-gray-900">{currentPatient.patient_code || 'PAT-0001'}</strong></span>
                  <span>Blood: <strong className="text-red-600 font-bold">{currentPatient.patient_blood_group || 'N/A'}</strong></span>
                  <span>Gender: <strong className="text-gray-900">{currentPatient.patient_gender === 'M' ? 'Male' : currentPatient.patient_gender === 'F' ? 'Female' : 'Other'}</strong></span>
                  <span>Mobile: <strong className="text-gray-900">{currentPatient.patient_phone || 'N/A'}</strong></span>
                </div>

                {currentPatient.symptoms && (
                  <div className="mt-3 p-3 bg-white rounded-xl border border-blue-100 text-xs text-gray-700">
                    <strong className="text-gray-500 block uppercase text-[10px]">Chief Complaint / Symptoms:</strong>
                    "{currentPatient.symptoms}"
                  </div>
                )}
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-64">
                <button
                  onClick={() => handleComplete()}
                  disabled={actionLoading}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>✅</span>
                  <span>Complete Consultation</span>
                </button>

                <button
                  onClick={() => handleCallNext()}
                  disabled={actionLoading || waitingList.length === 0}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <span>📢</span>
                  <span>Call Next Patient ({waitingList.length})</span>
                </button>

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
            <h3 className="text-lg font-bold text-gray-800">
              No Patient Currently Called
            </h3>
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
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Waiting Today</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {stats.waiting_count || 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {stats.completed_count || 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Skipped</span>
          <span className="text-2xl font-black text-gray-500 mt-1 block">
            {stats.skipped_count || 0}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Registered</span>
          <span className="text-2xl font-black text-blue-700 mt-1 block">
            {stats.total_today || 0}
          </span>
        </div>
      </div>

      {/* ─── QUEUE TABS ─── */}
      <div className="flex space-x-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('waiting')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'waiting'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Waiting List ({waitingList.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'completed'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Completed Today ({completedList.length})
        </button>
        <button
          onClick={() => setActiveTab('skipped')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'skipped'
              ? 'border-gray-600 text-gray-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Skipped / Absent ({skippedList.length})
        </button>
      </div>

      {/* ─── TAB CONTENT: WAITING LIST (IN PRIORITY ORDER) ─── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'waiting' ? (
        <div>
          {waitingList.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-200">
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
                        <div className="text-[10px] text-gray-400">Token #{token.token_number}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{token.patient_name}</div>
                        <div className="text-xs text-gray-500">
                          {token.patient_code} • {token.patient_gender === 'M' ? 'M' : 'F'} • Blood: {token.patient_blood_group || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full border ${getPriorityBadge(token.priority)}`}>
                          {token.priority.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                        {token.symptoms || <span className="text-gray-400 italic">No complaint specified</span>}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleCallNext(token.id)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
                        >
                          Call Now
                        </button>
                        <button
                          onClick={() => handleSkip(token.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                        >
                          Skip
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
        /* ─── TAB CONTENT: COMPLETED LIST ─── */
        <div className="overflow-x-auto bg-white rounded-3xl shadow-xs border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Token Code</th>
                <th className="px-6 py-3.5">Patient</th>
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
                  <td className="px-6 py-4">
                    <span className="font-semibold text-gray-800">{token.patient_name}</span>
                    <span className="text-xs text-gray-400 ml-2">({token.patient_code})</span>
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getPriorityBadge(token.priority)}`}>
                      {token.priority.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      Completed ✓
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── TAB CONTENT: SKIPPED LIST ─── */
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
    </div>
  );
};

export default DoctorDashboard;
