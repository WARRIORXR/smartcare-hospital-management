/**
 * src/pages/patient/BookTokenPage.jsx
 * -----------------------------------
 * Dedicated page for patients to book an OPD Token.
 * Displays:
 *  - Department filter pills
 *  - Doctor list with LIVE QUEUE LOAD (how many patients are waiting)
 *  - Book Token button triggering consultation priority selection
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import hospitalService from '../../services/hospitalService';
import BookTokenModal from '../../components/opd/BookTokenModal';

const BookTokenPage = () => {
  const navigate = useNavigate();

  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Booking modal state
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState(null);

  // Load departments and available doctors
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [depts, docs] = await Promise.all([
          hospitalService.getDepartments(false),
          hospitalService.getDoctors({ available: true }),
        ]);
        setDepartments(depts);
        setDoctors(docs);
      } catch (err) {
        console.error('Failed to load departments or doctors', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter doctors by selected department & search term
  const filteredDoctors = doctors.filter((doc) => {
    const matchesDept = selectedDeptId ? doc.department === parseInt(selectedDeptId) : true;
    const matchesSearch =
      doc.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.specialization && doc.specialization.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.department_name && doc.department_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDept && matchesSearch;
  });

  // Helper for queue load indicator badge
  const getQueueLoadBadge = (count) => {
    if (count === 0) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        text: '⚡ No Waiting — Direct Entry',
        bullet: 'bg-emerald-500',
      };
    }
    if (count <= 3) {
      return {
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        text: `🟢 Low Queue: ${count} waiting`,
        bullet: 'bg-blue-500',
      };
    }
    return {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      text: `🟡 Busy: ${count} waiting in line`,
      bullet: 'bg-amber-500',
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
              🎟️ OPD Queue Booking
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Book Doctor Consultation Token
            </h1>
            <p className="mt-1 text-blue-100 text-sm">
              Check real-time patient queue loads and secure your consultation slot instantly.
            </p>
          </div>
          <button
            onClick={() => navigate('/patient/tokens')}
            className="px-4 py-2.5 rounded-xl bg-white text-blue-900 text-xs font-bold shadow-md hover:bg-blue-50 transition"
          >
            📋 View My Active Tokens ↗
          </button>
        </div>
      </div>

      {/* ─── DEPARTMENT SELECTOR PILLS ─── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Filter by Department
          </label>
          <span className="text-xs text-gray-400">
            {departments.length} Medical Specialties Available
          </span>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedDeptId('')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
              selectedDeptId === ''
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Departments ({doctors.length})
          </button>

          {departments.map((dept) => {
            const count = doctors.filter((d) => d.department === dept.id).length;
            return (
              <button
                key={dept.id}
                onClick={() => setSelectedDeptId(dept.id.toString())}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                  selectedDeptId === dept.id.toString()
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {dept.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SEARCH BAR ─── */}
      <div className="mb-6">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search doctor by name, specialty, or clinic room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
          />
        </div>
      </div>

      {/* ─── DOCTORS LIST WITH LIVE QUEUE LOAD ─── */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-2">👨‍⚕️</span>
          <h3 className="text-lg font-bold text-gray-800">No doctors available</h3>
          <p className="text-sm text-gray-500 mt-1">
            Try choosing a different department or clear your search term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDoctors.map((doc) => {
            const queueBadge = getQueueLoadBadge(doc.waiting_patients_count || 0);
            const estWait = (doc.waiting_patients_count || 0) * (doc.avg_consult_minutes || 15);

            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Top Department Badge & Clinic Room */}
                  <div className="flex justify-between items-start mb-3">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {doc.department_name}
                    </span>
                    <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                      📍 {doc.room_number || 'Room 101'}
                    </span>
                  </div>

                  {/* Doctor Info */}
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                    {doc.doctor_name}
                  </h3>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">
                    {doc.specialization} • {doc.qualification || 'MBBS'}
                  </p>

                  {/* ─── LIVE QUEUE LOAD HIGHLIGHT BOX ─── */}
                  <div className="my-4 p-3.5 rounded-xl border bg-slate-50/80 border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Live OPD Queue Load
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${queueBadge.bg}`}>
                        {queueBadge.text}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center pt-1">
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Patients Waiting</span>
                        <span className="text-base font-extrabold text-gray-900">
                          {doc.waiting_patients_count || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-400 uppercase font-semibold">Est. Wait Time</span>
                        <span className="text-base font-extrabold text-blue-700">
                          ~{estWait} mins
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details summary */}
                  <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
                    <span>Avg Consult: <strong className="text-gray-900">{doc.avg_consult_minutes || 15}m</strong></span>
                    <span>Fee: <strong className="text-emerald-700 font-bold">₹{doc.consultation_fee}</strong></span>
                  </div>
                </div>

                {/* Book Token Button */}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setSelectedDoctorForBooking(doc)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition flex items-center justify-center space-x-1.5"
                  >
                    <span>🎟️</span>
                    <span>Book Token with Dr. {doc.last_name || doc.doctor_name}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Modal with priority selection */}
      {selectedDoctorForBooking && (
        <BookTokenModal
          doctor={selectedDoctorForBooking}
          onClose={() => setSelectedDoctorForBooking(null)}
          onSuccess={() => {
            setSelectedDoctorForBooking(null);
            navigate('/patient/tokens');
          }}
        />
      )}
    </div>
  );
};

export default BookTokenPage;
