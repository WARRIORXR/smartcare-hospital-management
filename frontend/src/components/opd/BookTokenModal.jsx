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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 my-6">
        {!generatedToken ? (
          <div>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                  Book OPD Token or Advance Slot
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choose today's queue or book an advance consultation slot (up to 30 days)
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none">
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded-md text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Consulting Doctor *</label>
                {doctor ? (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                    <p className="text-sm font-bold text-blue-900">{doctor.doctor_name}</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      {doctor.specialization} • 📍 {doctor.room_number || 'Room 101'} • Fee: ₹{doctor.consultation_fee}
                    </p>
                  </div>
                ) : (
                  <select
                    required
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Select Priority Level *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: '🟢 Normal', sub: 'Standard', activeCls: 'bg-blue-50 border-blue-600 text-blue-700' },
                    { id: 'senior_citizen', label: '🟡 Senior Citizen', sub: 'Fast-track', activeCls: 'bg-amber-50 border-amber-600 text-amber-700' },
                    { id: 'emergency', label: '🔴 Emergency', sub: 'Immediate', activeCls: 'bg-red-50 border-red-600 text-red-700' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        priority === p.id ? `${p.activeCls} shadow-xs` : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p.label}
                      <span className="block text-[10px] font-normal text-gray-500 mt-0.5">{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Consultation Date *</label>
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
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Advance Time Slot (Optional)
                  </label>
                  <select
                    value={timeSlot}
                    disabled={slotsData.is_on_leave}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white disabled:bg-gray-100"
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
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                  🚫 Doctor is on scheduled leave on {appointmentDate} ({slotsData.leave_reason || 'Unavailable'}). Please select another date.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Symptoms / Reason (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Fever, chest pain, regular checkup..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || slotsData.is_on_leave}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Booking...' : appointmentDate > todayStr || timeSlot ? '📅 Confirm Advance Booking' : '🎟️ Generate Token'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-sm">
              ✅
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              {generatedToken.is_advance_booking ? 'Advance Appointment Confirmed!' : 'Token Generated Successfully!'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              SMS / WhatsApp proximity alert will notify you automatically when you are 3 positions away.
            </p>

            <div className="my-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-200 text-center relative overflow-hidden">
              <div className="text-4xl font-extrabold text-blue-700 tracking-wider my-2 font-mono">
                {generatedToken.token_code}
              </div>
              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold mb-4 border border-amber-200">
                {generatedToken.appointment_date} {generatedToken.time_slot ? `• ${generatedToken.time_slot}` : '• Live Queue'}
              </div>

              <div className="grid grid-cols-2 gap-3 text-left bg-white p-3.5 rounded-xl border border-blue-100 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Doctor</span>
                  <span className="font-bold text-gray-900">{generatedToken.doctor_name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Clinic Room</span>
                  <span className="font-bold text-blue-700">📍 {generatedToken.room_number || 'Room 101'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Queue Position</span>
                  <span className="font-bold text-gray-900">#{generatedToken.queue_position} in line</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Est. Wait</span>
                  <span className="font-bold text-emerald-700">⏱️ ~{generatedToken.estimated_wait_minutes} mins</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  onClose();
                  navigate('/patient/tokens');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition cursor-pointer"
              >
                📋 View in My Tokens
              </button>
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition cursor-pointer"
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
