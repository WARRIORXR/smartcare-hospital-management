/**
 * src/components/opd/BookTokenModal.jsx
 * --------------------------------------
 * Modal for generating Same-Day OPD Tokens OR Advance Scheduled Time-Slot Appointments
 * with live Doctor Leave verification.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import opdService from '../../services/opdService';

const BookTokenModal = ({ doctor, doctors = [], onClose, onSuccess }) => {
  const navigate = useNavigate();
  const submittingRef = useRef(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const maxDateObj = new Date();
  maxDateObj.setDate(maxDateObj.getDate() + 30);
  const maxDateStr = maxDateObj.toISOString().split('T')[0];

  const [selectedDoctorId, setSelectedDoctorId] = useState(
    doctor ? doctor.id : doctors.length > 0 ? doctors[0].id : ''
  );
  const [priority, setPriority] = useState('normal');
  const [symptoms, setSymptoms] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(todayStr);
  const [timeSlot, setTimeSlot] = useState('');
  const [slotsData, setSlotsData] = useState({ is_on_leave: false, leave_reason: null, slots: [] });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedToken, setGeneratedToken] = useState(null);

  useEffect(() => {
    const docId = doctor ? doctor.id : selectedDoctorId;
    if (!docId || !appointmentDate) return;
    let active = true;
    opdService.getDoctorSlots(docId, appointmentDate)
      .then((res) => {
        if (active) setSlotsData(res);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [doctor, selectedDoctorId, appointmentDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    if (!selectedDoctorId) {
      setError('Please select a doctor for consultation.');
      return;
    }

    submittingRef.current = true;
    try {
      setLoading(true);
      const token = await opdService.generateToken({
        doctor: parseInt(selectedDoctorId),
        priority,
        symptoms,
        appointment_date: appointmentDate,
        time_slot: timeSlot,
      });

      setGeneratedToken(token);
      if (onSuccess) onSuccess(token);
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        if (data.non_field_errors) {
          setError(data.non_field_errors[0]);
        } else if (data.appointment_date) {
          setError(Array.isArray(data.appointment_date) ? data.appointment_date[0] : data.appointment_date);
        } else if (data.time_slot) {
          setError(Array.isArray(data.time_slot) ? data.time_slot[0] : data.time_slot);
        } else if (data.doctor) {
          setError(Array.isArray(data.doctor) ? data.doctor[0] : data.doctor);
        } else if (typeof data === 'string') {
          setError(data);
        } else {
          setError('Failed to book appointment. Please check inputs.');
        }
      } else {
        setError('Network error while booking token.');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="editorial-card max-w-lg w-full p-6 sm:p-8 shadow-2xl my-6">
        {!generatedToken ? (
          <div>
            <div className="flex justify-between items-start gap-4 mb-5 pb-4 border-b border-hairline">
              <div>
                <span className="editorial-eyebrow">Appointment Booking</span>
                <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                  Book OPD Token or Advance Slot
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Choose today&apos;s live queue or schedule a slot up to 30 days ahead.
                </p>
              </div>
              <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl font-bold leading-none cursor-pointer">
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 border-l-4 border-l-clinical-danger text-xs font-medium text-clinical-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Consulting Doctor *</label>
                {doctor ? (
                  <div className="p-3.5 bg-cobalt-tint/50 border border-cobalt/20 rounded-xl">
                    <p className="text-sm font-bold text-ink">{doctor.doctor_name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {doctor.specialization} · <span className="font-mono font-semibold text-cobalt">{doctor.room_number || 'Room 101'}</span> · Fee: <span className="font-mono font-semibold text-clinical-success">₹{doctor.consultation_fee}</span>
                    </p>
                  </div>
                ) : (
                  <select
                    required
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="editorial-input"
                  >
                    <option value="">Select Doctor</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.doctor_name} ({d.department_name} - {d.room_number || 'Room 101'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Select Priority Level *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: 'Normal', sub: 'Standard', activeCls: 'bg-cobalt-tint border-cobalt text-cobalt' },
                    { id: 'senior_citizen', label: 'Senior Citizen', sub: 'Fast-track', activeCls: 'bg-amber-50 border-clinical-warning text-clinical-warning' },
                    { id: 'emergency', label: 'Emergency', sub: 'Immediate', activeCls: 'bg-rose-50 border-clinical-danger text-clinical-danger' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center cursor-pointer ${
                        priority === p.id ? p.activeCls : 'border-hairline text-muted hover:bg-surface'
                      }`}
                    >
                      {p.label}
                      <span className="block text-[10px] font-normal opacity-80 mt-0.5">{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Consultation Date *</label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    max={maxDateStr}
                    value={appointmentDate}
                    onChange={(e) => {
                      setAppointmentDate(e.target.value);
                      setTimeSlot('');
                    }}
                    className="editorial-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Advance Time Slot (Optional)
                  </label>
                  <select
                    value={timeSlot}
                    disabled={slotsData.is_on_leave}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="editorial-input disabled:bg-surface"
                  >
                    <option value="">Walk-In Live Queue (Anytime)</option>
                    {(slotsData.slots || []).map((s) => (
                      <option key={s.time_slot} value={s.time_slot} disabled={!s.available}>
                        {s.time_slot} ({s.booked_count}/{s.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {slotsData.is_on_leave && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-clinical-danger font-semibold">
                  Doctor is on scheduled leave on {appointmentDate} ({slotsData.leave_reason || 'Unavailable'}). Please select another date.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Symptoms / Reason (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Fever, chest pain, regular checkup..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="editorial-input resize-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-hairline">
                <button
                  type="button"
                  onClick={onClose}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || slotsData.is_on_leave}
                  className="editorial-btn-primary px-5"
                >
                  {loading ? 'Booking...' : appointmentDate > todayStr || timeSlot ? 'Confirm Advance Booking' : 'Generate OPD Token'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-50 text-clinical-success border border-emerald-200 rounded-xl flex items-center justify-center mx-auto font-bold text-lg">
              ✓
            </div>
            <div>
              <h3 className="font-display text-xl font-bold text-ink">
                {generatedToken.is_advance_booking ? 'Advance Appointment Confirmed' : 'OPD Token Generated'}
              </h3>
              <p className="text-xs text-muted mt-1">
                SMS / WhatsApp proximity alert will notify you automatically when you are 3 positions away.
              </p>
            </div>

            <div className="p-6 bg-cobalt-tint/50 rounded-xl border border-cobalt/20 text-center space-y-3">
              <div className="font-mono text-4xl font-bold text-cobalt tracking-tight">
                {generatedToken.token_code}
              </div>
              <div className="inline-block px-3 py-1 bg-white text-ink rounded-full font-mono text-[11px] font-semibold border border-hairline">
                {generatedToken.appointment_date} {generatedToken.time_slot ? `· ${generatedToken.time_slot}` : '· Live Queue'}
              </div>

              <div className="grid grid-cols-2 gap-3 text-left bg-white p-3.5 rounded-xl border border-hairline text-xs mt-2">
                <div>
                  <span className="font-mono text-muted block text-[10px] uppercase">Doctor</span>
                  <span className="font-semibold text-ink">{generatedToken.doctor_name}</span>
                </div>
                <div>
                  <span className="font-mono text-muted block text-[10px] uppercase">Clinic Room</span>
                  <span className="font-mono font-bold text-cobalt">{generatedToken.room_number || 'Room 101'}</span>
                </div>
                <div>
                  <span className="font-mono text-muted block text-[10px] uppercase">Queue Position</span>
                  <span className="font-semibold text-ink">#{generatedToken.queue_position} in line</span>
                </div>
                <div>
                  <span className="font-mono text-muted block text-[10px] uppercase">Est. Wait</span>
                  <span className="font-mono font-bold text-clinical-success">~{generatedToken.estimated_wait_minutes} mins</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/patient/tokens');
                }}
                className="flex-1 editorial-btn-primary py-2.5"
              >
                Track in My Passes →
              </button>
              <button
                type="button"
                onClick={onClose}
                className="editorial-btn-secondary py-2.5"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookTokenModal;
