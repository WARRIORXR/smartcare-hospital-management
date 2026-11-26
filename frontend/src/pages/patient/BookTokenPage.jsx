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
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';
import BookTokenModal from '../../components/opd/BookTokenModal';

const BookTokenPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isPatient = Boolean(isAuthenticated && user && user.role === 'patient');

  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Booking modal state
  const [selectedDoctorForBooking, setSelectedDoctorForBooking] = useState(null);

  // Load departments and available doctors
  useEffect(() => {
    if (!isPatient) return;
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
  }, [isPatient]);

  // Defensive Guard: Only Patients can book tokens
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isPatient) {
    return <Navigate to="/dashboard" replace />;
  }

  // Filter doctors by selected department & search term
  const filteredDoctors = doctors.filter((doc) => {
    const matchesDept = selectedDeptId ? doc.department === parseInt(selectedDeptId) : true;
    const matchesSearch =
      doc.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.specialization && doc.specialization.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.department_name && doc.department_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDept && matchesSearch;
  });

  const getQueueLoadBadge = (count) => {
    if (count === 0) {
      return {
        bg: 'bg-emerald-50 text-clinical-success border-emerald-200',
        text: 'No Wait · Direct Entry',
      };
    }
    if (count <= 3) {
      return {
        bg: 'bg-cobalt-tint text-cobalt border-cobalt/20',
        text: `Low Queue · ${count} waiting`,
      };
    }
    return {
      bg: 'bg-amber-50 text-clinical-warning border-amber-200',
      text: `Busy · ${count} waiting`,
    };
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <span className="editorial-eyebrow">Step 2 · OPD Appointment &amp; Live Queue</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Book Consultation Token or Time Slot
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Compare live doctor queue wait times below or pick an advance date and time slot up to 30 days ahead.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/patient/doctors')}
            className="editorial-btn-secondary"
          >
            Doctor Directory
          </button>
          <button
            type="button"
            onClick={() => navigate('/patient/tokens')}
            className="editorial-btn-primary"
          >
            My Active Passes →
          </button>
        </div>
      </div>

      {/* Department Filter Pills */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold text-muted uppercase tracking-wider">
            Filter by Department
          </span>
          <span className="font-mono text-[11px] text-muted">
            {departments.length} Specialties
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedDeptId('')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
              selectedDeptId === ''
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-white text-ink border-hairline hover:bg-surface'
            }`}
          >
            All Departments ({doctors.length})
          </button>

          {departments.map((dept) => {
            const count = doctors.filter((d) => d.department === dept.id).length;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDeptId(dept.id.toString())}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
                  selectedDeptId === dept.id.toString()
                    ? 'bg-cobalt text-white border-cobalt'
                    : 'bg-white text-ink border-hairline hover:bg-surface'
                }`}
              >
                {dept.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Bar */}
      <div>
        <input
          type="text"
          placeholder="Search doctor by name, specialty, or clinic room..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="editorial-input"
        />
      </div>

      {/* Doctors List with Live Queue Load */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt"></div>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="editorial-card p-12 text-center">
          <h3 className="font-display text-lg font-bold text-ink">No doctors available</h3>
          <p className="text-xs text-muted mt-1">
            Try choosing a different department or clearing your search term.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDoctors.map((doc) => {
            const queueBadge = getQueueLoadBadge(doc.waiting_patients_count || 0);
            const estWait = (doc.waiting_patients_count || 0) * (doc.avg_consult_minutes || 15);

            return (
              <div
                key={doc.id}
                className="editorial-card p-6 flex flex-col justify-between hover:border-cobalt/40"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded bg-cobalt-tint text-cobalt border border-cobalt/15">
                      {doc.department_name}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-ink bg-surface px-2.5 py-1 rounded border border-hairline">
                      {doc.room_number || 'Room 101'}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-ink">
                    {doc.doctor_name}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {doc.specialization} · {doc.qualification || 'MBBS'}
                  </p>

                  {/* Live Queue Box */}
                  <div className="my-4 p-3.5 rounded-xl border border-hairline bg-surface space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Live Queue
                      </span>
                      <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${queueBadge.bg}`}>
                        {queueBadge.text}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-white p-2 rounded-lg border border-hairline">
                        <span className="block font-mono text-[10px] text-muted uppercase">Waiting</span>
                        <span className="font-display text-base font-bold text-ink">
                          {doc.waiting_patients_count || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-hairline">
                        <span className="block font-mono text-[10px] text-muted uppercase">Est. Wait</span>
                        <span className="font-display text-base font-bold text-cobalt">
                          ~{estWait}m
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted pt-1">
                    <span>Avg Consult: <strong className="text-ink">{doc.avg_consult_minutes || 15}m</strong></span>
                    <span>Fee: <strong className="font-mono text-clinical-success font-bold">₹{doc.consultation_fee}</strong></span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-hairline">
                  <button
                    type="button"
                    onClick={() => navigate(`/patient/book-slot/${doc.id}`)}
                    className="w-full editorial-btn-primary py-2.5"
                  >
                    Reserve Slot / Token →
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
        />
      )}
    </div>
  );
};

export default BookTokenPage;
