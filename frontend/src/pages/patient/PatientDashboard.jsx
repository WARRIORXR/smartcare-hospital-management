/**
 * src/pages/patient/PatientDashboard.jsx
 * --------------------------------------
 * Dashboard specifically designed for Patients.
 * Displays patient details, patient ID, and quick actions for the 3 project modules.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';
import hospitalService from '../../services/hospitalService';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Unified Journey State
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);
  const [journeyData, setJourneyData] = useState(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await authService.getProfile();
        setProfile(data.profile);
      } catch (err) {
        console.error('Could not fetch patient profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const openJourneyModal = async () => {
    const targetPatientId = profile?.id || user?.patient_id_pk || user?.id;
    if (!targetPatientId) {
      setJourneyError('Patient ID could not be determined.');
      setJourneyModalOpen(true);
      return;
    }
    setJourneyModalOpen(true);
    setJourneyLoading(true);
    setJourneyError(null);
    try {
      const data = await hospitalService.getPatientJourney(targetPatientId);
      setJourneyData(data);
    } catch (err) {
      console.error('Failed to load patient journey', err);
      setJourneyError(err?.response?.data?.detail || 'Failed to load medical journey.');
    } finally {
      setJourneyLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/40 border border-emerald-300/30 mb-2">
              👤 Patient Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome, {user?.first_name || user?.username}!
            </h1>
            <p className="mt-1 text-emerald-100 text-sm">
              Manage your OPD tokens, bed reservations, and blood bank requests from your portal.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/20 text-center">
            <span className="block text-xs uppercase tracking-wider text-emerald-200">Patient ID</span>
            <span className="text-lg font-bold font-mono text-white">
              {profile?.patient_id || user?.patient_id || 'PAT-0001'}
            </span>
          </div>
        </div>
      </div>

      {/* Patient Vitals & Info Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Blood Group</p>
          <p className="text-xl font-bold text-red-600 mt-1">
            {profile?.blood_group || user?.blood_group || 'Not Specified'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Gender</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {profile?.gender === 'M' ? 'Male' : profile?.gender === 'F' ? 'Female' : 'Other'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Registered Mobile</p>
          <p className="text-xl font-bold text-gray-800 mt-1">
            {user?.phone || 'Not set'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Portal Status</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-semibold text-emerald-700">Active</span>
          </div>
        </div>
      </div>

      {/* Unified Patient Journey Banner (Step 13) */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 rounded-2xl p-6 text-white shadow-md mb-8 flex flex-col md:flex-row items-center justify-between gap-6 border border-indigo-700/50">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 mb-2">
            <span>🔗 Connected Care Journey</span>
            <span>•</span>
            <span className="font-mono text-white font-bold">{profile?.patient_id || user?.patient_id || 'PAT-0001'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Your Integrated Medical Timeline</h2>
          <p className="text-sm text-indigo-200 mt-1 max-w-2xl">
            All 3 modules (OPD Consultation &rarr; Bed Allocation &rarr; Blood Bank Requests) are connected under your unique Patient ID. Track your complete journey in real time.
          </p>
        </div>
        <button
          onClick={openJourneyModal}
          className="shrink-0 px-5 py-3 rounded-xl bg-white text-indigo-950 font-bold text-sm hover:bg-indigo-50 transition shadow-lg flex items-center gap-2"
        >
          <span>📜</span>
          <span>View My Medical Journey</span>
        </button>
      </div>

      {/* Main Module Action Cards */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">SmartCare Services</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Module 1: OPD Token Queue */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 text-2xl flex items-center justify-center mb-4">
              🎟️
            </div>
            <h3 className="text-lg font-bold text-gray-900">OPD Token Queue</h3>
            <p className="text-sm text-gray-600 mt-2">
              Book a doctor consultation token and view live queue updates so you don't wait in long lines.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => navigate('/patient/book-token')}
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition shadow-xs"
            >
              🎟️ Book OPD Token (Live Queue)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/patient/tokens')}
                className="w-full py-1.5 px-2 rounded-lg bg-blue-50 text-blue-700 font-medium text-xs hover:bg-blue-100 transition text-center"
              >
                📱 My Tokens
              </button>
              <button
                onClick={() => navigate('/patient/doctors')}
                className="w-full py-1.5 px-2 rounded-lg bg-gray-100 text-gray-700 font-medium text-xs hover:bg-gray-200 transition text-center"
              >
                👨‍⚕️ Doctor List
              </button>
            </div>
          </div>
        </div>

        {/* Module 2: Bed Management */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 text-2xl flex items-center justify-center mb-4">
              🛏️
            </div>
            <h3 className="text-lg font-bold text-gray-900">Inpatient Care</h3>
            <p className="text-sm text-gray-600 mt-2">
              Check your personal inpatient admission record, assigned ward, bed allocation, and attending doctor.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={openJourneyModal}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition"
            >
              📋 My Inpatient Admission Status
            </button>
            <button
              onClick={openJourneyModal}
              className="w-full py-1.5 px-2 rounded-lg bg-purple-50 text-purple-700 font-medium text-xs hover:bg-purple-100 transition text-center"
            >
              📜 View Full Care Timeline
            </button>
          </div>
        </div>

        {/* Module 3: Blood Bank */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 text-2xl flex items-center justify-center mb-4">
              🩸
            </div>
            <h3 className="text-lg font-bold text-gray-900">Blood Requisition</h3>
            <p className="text-sm text-gray-600 mt-2">
              Submit emergency or planned blood requests directly to the hospital blood bank and track real-time fulfillment.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => navigate('/bloodbank/requests')}
              className="w-full py-2 px-4 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition"
            >
              🩸 Emergency Blood Request
            </button>
            <button
              onClick={() => navigate('/bloodbank/requests')}
              className="w-full py-1.5 px-2 rounded-lg bg-rose-50 text-rose-700 font-medium text-xs hover:bg-rose-100 transition text-center"
            >
              📋 My Blood Request History
            </button>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* Patient Journey Timeline Modal */}
      {/* ───────────────────────────────────────────────────────────── */}
      {journeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 sm:p-8 my-8 relative">
            <button
              onClick={() => { setJourneyModalOpen(false); setJourneyData(null); }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 text-2xl flex items-center justify-center">
                📜
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Patient Medical Journey</h3>
                <p className="text-xs text-gray-500">
                  Unified record linking Module 1 (OPD) &rarr; Module 2 (Beds) &rarr; Module 3 (Blood Bank)
                </p>
              </div>
            </div>

            {journeyLoading && (
              <div className="py-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Loading your medical journey across all hospital modules...</p>
              </div>
            )}

            {journeyError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                {journeyError}
              </div>
            )}

            {journeyData && !journeyLoading && (
              <div className="space-y-6">
                {/* Header summary badge */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-white px-2 py-1 rounded border border-indigo-200">
                      {journeyData.patient?.patient_code}
                    </span>
                    <span className="ml-3 font-bold text-gray-900">{journeyData.patient?.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({journeyData.patient?.gender}, Blood: <strong className="text-red-600">{journeyData.patient?.blood_group}</strong>)</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs bg-white text-gray-700 px-2.5 py-1 rounded-full font-medium border border-gray-200">
                      OPD Tokens: {journeyData.journey_summary?.total_opd_visits}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${journeyData.journey_summary?.is_currently_admitted ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                      {journeyData.journey_summary?.is_currently_admitted ? `Admitted (${journeyData.journey_summary?.current_ward} - ${journeyData.journey_summary?.current_bed})` : 'Not Inpatient'}
                    </span>
                    <span className="text-xs bg-white text-gray-700 px-2.5 py-1 rounded-full font-medium border border-gray-200">
                      Blood Req: {journeyData.journey_summary?.total_blood_requests}
                    </span>
                  </div>
                </div>

                {/* 3 Step Timeline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Step 1: OPD */}
                  <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                      <h4 className="font-bold text-blue-900 text-sm">Module 1: OPD Consultation</h4>
                    </div>
                    {journeyData.module_1_opd?.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No OPD consultation tokens found.</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {journeyData.module_1_opd.map(tok => (
                          <div key={tok.id} className="bg-white border border-blue-100 rounded-lg p-2.5 text-xs shadow-xs">
                            <div className="flex justify-between items-center font-mono font-bold text-blue-700">
                              <span>{tok.token_code}</span>
                              <span className="text-gray-500 font-sans text-[11px] capitalize">{tok.status}</span>
                            </div>
                            <p className="font-medium text-gray-800 mt-1">{tok.doctor_name}</p>
                            <p className="text-[11px] text-gray-500">{tok.department_name} • Room {tok.room_number}</p>
                            {tok.symptoms && (
                              <p className="text-[11px] text-gray-600 mt-1 bg-gray-50 p-1 rounded italic">
                                "{tok.symptoms}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 2: Bed Allocation */}
                  <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/30">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                      <h4 className="font-bold text-purple-900 text-sm">Module 2: Bed Allocation</h4>
                    </div>
                    {journeyData.module_2_beds?.active_admission ? (
                      <div className="bg-white border border-purple-200 rounded-lg p-3 text-xs shadow-xs mb-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase mb-1">
                          Currently Admitted
                        </span>
                        <p className="font-bold text-gray-900 text-sm">
                          Bed {journeyData.module_2_beds.active_admission.bed_number}
                        </p>
                        <p className="text-purple-700 font-medium">
                          {journeyData.module_2_beds.active_admission.ward_name} ({journeyData.module_2_beds.active_admission.ward_type})
                        </p>
                        <p className="text-gray-600 mt-1">
                          Floor: {journeyData.module_2_beds.active_admission.floor_number}
                        </p>
                        <p className="text-gray-600 mt-1">
                          Attending: {journeyData.module_2_beds.active_admission.attending_doctor_name}
                        </p>
                        <p className="text-gray-600 mt-1 italic bg-purple-50 p-1 rounded">
                          Diagnosis: {journeyData.module_2_beds.active_admission.diagnosis}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-100 rounded-lg p-3 text-xs text-gray-500 mb-2">
                        Not currently admitted in any ward.
                      </div>
                    )}

                    {journeyData.module_2_beds?.admissions_history?.filter(a => a.status === 'discharged').length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Past Discharges</p>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {journeyData.module_2_beds.admissions_history.filter(a => a.status === 'discharged').map(d => (
                            <div key={d.id} className="bg-white border border-gray-200 rounded p-1.5 text-[11px]">
                              <span className="font-semibold">{d.bed_number}</span> ({d.ward_name}) - Discharged
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Blood Bank */}
                  <div className="border border-rose-200 rounded-xl p-4 bg-rose-50/30">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <h4 className="font-bold text-rose-900 text-sm">Module 3: Blood Bank</h4>
                    </div>
                    {journeyData.module_3_bloodbank?.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No blood bank requests filed for this patient.</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {journeyData.module_3_bloodbank.map(br => (
                          <div key={br.id} className="bg-white border border-rose-100 rounded-lg p-2.5 text-xs shadow-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-rose-700">{br.units_required} Unit(s) {br.blood_group}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${br.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : br.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {br.status}
                              </span>
                            </div>
                            <p className="text-gray-600 mt-1">Priority: <strong className="capitalize">{br.priority}</strong></p>
                            {br.hospital_ward && (
                              <p className="text-gray-500 text-[11px]">Ward: {br.hospital_ward}</p>
                            )}
                            <p className="text-gray-500 text-[11px]">Purpose: {br.purpose}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => { setJourneyModalOpen(false); setJourneyData(null); }}
                className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition"
              >
                Close Timeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;
