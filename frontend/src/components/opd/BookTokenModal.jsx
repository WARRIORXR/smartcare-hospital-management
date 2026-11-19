/**
 * src/components/opd/BookTokenModal.jsx
 * --------------------------------------
 * Reusable modal for generating an OPD Token.
 * Allows selecting doctor, setting priority (Normal / Senior Citizen / Emergency),
 * and displaying the generated token slip.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import opdService from '../../services/opdService';

const BookTokenModal = ({ doctor, doctors = [], onClose, onSuccess }) => {
  const navigate = useNavigate();

  const [selectedDoctorId, setSelectedDoctorId] = useState(
    doctor ? doctor.id : doctors.length > 0 ? doctors[0].id : ''
  );
  const [priority, setPriority] = useState('normal'); // 'normal' | 'senior_citizen' | 'emergency'
  const [symptoms, setSymptoms] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedToken, setGeneratedToken] = useState(null);

  // Selected doctor info
  const activeDoctor = doctor || doctors.find((d) => d.id === parseInt(selectedDoctorId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedDoctorId) {
      setError('Please select a doctor for consultation.');
      return;
    }

    try {
      setLoading(true);
      const token = await opdService.generateToken({
        doctor: parseInt(selectedDoctorId),
        priority: priority,
        symptoms: symptoms,
        appointment_date: appointmentDate,
      });

      setGeneratedToken(token);
      if (onSuccess) onSuccess(token);
    } catch (err) {
      console.error('Failed to generate token', err);
      const data = err.response?.data;
      if (data) {
        if (data.non_field_errors) {
          setError(data.non_field_errors[0]);
        } else if (data.doctor) {
          setError(Array.isArray(data.doctor) ? data.doctor[0] : data.doctor);
        } else if (data.patient) {
          setError(Array.isArray(data.patient) ? data.patient[0] : data.patient);
        } else if (typeof data === 'string') {
          setError(data);
        } else {
          setError('Failed to book token. Please check inputs.');
        }
      } else {
        setError('Network error while booking token.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100">
        {!generatedToken ? (
          /* ─── BOOKING FORM ─── */
          <div>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                  Book OPD Consultation Token
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Get your sequential queue token for hospital OPD
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-700 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded-md text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Doctor Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Consulting Doctor *
                </label>
                {doctor ? (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                    <p className="text-sm font-bold text-blue-900">{doctor.doctor_name}</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      {doctor.specialization} • 📍 {doctor.room_number || 'Room 101'}
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

              {/* Consultation Priority */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Select Priority Level *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPriority('normal')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center ${
                      priority === 'normal'
                        ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-xs'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    🟢 Normal
                    <span className="block text-[10px] font-normal text-gray-500 mt-0.5">Standard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPriority('senior_citizen')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center ${
                      priority === 'senior_citizen'
                        ? 'bg-amber-50 border-amber-600 text-amber-700 shadow-xs'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    🟡 Senior Citizen
                    <span className="block text-[10px] font-normal text-gray-500 mt-0.5">Fast-track</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPriority('emergency')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center ${
                      priority === 'emergency'
                        ? 'bg-red-50 border-red-600 text-red-700 shadow-xs'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    🔴 Emergency
                    <span className="block text-[10px] font-normal text-gray-500 mt-0.5">Immediate</span>
                  </button>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Consultation Date
                </label>
                <input
                  type="date"
                  required
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Symptoms */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Symptoms / Reason for Consultation (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Fever, chest pain, regular checkup..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {loading ? 'Generating Token...' : '🎟️ Generate Token'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* ─── TOKEN CONFIRMATION SLIP ─── */
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-sm">
              ✅
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              Token Generated Successfully!
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Please present this token at the OPD waiting lounge.
            </p>

            {/* Hospital Token Card */}
            <div className="my-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-200 text-center relative overflow-hidden">
              <div className="absolute top-2 right-3 text-[10px] uppercase font-bold text-blue-700 bg-blue-200/60 px-2 py-0.5 rounded-full">
                {generatedToken.priority.replace('_', ' ')}
              </div>

              <span className="text-xs uppercase font-bold tracking-widest text-gray-500">Your OPD Token</span>
              <div className="text-4xl font-extrabold text-blue-700 tracking-wider my-2 font-mono">
                {generatedToken.token_code}
              </div>

              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold mb-4 border border-amber-200">
                Status: {generatedToken.status.toUpperCase()}
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
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Position in Queue</span>
                  <span className="font-bold text-gray-900">#{generatedToken.queue_position} in line</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-semibold">Est. Wait Time</span>
                  <span className="font-bold text-emerald-700">⏱️ ~{generatedToken.estimated_wait_minutes} mins</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  onClose();
                  navigate('/patient/tokens');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition"
              >
                📋 View in My Tokens
              </button>
              <button
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
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
