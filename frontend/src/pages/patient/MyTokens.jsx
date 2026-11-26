/**
 * src/pages/patient/MyTokens.jsx
 * ------------------------------
 * Comprehensive OPD Token Management for Patients.
 * Displays:
 *  - Token Number & Formatted Code (e.g. MED-001)
 *  - Interactive Scannable QR Code (using qrcode.react)
 *  - Tokens Ahead count (e.g. "2 patients ahead in line")
 *  - Approx Waiting Time = tokens ahead x doctor avg consultation time
 *  - Clinic Room Number & Doctor details
 *  - Token Cancellation & Modal expansion
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import opdService from '../../services/opdService';
import hospitalService from '../../services/hospitalService';
import BookTokenModal from '../../components/opd/BookTokenModal';
import PatientJourneyModal from '../../components/common/PatientJourneyModal';

const MyTokens = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isPatient = Boolean(isAuthenticated && user && user.role === 'patient');

  const [tokens, setTokens] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'history'
  const [showBookModal, setShowBookModal] = useState(false);
  const [enlargedToken, setEnlargedToken] = useState(null);
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [journeyModalOpen, setJourneyModalOpen] = useState(false);
  const [journeyPatientId, setJourneyPatientId] = useState(null);
  const [ratingToken, setRatingToken] = useState(null);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState('');

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
  };

  const loadData = async () => {
    try {
      const [tokenData, docData] = await Promise.all([
        opdService.getMyTokens(),
        hospitalService.getDoctors({ available: true }),
      ]);
      setTokens(tokenData);
      setDoctors(docData);
    } catch (err) {
      console.error('Failed to load patient tokens', err);
      showAlert('error', 'Could not load your tokens. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isPatient) return;
    loadData();
    // Real-time live queue polling every 5 seconds (no reload needed)
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isPatient]);

  // Defensive Guard: Only Patients can view personal tokens
  if (authLoading) {
    return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  }
  if (!isPatient) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmitRating = async (e) => {
    e.preventDefault();
    if (!ratingToken) return;
    try {
      await hospitalService.submitFeedback({
        doctor: ratingToken.doctor,
        token: ratingToken.id,
        rating: ratingVal,
        comment: ratingComment,
      });
      showAlert('success', `Thank you! Submitted ${ratingVal}/5 rating for ${ratingToken.doctor_name}.`);
      setRatingToken(null);
      setRatingComment('');
      loadData();
    } catch (err) {
      showAlert('error', err.response?.data?.detail || 'Could not submit doctor rating.');
    }
  };

  const handleCancelToken = async (tokenId, tokenCode) => {
    if (!window.confirm(`Are you sure you want to cancel token ${tokenCode}?`)) return;
    try {
      await opdService.cancelToken(tokenId);
      showAlert('success', `Token ${tokenCode} cancelled.`);
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('error', 'Failed to cancel token.');
    }
  };

  // Filter tokens
  const filteredTokens = tokens.filter((t) => {
    if (filter === 'active') return ['waiting', 'called', 'in_progress'].includes(t.status);
    if (filter === 'history') return t.status === 'completed' || t.status === 'cancelled' || t.status === 'skipped';
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'waiting':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'emergency':
        return 'bg-red-100 text-red-800 border-red-300 font-bold';
      case 'senior_citizen':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <span className="editorial-eyebrow">Step 3 · Digital OPD Passes &amp; Live Queue</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            My Consultation Passes
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Auto-refreshes every 5 seconds. Present your QR code at the clinic door when called.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {tokens.length > 0 && tokens[0]?.patient && (
            <button
              type="button"
              onClick={() => {
                setJourneyPatientId(tokens[0].patient);
                setJourneyModalOpen(true);
              }}
              className="editorial-btn-secondary"
            >
              Care Timeline
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/records')}
            className="editorial-btn-secondary"
          >
            Rx &amp; Lab Reports
          </button>
          <button
            type="button"
            onClick={() => navigate('/patient/book-token')}
            className="editorial-btn-primary"
          >
            + Book OPD Token
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {alert.message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-clinical-success border-emerald-200'
              : 'bg-rose-50 text-clinical-danger border-rose-200'
          }`}
        >
          <span>{alert.message}</span>
          <button type="button" onClick={() => setAlert({ type: '', message: '' })} className="font-bold text-muted hover:text-ink cursor-pointer">
            ×
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-hairline">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            filter === 'all'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          All Tokens ({tokens.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('active')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            filter === 'active'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Active Queue ({tokens.filter((t) => ['waiting', 'called', 'in_progress'].includes(t.status)).length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('history')}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition cursor-pointer ${
            filter === 'history'
              ? 'border-cobalt text-cobalt'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Past / Completed
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt"></div>
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className="editorial-card p-12 text-center space-y-3">
          <h3 className="font-display text-lg font-bold text-ink">No consultation tokens found</h3>
          <p className="text-xs text-muted">
            Select a specialist doctor to generate your same-day or advance OPD token.
          </p>
          <button
            type="button"
            onClick={() => navigate('/patient/book-token')}
            className="editorial-btn-primary"
          >
            Book OPD Token Now →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTokens.map((token) => {
            const tokensAhead = token.tokens_ahead !== undefined ? token.tokens_ahead : Math.max(0, (token.queue_position || 1) - 1);
            const approxWaitTime = tokensAhead * (token.avg_consult_minutes || 15);
            const qrPayload = token.qr_data || `SMARTCARE|TOKEN:${token.token_code}|PATIENT:${token.patient_code || 'PAT'}|ROOM:${token.room_number || 'OPD'}|DATE:${token.appointment_date}`;

            const priorityBorder =
              token.priority === 'emergency'
                ? 'border-l-4 border-l-clinical-danger'
                : token.priority === 'senior_citizen'
                ? 'border-l-4 border-l-clinical-warning'
                : 'border-l-4 border-l-cobalt';

            return (
              <div
                key={token.id}
                className={`editorial-card-interactive p-6 flex flex-col justify-between relative overflow-hidden ${priorityBorder}`}
              >
                <div>
                  {/* Top Bar: Date, Priority & Status */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-mono text-xs font-medium text-muted">
                      {token.appointment_date} {token.time_slot ? `· ${token.time_slot}` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded border ${getPriorityBadge(token.priority)}`}>
                        {token.priority.replace('_', ' ')}
                      </span>
                      <span className={`font-mono text-[10px] uppercase px-2.5 py-0.5 rounded border font-semibold ${getStatusBadge(token.status)}`}>
                        {token.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Token Info & QR Code Row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                        OPD Consultation Pass
                      </span>
                      <div className="font-mono text-3xl sm:text-4xl font-bold text-cobalt tracking-tight my-1">
                        {token.token_code}
                      </div>
                      <div className="font-mono text-[11px] text-muted">
                        Queue Ticket #{token.token_number}
                      </div>

                      <div className="mt-3">
                        <h3 className="font-display text-base font-bold text-ink leading-tight truncate">
                          {token.doctor_name}
                        </h3>
                        <p className="text-xs text-muted mt-0.5">
                          {token.department_name} · <span className="font-mono font-semibold text-ink">{token.room_number || 'Room 101'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Scannable QR Code */}
                    <button
                      type="button"
                      onClick={() => setEnlargedToken(token)}
                      className="cursor-pointer p-2.5 bg-white border border-hairline rounded-xl hover:border-cobalt transition text-center group shrink-0"
                      title="Click to enlarge QR Pass"
                    >
                      <QRCodeSVG
                        value={qrPayload}
                        size={80}
                        level="M"
                        includeMargin={false}
                      />
                      <span className="block font-mono text-[9px] text-muted mt-1.5 font-semibold group-hover:text-cobalt uppercase">
                        Enlarge QR ↗
                      </span>
                    </button>
                  </div>

                  {/* Live Waiting Estimate Box */}
                  {token.status === 'waiting' && (
                    <div className="mt-5 p-4 rounded-xl bg-surface border border-hairline space-y-2.5">
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="bg-white p-2.5 rounded-lg border border-hairline">
                          <span className="block font-mono text-[10px] text-muted uppercase font-semibold">
                            Patients Ahead
                          </span>
                          <span className="font-display text-xl font-bold text-ink mt-0.5 block">
                            {tokensAhead === 0 ? (
                              <span className="text-clinical-success">You&apos;re Next</span>
                            ) : (
                              `${tokensAhead} Ahead`
                            )}
                          </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-hairline">
                          <span className="block font-mono text-[10px] text-muted uppercase font-semibold">
                            Est. Wait Time
                          </span>
                          <span className="font-display text-xl font-bold text-cobalt mt-0.5 block">
                            ~{approxWaitTime} mins
                          </span>
                        </div>
                      </div>

                      <div className="text-center font-mono text-[10px] text-muted">
                        {tokensAhead} patient(s) ahead × {token.avg_consult_minutes || 15}m avg visit
                      </div>
                    </div>
                  )}

                  {/* Active In-Progress Banner */}
                  {(token.status === 'in_progress' || token.status === 'called') && (
                    <div className="mt-5 p-4 bg-cobalt-tint/60 border border-cobalt/30 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <p className="font-display text-sm font-bold text-cobalt">
                          Please proceed to {token.room_number || 'Room 101'}
                        </p>
                        <p className="text-xs text-ink mt-0.5">
                          Doctor has called your token into the consultation room.
                        </p>
                      </div>
                      <span className="font-mono text-[10px] font-bold px-2 py-1 rounded bg-cobalt text-white uppercase shrink-0">
                        Now Calling
                      </span>
                    </div>
                  )}

                  {/* Active Inpatient Admission Banner */}
                  {token.active_admission && (
                    <div className="mt-4 p-3 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-semibold text-red-900">
                        Admitted: {token.active_admission.ward_name} · Bed {token.active_admission.bed_number}
                      </span>
                      <span className="font-mono px-2 py-0.5 rounded bg-clinical-danger text-white font-bold text-[10px] uppercase">
                        Inpatient
                      </span>
                    </div>
                  )}

                  {token.symptoms && (
                    <p className="mt-3 text-xs text-muted bg-surface px-3 py-2 rounded-lg border border-hairline">
                      <span className="font-semibold text-ink">Reason: </span>“{token.symptoms}”
                    </p>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-5 pt-3.5 border-t border-hairline flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEnlargedToken(token)}
                      className="text-xs font-semibold text-cobalt hover:underline cursor-pointer"
                    >
                      Digital Pass Slip
                    </button>
                    {token.patient && (
                      <button
                        type="button"
                        onClick={() => {
                          setJourneyPatientId(token.patient);
                          setJourneyModalOpen(true);
                        }}
                        className="editorial-btn-secondary py-1 px-2.5 text-[11px]"
                        title="View Complete Care Journey"
                      >
                        Care Journey
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {token.status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => handleCancelToken(token.id, token.token_code)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-clinical-danger border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                      >
                        Cancel Token
                      </button>
                    )}
                    {(token.status === 'completed' || token.status === 'admitted') && !token.has_feedback && (
                      <button
                        type="button"
                        onClick={() => {
                          setRatingToken(token);
                          setRatingVal(5);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-clinical-warning border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                      >
                        ★ Rate Visit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── DIGITAL TOKEN PASS MODAL (WITH LARGE QR CODE) ─── */}
      {enlargedToken && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="editorial-card max-w-sm w-full p-6 sm:p-7 text-center shadow-2xl relative">
            <button
              type="button"
              onClick={() => setEnlargedToken(null)}
              className="print-hidden absolute top-4 right-4 text-muted hover:text-ink text-xl font-bold cursor-pointer"
            >
              ×
            </button>

            <span className="editorial-eyebrow block">
              OPD Consultation Pass
            </span>
            <div className="text-4xl font-bold text-cobalt tracking-tight font-mono my-2">
              {enlargedToken.token_code}
            </div>

            <div className="inline-block px-3 py-0.5 bg-surface text-ink border border-hairline font-mono text-[10px] font-bold uppercase rounded-full mb-4">
              Status: {enlargedToken.status}
            </div>

            <div className="p-4 bg-white border border-hairline rounded-xl inline-block mb-3">
              <QRCodeSVG
                value={
                  enlargedToken.qr_data ||
                  `SMARTCARE|TOKEN:${enlargedToken.token_code}|PATIENT:${enlargedToken.patient_code}|ROOM:${enlargedToken.room_number}`
                }
                size={180}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="text-[11px] text-muted font-mono mb-4">
              Scan barcode at clinic door for digital check-in
            </p>

            <div className="bg-surface p-3.5 rounded-xl border border-hairline text-left text-xs space-y-1.5 mb-5">
              <div className="flex justify-between">
                <span className="text-muted">Doctor</span>
                <span className="font-semibold text-ink">{enlargedToken.doctor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Clinic Room</span>
                <span className="font-mono font-bold text-cobalt">{enlargedToken.room_number || 'Room 101'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Date</span>
                <span className="font-mono text-ink">{enlargedToken.appointment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Priority</span>
                <span className="font-mono font-semibold uppercase text-ink">{enlargedToken.priority.replace('_', ' ')}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="print-hidden w-full editorial-btn-primary py-2.5"
            >
              Print Token Pass
            </button>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookModal && (
        <BookTokenModal
          doctors={doctors}
          onClose={() => setShowBookModal(false)}
          onSuccess={loadData}
        />
      )}

      {/* Universal Patient Journey Modal */}
      <PatientJourneyModal
        isOpen={journeyModalOpen}
        onClose={() => setJourneyModalOpen(false)}
        patientId={journeyPatientId}
      />

      {/* Rate Doctor Modal */}
      {ratingToken && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="editorial-card max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="pb-3 border-b border-hairline">
              <span className="editorial-eyebrow">Patient Feedback</span>
              <h3 className="font-display text-lg font-bold text-ink mt-0.5">Rate Your Consultation</h3>
              <p className="text-xs text-muted">
                {ratingToken.doctor_name} · Token <span className="font-mono font-semibold text-ink">{ratingToken.token_code}</span>
              </p>
            </div>
            <form onSubmit={handleSubmitRating} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-2">Rating (1 to 5 Stars)</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRatingVal(num)}
                      className={`py-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        ratingVal >= num
                          ? 'bg-amber-50 border-clinical-warning text-clinical-warning'
                          : 'bg-surface border-hairline text-muted'
                      }`}
                    >
                      ★ {num}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Feedback Comment</label>
                <textarea
                  rows="3"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Share your consultation experience..."
                  className="editorial-input resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <button type="button" onClick={() => setRatingToken(null)} className="editorial-btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="editorial-btn-primary">
                  Submit Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTokens;
