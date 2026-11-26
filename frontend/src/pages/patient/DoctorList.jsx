/**
 * src/pages/patient/DoctorList.jsx
 * ---------------------------------
 * Patient view for browsing hospital doctors.
 * Displays Department, Room Number, Average Consultation Time, Fee, and Availability.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';
import BookTokenModal from '../../components/opd/BookTokenModal';

const DoctorList = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isPatient = Boolean(isAuthenticated && user && user.role === 'patient');

  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingDoctor, setBookingDoctor] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    if (!isPatient) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [depts, docs] = await Promise.all([
          hospitalService.getDepartments(false),
          hospitalService.getDoctors(),
        ]);
        setDepartments(depts);
        setDoctors(docs);
      } catch (err) {
        console.error('Failed to load doctor directory', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isPatient]);

  // Defensive Guard: Only Patients can access
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isPatient) {
    return <Navigate to="/dashboard" replace />;
  }

  // Filter doctors locally for instant search response
  const filteredDoctors = doctors.filter((doc) => {
    // Search filter
    const matchesSearch =
      doc.doctor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.specialization && doc.specialization.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.department_name && doc.department_name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Department filter
    const matchesDept = selectedDept ? doc.department === parseInt(selectedDept) : true;

    // Availability filter
    const matchesAvailability = onlyAvailable ? doc.is_available : true;

    return matchesSearch && matchesDept && matchesAvailability;
  });

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <span className="editorial-eyebrow">Specialist Directory</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Hospital Doctors &amp; Clinics
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Check clinic room assignments, consultation fees, patient ratings, and duty availability before booking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/patient/book-token')}
            className="editorial-btn-primary"
          >
            + Compare Live Queues
          </button>
          <button
            type="button"
            onClick={() => navigate('/patient/dashboard')}
            className="editorial-btn-secondary"
          >
            ← Portal Home
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="editorial-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by doctor name, specialty, or clinic..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="editorial-input"
          />
        </div>

        <div className="sm:w-64">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="editorial-input"
          >
            <option value="">All Departments ({departments.length})</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <label htmlFor="availableToggle" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-hairline cursor-pointer shrink-0">
          <input
            type="checkbox"
            id="availableToggle"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="h-4 w-4 text-cobalt rounded border-hairline"
          />
          <span className="text-xs font-semibold text-ink whitespace-nowrap">Available Only</span>
        </label>
      </div>

      {/* Doctors Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt"></div>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="editorial-card p-12 text-center">
          <h3 className="font-display text-lg font-bold text-ink">No doctors found</h3>
          <p className="text-xs text-muted mt-1">
            Try adjusting your search query or department filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDoctors.map((doc) => (
            <div
              key={doc.id}
              className="editorial-card p-6 flex flex-col justify-between hover:border-cobalt/40"
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded bg-cobalt-tint text-cobalt border border-cobalt/15">
                    {doc.department_name || 'General OPD'}
                  </span>
                  {doc.is_available ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-clinical-success bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-clinical-success animate-pulse" />
                      Available Today
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-muted bg-surface px-2.5 py-0.5 rounded-full border border-hairline">
                      Off Duty
                    </span>
                  )}
                </div>

                <h3 className="font-display text-lg font-bold text-ink">
                  {doc.doctor_name}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {doc.specialization} · {doc.qualification || 'MBBS'}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-clinical-warning border border-amber-200 font-mono text-[11px] font-semibold">
                    ★ {doc.average_rating !== null && doc.average_rating !== undefined ? `${doc.average_rating}/5` : 'New'} ({doc.feedback_count || 0})
                  </span>
                  {Array.isArray(doc.upcoming_leaves) && doc.upcoming_leaves.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 text-clinical-danger border border-rose-200 font-mono text-[10px] font-semibold">
                      Leave: {doc.upcoming_leaves[0].start_date}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-surface rounded-xl border border-hairline text-center">
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-muted">Room</span>
                    <span className="font-mono text-xs font-bold text-ink mt-0.5 block">
                      {doc.room_number || 'OPD-101'}
                    </span>
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-muted">Avg Visit</span>
                    <span className="font-mono text-xs font-bold text-cobalt mt-0.5 block">
                      {doc.avg_consult_minutes || 15}m
                    </span>
                  </div>
                  <div>
                    <span className="block font-mono text-[10px] uppercase text-muted">Fee</span>
                    <span className="font-mono text-xs font-bold text-clinical-success mt-0.5 block">
                      ₹{doc.consultation_fee}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 text-xs text-muted flex items-center justify-between">
                  <span>OPD Days</span>
                  <span className="font-medium text-ink">{doc.available_days || 'Mon–Fri'}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => navigate(`/patient/book-slot/${doc.id}`)}
                  disabled={!doc.is_available}
                  className="w-full editorial-btn-primary py-2.5"
                >
                  Reserve Consultation Slot →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Token Booking Modal */}
      {bookingDoctor && (
        <BookTokenModal
          doctor={bookingDoctor}
          onClose={() => setBookingDoctor(null)}
        />
      )}
    </div>
  );
};

export default DoctorList;
