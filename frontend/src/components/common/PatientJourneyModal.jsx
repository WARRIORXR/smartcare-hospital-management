/**
 * src/components/common/PatientJourneyModal.jsx
 * ---------------------------------------------
 * Universal Modal component that visualizes the complete patient journey
 * connecting all 3 hospital modules:
 *   Module 1: OPD Consultation Tokens & Doctors
 *   Module 2: Inpatient Bed Allocation & Admissions
 *   Module 3: Blood Bank Requests & Donor Matching
 *
 * Linked universally by Patient ID.
 */

import React, { useEffect, useState } from 'react';
import hospitalService from '../../services/hospitalService';

const PatientJourneyModal = ({ isOpen, onClose, patientId, initialData = null }) => {
  const [journeyData, setJourneyData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !patientId) return;

    if (initialData) {
      setJourneyData(initialData);
      setLoading(false);
      return;
    }

    const fetchJourney = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await hospitalService.getPatientJourney(patientId);
        setJourneyData(data);
      } catch (err) {
        console.error('Failed to load patient journey', err);
        setError(err?.response?.data?.detail || 'Unable to retrieve complete medical journey.');
      } finally {
        setLoading(false);
      }
    };

    fetchJourney();
  }, [isOpen, patientId, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 sm:p-8 my-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold transition"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 text-2xl flex items-center justify-center shadow-xs">
            📜
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Unified Patient Medical Journey</h3>
            <p className="text-xs text-gray-500">
              Cross-Module Medical Timeline: Module 1 (OPD) &rarr; Module 2 (Beds) &rarr; Module 3 (Blood Bank)
            </p>
          </div>
        </div>

        {loading && (
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Retrieving linked medical records across all 3 modules...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {journeyData && !loading && (
          <div className="space-y-6">
            {/* Patient Header Summary Badge */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-xs">
                  {journeyData.patient?.patient_code}
                </span>
                <div>
                  <span className="font-extrabold text-gray-900 text-base">{journeyData.patient?.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({journeyData.patient?.gender === 'M' ? 'Male' : journeyData.patient?.gender === 'F' ? 'Female' : 'Other'}, Blood:{' '}
                    <strong className="text-red-600">{journeyData.patient?.blood_group}</strong>)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-white text-gray-700 px-3 py-1 rounded-full font-bold border border-gray-200 shadow-xs">
                  OPD Visits: {journeyData.journey_summary?.total_opd_visits}
                </span>
                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold border shadow-xs ${
                    journeyData.journey_summary?.is_currently_admitted
                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {journeyData.journey_summary?.is_currently_admitted
                    ? `🛏️ Admitted: ${journeyData.journey_summary?.current_ward} (${journeyData.journey_summary?.current_bed})`
                    : '🟢 Outpatient (Not Inpatient)'}
                </span>
                <span className="text-xs bg-white text-gray-700 px-3 py-1 rounded-full font-bold border border-gray-200 shadow-xs">
                  Blood Requests: {journeyData.journey_summary?.total_blood_requests}
                </span>
              </div>
            </div>

            {/* 3 Step Connected Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: OPD Consultation */}
              <div className="border border-blue-200 rounded-2xl p-4 bg-blue-50/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-100">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                    <h4 className="font-bold text-blue-900 text-sm">Module 1: OPD Consultation</h4>
                  </div>
                  {journeyData.module_1_opd?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-4">No OPD consultation tokens issued.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {journeyData.module_1_opd.map((tok) => (
                        <div key={tok.id} className="bg-white border border-blue-100 rounded-xl p-3 text-xs shadow-xs">
                          <div className="flex justify-between items-center font-mono font-bold text-blue-700">
                            <span>{tok.token_code}</span>
                            <span className="text-gray-500 font-sans text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100">
                              {tok.status}
                            </span>
                          </div>
                          <p className="font-bold text-gray-800 mt-1">{tok.doctor_name}</p>
                          <p className="text-[11px] text-gray-500">{tok.department_name} • Room {tok.room_number}</p>
                          {tok.symptoms && (
                            <p className="text-[11px] text-gray-600 mt-1.5 bg-gray-50 p-1.5 rounded-lg italic">
                              "{tok.symptoms}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Bed Allocation */}
              <div className="border border-purple-200 rounded-2xl p-4 bg-purple-50/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-purple-100">
                    <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <h4 className="font-bold text-purple-900 text-sm">Module 2: Bed Allocation</h4>
                  </div>
                  {journeyData.module_2_beds?.active_admission ? (
                    <div className="bg-white border border-purple-200 rounded-xl p-3.5 text-xs shadow-xs mb-2">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 uppercase mb-1">
                        Currently Inpatient
                      </span>
                      <p className="font-extrabold text-gray-900 text-base">
                        Bed {journeyData.module_2_beds.active_admission.bed_number}
                      </p>
                      <p className="text-purple-700 font-bold mt-0.5">
                        {journeyData.module_2_beds.active_admission.ward_name} ({journeyData.module_2_beds.active_admission.ward_type})
                      </p>
                      <p className="text-gray-600 mt-1">Floor: {journeyData.module_2_beds.active_admission.floor_number}</p>
                      <p className="text-gray-600">Attending: {journeyData.module_2_beds.active_admission.attending_doctor_name}</p>
                      <p className="text-gray-700 mt-2 italic bg-purple-50 p-2 rounded-lg border border-purple-100">
                        Diagnosis: {journeyData.module_2_beds.active_admission.diagnosis || 'Clinical Monitoring'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-500 mb-2 text-center">
                      Not currently admitted to any hospital bed.
                    </div>
                  )}

                  {journeyData.module_2_beds?.admissions_history?.filter((a) => a.status === 'discharged').length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Past Discharges</p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {journeyData.module_2_beds.admissions_history
                          .filter((a) => a.status === 'discharged')
                          .map((d) => (
                            <div key={d.id} className="bg-white border border-gray-100 rounded-lg p-1.5 text-[11px] text-gray-600">
                              <span className="font-semibold text-gray-800">{d.bed_number}</span> ({d.ward_name}) - Discharged
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Blood Bank */}
              <div className="border border-rose-200 rounded-2xl p-4 bg-rose-50/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-rose-100">
                    <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                    <h4 className="font-bold text-rose-900 text-sm">Module 3: Blood Bank</h4>
                  </div>
                  {journeyData.module_3_bloodbank?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-4">No blood bank requests filed for this patient.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {journeyData.module_3_bloodbank.map((br) => (
                        <div key={br.id} className="bg-white border border-rose-100 rounded-xl p-3 text-xs shadow-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-rose-700 text-sm">{br.units_required} Unit(s) {br.blood_group}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                br.status === 'approved' || br.status === 'fulfilled'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : br.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {br.status}
                            </span>
                          </div>
                          <p className="text-gray-600 mt-1">Priority: <strong className="capitalize">{br.priority}</strong></p>
                          {br.hospital_ward && <p className="text-gray-500 text-[11px]">Ward: {br.hospital_ward}</p>}
                          <p className="text-gray-500 text-[11px]">Purpose: {br.purpose}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition"
          >
            Close Timeline
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientJourneyModal;
