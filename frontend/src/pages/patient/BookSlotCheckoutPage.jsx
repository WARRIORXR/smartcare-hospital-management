/**
 * src/pages/patient/BookSlotCheckoutPage.jsx
 * ------------------------------------------
 * Dedicated 2-Column OPD Slot Reservation & Priority Checkout Page.
 * Replaces cramped modal booking with a full-page workflow matching Paper Artboard 18:
 *  - Left: Specialist Selector, Priority Tiers, 7-day & 30-day Leave-Guarded Date Picker,
 *    Live Time Slot availability pills, and Chief Complaint notes
 *  - Right: Sticky Booking Summary, SMS Turn Alert preview & QR Pass Confirmation state
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

const PRIORITY_OPTIONS = [
  { id: 'normal', label: 'Normal OPD', desc: 'Standard live queue position', activeCls: 'bg-cobalt-tint border-cobalt text-cobalt' },
  { id: 'senior_citizen', label: 'Senior / Priority', desc: 'Age 60+ or mobility assist', activeCls: 'bg-amber-50 border-clinical-warning text-clinical-warning' },
  { id: 'emergency', label: 'Emergency Triage', desc: 'Immediate escalation priority', activeCls: 'bg-rose-50 border-clinical-danger text-clinical-danger' },
];

const getNextSevenDays = () => {
  const days = [];
  const base = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    days.push({
      iso: d.toISOString().split('T')[0],
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      dayNum: d.toLocaleDateString('en-US', { day: '2-digit' }),
      tag: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { month: 'short' }),
    });
  }
  return days;
};

const BookSlotCheckoutPage = () => {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const submittingRef = useRef(false);

  const isPatient = Boolean(isAuthenticated && user && user.role === 'patient');
  const [{ todayStr, maxDateStr, sevenDays }] = useState(() => {
    const now = new Date();
    const maxObj = new Date(now);
    maxObj.setDate(maxObj.getDate() + 30);
    return {
      todayStr: now.toISOString().split('T')[0],
      maxDateStr: maxObj.toISOString().split('T')[0],
      sevenDays: getNextSevenDays(),
    };
  });

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(doctorId || '');
  const [priority, setPriority] = useState('normal');
  const [appointmentDate, setAppointmentDate] = useState(todayStr);
  const [timeSlot, setTimeSlot] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [slotsData, setSlotsData] = useState({ is_on_leave: false, leave_reason: null, slots: [] });

  const [pageLoading, setPageLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedToken, setConfirmedToken] = useState(null);

  useEffect(() => {
    if (!isPatient) return;
    let active = true;
    hospitalService.getDoctors()
      .then((list) => {
        if (!active) return;
        const docs = Array.isArray(list) ? list : list?.results || [];
        setDoctors(docs);
        if (doctorId) {
          setSelectedDoctorId(String(doctorId));
        } else if (docs.length > 0) {
          const firstAvail = docs.find((d) => d.is_available) || docs[0];
          setSelectedDoctorId((prev) => prev || String(firstAvail.id));
        }
      })
      .catch(() => {
        if (active) setError('Could not load hospital specialists.');
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => { active = false; };
  }, [isPatient, doctorId]);

  useEffect(() => {
    if (!isPatient || !selectedDoctorId || !appointmentDate) return;
    let active = true;
    const loadSlots = async () => {
      try {
        setSlotsLoading(true);
        const res = await opdService.getDoctorSlots(selectedDoctorId, appointmentDate);
        if (active) setSlotsData(res || { is_on_leave: false, leave_reason: null, slots: [] });
      } catch {
        if (active) setSlotsData({ is_on_leave: false, leave_reason: null, slots: [] });
      } finally {
        if (active) setSlotsLoading(false);
      }
    };
    loadSlots();
    return () => { active = false; };
  }, [isPatient, selectedDoctorId, appointmentDate]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isPatient) return <Navigate to="/dashboard" replace />;

  const selectedDoctor = doctors.find((d) => String(d.id) === String(selectedDoctorId));
  const estWaitMins = (selectedDoctor?.waiting_patients_count || 0) * (selectedDoctor?.avg_consult_minutes || 15);

  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    if (!selectedDoctorId) {
      setError('Please select a consulting specialist.');
      return;
    }

    submittingRef.current = true;
    try {
      setSubmitting(true);
      const token = await opdService.generateToken({
        doctor: parseInt(selectedDoctorId, 10),
        priority,
        symptoms: symptoms.trim(),
        appointment_date: appointmentDate,
        time_slot: timeSlot,
      });
      setConfirmedToken(token);
    } catch (err) {
      const data = err.response?.data;
      if (data?.non_field_errors?.[0]) setError(data.non_field_errors[0]);
      else if (data?.appointment_date) setError(Array.isArray(data.appointment_date) ? data.appointment_date[0] : data.appointment_date);
      else if (data?.time_slot) setError(Array.isArray(data.time_slot) ? data.time_slot[0] : data.time_slot);
      else if (data?.doctor) setError(Array.isArray(data.doctor) ? data.doctor[0] : data.doctor);
      else if (typeof data === 'string') setError(data);
      else setError(data?.detail || 'Failed to book OPD slot. Please verify inputs.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (confirmedToken) {
    return (
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-2xl mx-auto editorial-card p-6 sm:p-8 space-y-6 border-emerald-200">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-hairline">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-clinical-success font-mono text-[11px] font-bold border border-emerald-200">
                CONFIRMED • QR PASS ISSUED
              </span>
              <h1 className="font-display text-2xl font-bold text-ink mt-2">
                {confirmedToken.is_advance_booking ? 'Advance Slot Reserved' : 'Live OPD Token Generated'}
              </h1>
              <p className="text-xs text-muted mt-1">
                SMS proximity reminder triggers automatically when you are 3 positions away.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-hairline shrink-0">
              <QRCodeSVG value={`SMARTCARE-TOKEN:${confirmedToken.token_code}`} size={72} level="M" />
            </div>
          </div>

          <div className="p-6 rounded-xl bg-cobalt-tint/50 border border-cobalt/20 text-center space-y-2">
            <p className="font-mono text-[11px] font-bold text-cobalt uppercase tracking-wider">Assigned OPD Token</p>
            <p className="font-mono text-4xl font-bold text-ink tracking-tight">{confirmedToken.token_code}</p>
            <p className="text-xs font-semibold text-muted">
              {confirmedToken.appointment_date} {confirmedToken.time_slot ? `• ${confirmedToken.time_slot}` : '• Live Walk-In Queue'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="editorial-surface p-3">
              <span className="block font-mono text-[10px] text-muted uppercase">Doctor</span>
              <span className="font-bold text-ink mt-0.5 block truncate">{confirmedToken.doctor_name}</span>
            </div>
            <div className="editorial-surface p-3">
              <span className="block font-mono text-[10px] text-muted uppercase">Clinic Room</span>
              <span className="font-mono font-bold text-cobalt mt-0.5 block">{confirmedToken.room_number || 'OPD-101'}</span>
            </div>
            <div className="editorial-surface p-3">
              <span className="block font-mono text-[10px] text-muted uppercase">Queue Position</span>
              <span className="font-mono font-bold text-ink mt-0.5 block">#{confirmedToken.queue_position ?? 1}</span>
            </div>
            <div className="editorial-surface p-3">
              <span className="block font-mono text-[10px] text-muted uppercase">Est. Wait</span>
              <span className="font-mono font-bold text-clinical-success mt-0.5 block">~{confirmedToken.estimated_wait_minutes ?? 10}m</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/patient/tokens')}
              className="flex-1 editorial-btn-primary py-3 text-sm"
            >
              Open Digital QR Passes →
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmedToken(null);
                setSymptoms('');
              }}
              className="editorial-btn-secondary py-3 text-sm"
            >
              Book Another Slot
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="editorial-eyebrow">Step 2 · Slot Reservation &amp; Priority Checkout</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-clinical-warning font-mono text-[10px] font-semibold">
              Leave Guard Active
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Reserve OPD Consultation Slot
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Choose consultation priority, verified date &amp; open time slot—no cramped dialog boxes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/patient/book-token')} className="editorial-btn-secondary">
            ← Compare Queues
          </button>
          <button type="button" onClick={() => navigate('/patient/doctors')} className="editorial-btn-secondary">
            Doctor Directory
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 border-l-4 border-l-clinical-danger text-xs font-semibold text-clinical-danger">
          {error}
        </div>
      )}

      {pageLoading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt" />
        </div>
      ) : (
        <form onSubmit={handleConfirmBooking} className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6 items-start">
          {/* Left Configuration Column */}
          <div className="space-y-5">
            {/* Card 1: Doctor & Priority */}
            <div className="editorial-card p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-cobalt-tint text-cobalt font-display font-bold text-sm flex items-center justify-center shrink-0">
                    {(selectedDoctor?.doctor_name || 'DR').replace(/^Dr\.\s*/i, '').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-ink truncate">
                      {selectedDoctor ? `${selectedDoctor.doctor_name} • ${selectedDoctor.department_name || 'OPD'}` : 'Select Consulting Doctor'}
                    </h2>
                    <p className="text-xs text-muted">
                      {selectedDoctor
                        ? `${selectedDoctor.room_number || 'Room 101'} • Avg ${selectedDoctor.avg_consult_minutes || 15}m • Fee ₹${selectedDoctor.consultation_fee}`
                        : 'Pick a specialist below to load live slots'}
                    </p>
                  </div>
                </div>

                <div className="sm:w-80 shrink-0">
                  <select
                    aria-label="Select consulting doctor"
                    value={selectedDoctorId}
                    onChange={(e) => {
                      setSelectedDoctorId(e.target.value);
                      setTimeSlot('');
                      setError('');
                    }}
                    className="editorial-input text-xs font-semibold"
                  >
                    <option value="">Select Specialist</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.doctor_name} ({d.waiting_patients_count || 0} waiting)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-ink">Queue Priority Tier</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {PRIORITY_OPTIONS.map((opt) => {
                    const active = priority === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPriority(opt.id)}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          active ? `${opt.activeCls} ring-1 ring-current/20` : 'bg-white border-hairline hover:bg-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{opt.label}</span>
                          {active && <span className="font-mono text-[10px] font-bold">✓</span>}
                        </div>
                        <p className="text-[11px] opacity-80 mt-1">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 2: Date Picker + Leave Guard */}
            <div className="editorial-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-bold text-ink">Select Appointment Date (Next 30 Days)</h2>
                  <p className="text-[11px] text-muted">Quick-pick next 7 days or choose a custom date.</p>
                </div>
                <input
                  type="date"
                  min={todayStr}
                  max={maxDateStr}
                  value={appointmentDate}
                  onChange={(e) => {
                    setAppointmentDate(e.target.value);
                    setTimeSlot('');
                  }}
                  className="editorial-input w-auto py-1.5 px-3 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-7 gap-2">
                {sevenDays.map((d) => {
                  const selected = appointmentDate === d.iso;
                  const onLeaveThisDay =
                    selectedDoctor?.upcoming_leaves?.some((lv) => d.iso >= lv.start_date && d.iso <= lv.end_date) || false;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => {
                        setAppointmentDate(d.iso);
                        setTimeSlot('');
                      }}
                      className={`py-2.5 px-1 rounded-xl border text-center transition cursor-pointer ${
                        selected
                          ? 'bg-cobalt border-cobalt text-white'
                          : onLeaveThisDay
                          ? 'bg-rose-50 border-rose-200 text-clinical-danger'
                          : 'bg-surface border-hairline text-ink hover:border-cobalt/40'
                      }`}
                    >
                      <span className="block font-mono text-[10px] font-semibold opacity-80">{d.dow}</span>
                      <span className="block font-display text-base font-bold mt-0.5">{d.dayNum}</span>
                      <span className="block text-[10px] font-medium mt-0.5">
                        {onLeaveThisDay ? 'Leave' : d.tag}
                      </span>
                    </button>
                  );
                })}
              </div>

              {slotsData.is_on_leave && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-clinical-danger">
                  Scheduled Leave Notice: Doctor is unavailable on {appointmentDate}
                  {slotsData.leave_reason ? ` (${slotsData.leave_reason})` : ''}. Please pick another date.
                </div>
              )}
            </div>

            {/* Card 3: Consultation Time Slots & Visit Notes */}
            <div className="editorial-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-ink">
                  Available Time Slots • {appointmentDate}
                </h2>
                {slotsLoading && <span className="font-mono text-[11px] text-cobalt">Loading slots...</span>}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={slotsData.is_on_leave}
                  onClick={() => setTimeSlot('')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                    timeSlot === ''
                      ? 'bg-cobalt text-white border-cobalt'
                      : 'bg-surface border-hairline text-ink hover:border-cobalt/40'
                  }`}
                >
                  Walk-In Live Queue (Next Open)
                </button>

                {(slotsData.slots || []).map((slot) => {
                  const chosen = timeSlot === slot.time_slot;
                  return (
                    <button
                      key={slot.time_slot}
                      type="button"
                      disabled={!slot.available || slotsData.is_on_leave}
                      onClick={() => setTimeSlot(slot.time_slot)}
                      className={`px-3.5 py-2 rounded-lg font-mono text-xs font-semibold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        chosen
                          ? 'bg-cobalt text-white border-cobalt'
                          : 'bg-white border-hairline text-ink hover:bg-surface'
                      }`}
                    >
                      {slot.time_slot} ({slot.booked_count}/{slot.capacity})
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Chief Complaint / Visit Notes (Optional)
                </label>
                <textarea
                  rows="3"
                  placeholder="Describe symptoms, follow-up reason, or vitals note for the doctor..."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  className="editorial-input resize-none"
                />
              </div>
            </div>
          </div>

          {/* Right Sticky Booking Summary Rail */}
          <aside className="editorial-card p-6 border-cobalt/30 space-y-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <span className="editorial-eyebrow">Booking Summary</span>
              <span className="px-2.5 py-0.5 rounded-full bg-cobalt-tint text-cobalt font-mono text-[10px] font-bold">
                Instant QR Pass
              </span>
            </div>

            <div className="editorial-surface p-4 space-y-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Patient</span>
                <span className="font-bold text-ink text-right">
                  {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Specialist</span>
                <span className="font-bold text-ink text-right">{selectedDoctor?.doctor_name || '--'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Clinic Room</span>
                <span className="font-semibold text-ink text-right">{selectedDoctor?.room_number || 'OPD-101'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Date &amp; Slot</span>
                <span className="font-mono font-bold text-cobalt text-right">
                  {appointmentDate} • {timeSlot || 'Live Queue'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Priority Tier</span>
                <span className="font-semibold text-ink capitalize">{priority.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Current Wait</span>
                <span className="font-mono font-bold text-clinical-success">
                  {selectedDoctor?.waiting_patients_count || 0} ahead (~{estWaitMins}m)
                </span>
              </div>
              <div className="border-t border-hairline pt-3 flex justify-between items-center">
                <span className="font-bold text-ink">Consultation Fee</span>
                <span className="font-display text-xl font-bold text-ink">
                  ₹{selectedDoctor?.consultation_fee ?? 500}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
              <p className="text-xs font-bold text-clinical-success">SMS Turn Proximity Alert Enabled</p>
              <p className="text-[11px] text-ink leading-relaxed">
                Automatic notification triggers when 3 patients remain ahead of your turn.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedDoctorId || slotsData.is_on_leave}
              className="w-full editorial-btn-primary py-3 text-sm"
            >
              {submitting
                ? 'Issuing Token & QR Pass...'
                : timeSlot || appointmentDate > todayStr
                ? 'Confirm Slot & Issue QR Pass →'
                : 'Generate Live OPD Token →'}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
};

export default BookSlotCheckoutPage;
