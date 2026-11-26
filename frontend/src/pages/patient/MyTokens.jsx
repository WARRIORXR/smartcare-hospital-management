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

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert({ type: '', message: '' }), 4000);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
              📱 Digital Patient Pass
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              My OPD Consultation Tokens
            </h1>
            <p className="mt-1 text-blue-100 text-sm">
              Live wait times calculated dynamically: <em>Tokens Ahead × Doctor Consultation Duration</em>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {tokens.length > 0 && tokens[0]?.patient && (
              <button
                onClick={() => {
                  setJourneyPatientId(tokens[0].patient);
                  setJourneyModalOpen(true);
                }}
                className="inline-flex items-center px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs border border-white/20 shadow-xs transition"
              >
                <span className="mr-1.5 text-base">📜</span> My Medical Journey
              </button>
            )}
            <button
              onClick={() => navigate('/patient/book-token')}
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-white text-blue-900 font-bold text-xs shadow-md hover:bg-blue-50 transition"
            >
              <span className="mr-1.5 text-base">+</span> Book Token by Department
            </button>
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {alert.message && (
        <div
          className={`mb-6 p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{alert.message}</span>
          <button onClick={() => setAlert({ type: '', message: '' })} className="font-bold text-gray-500 hover:text-gray-800">
            ×
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All Tokens ({tokens.length})
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active Queue ({tokens.filter((t) => ['waiting', 'called', 'in_progress'].includes(t.status)).length})
        </button>
        <button
          onClick={() => setFilter('history')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            filter === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Past / Completed
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-200">
          <span className="text-4xl block mb-2">🎟️</span>
          <h3 className="text-lg font-bold text-gray-800">No consultation tokens found</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Select a specialist doctor to generate your token.
          </p>
          <button
            onClick={() => navigate('/patient/book-token')}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition"
          >
            Book OPD Token Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTokens.map((token) => {
            const tokensAhead = token.tokens_ahead !== undefined ? token.tokens_ahead : Math.max(0, (token.queue_position || 1) - 1);
            const approxWaitTime = tokensAhead * (token.avg_consult_minutes || 15);
            const qrPayload = token.qr_data || `SMARTCARE|TOKEN:${token.token_code}|PATIENT:${token.patient_code || 'PAT'}|ROOM:${token.room_number || 'OPD'}|DATE:${token.appointment_date}`;

            return (
              <div
                key={token.id}
                className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition flex flex-col justify-between relative overflow-hidden"
              >
                <div>
                  {/* Top Bar: Date, Priority & Status */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-semibold text-gray-400">
                      📅 {token.appointment_date}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${getPriorityBadge(token.priority)}`}>
                        {token.priority.replace('_', ' ')}
                      </span>
                      <span className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full border font-bold ${getStatusBadge(token.status)}`}>
                        {token.status}
                      </span>
                    </div>
                  </div>

                  {/* Token Info & QR Code Row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">
                        OPD Consultation Token
                      </span>
                      <div className="text-4xl font-extrabold text-blue-700 tracking-wider font-mono my-1">
                        {token.token_code}
                      </div>
                      <div className="text-xs text-gray-500 font-medium">
                        Token #{token.token_number}
                      </div>

                      <div className="mt-3">
                        <h3 className="text-lg font-bold text-gray-900 leading-tight">
                          {token.doctor_name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {token.department_name} • <strong className="text-blue-700">📍 {token.room_number || 'Room 101'}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Scannable QR Code */}
                    <div
                      onClick={() => setEnlargedToken(token)}
                      className="cursor-pointer p-2.5 bg-white border border-gray-200 rounded-2xl shadow-2xs hover:border-blue-500 transition text-center group"
                      title="Click to enlarge QR Code"
                    >
                      <QRCodeSVG
                        value={qrPayload}
                        size={84}
                        level="M"
                        includeMargin={false}
                      />
                      <span className="block text-[9px] text-gray-400 mt-1 font-bold group-hover:text-blue-600">
                        Scan at OPD ↗
                      </span>
                    </div>
                  </div>

                  {/* ─── LIVE TOKENS AHEAD & APPROX WAITING TIME ─── */}
                  {token.status === 'waiting' && (
                    <div className="mt-5 p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/70 border border-amber-200">
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-amber-100">
                          <span className="block text-[10px] text-amber-800 uppercase font-bold tracking-wider">
                            Patients Ahead of You
                          </span>
                          <span className="text-xl font-extrabold text-amber-900 mt-0.5 block">
                            {tokensAhead === 0 ? (
                              <span className="text-emerald-700">You're Next! 🎉</span>
                            ) : (
                              `${tokensAhead} Ahead`
                            )}
                          </span>
                        </div>

                        <div className="bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-amber-100">
                          <span className="block text-[10px] text-amber-800 uppercase font-bold tracking-wider">
                            Approx. Waiting Time
                          </span>
                          <span className="text-xl font-extrabold text-blue-700 mt-0.5 block">
                            ⏱️ ~{approxWaitTime} mins
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 text-center text-[11px] text-amber-800 font-medium">
                        Formula: {tokensAhead} patient(s) ahead × {token.avg_consult_minutes || 15} mins/patient = ~{approxWaitTime} mins
                      </div>
                    </div>
                  )}

                  {/* Active In-Progress Banner */}
                  {token.status === 'in_progress' && (
                    <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                      <div className="text-blue-800 font-bold text-sm">
                        🔔 Token Called! Please proceed to {token.room_number || 'Room 101'}
                      </div>
                      <p className="text-xs text-blue-600 mt-1">
                        Doctor is currently consulting with your token.
                      </p>
                    </div>
                  )}

                  {/* Active Inpatient Admission Banner */}
                  {token.active_admission && (
                    <div className="mt-4 p-3 bg-rose-50/80 border border-rose-200 rounded-2xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-rose-900 font-bold">
                        <span className="text-base">🛏️</span>
                        <span>Admitted: {token.active_admission.ward_name} (Bed {token.active_admission.bed_number})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px] uppercase tracking-wider">
                        Inpatient
                      </span>
                    </div>
                  )}

                  {/* Symptoms description */}
                  {token.symptoms && (
                    <p className="mt-3 text-xs text-gray-500 italic bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      Reason: "{token.symptoms}"
                    </p>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-5 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEnlargedToken(token)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                      View Digital Pass Slip
                    </button>
                    {token.patient && (
                      <button
                        onClick={() => {
                          setJourneyPatientId(token.patient);
                          setJourneyModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition"
                        title="View Complete Care Journey (OPD -> Bed -> Blood)"
                      >
                        <span>📜</span> Journey
                      </button>
                    )}
                  </div>

                  {token.status === 'waiting' && (
                    <button
                      onClick={() => handleCancelToken(token.id, token.token_code)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition cursor-pointer"
                    >
                      Cancel Token
                    </button>
                  )}
                  {(token.status === 'completed' || token.status === 'admitted') && !token.has_feedback && (
                    <button
                      onClick={() => {
                        setRatingToken(token);
                        setRatingVal(5);
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                    >
                      ⭐ Rate Doctor
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── DIGITAL TOKEN PASS MODAL (WITH LARGE QR CODE) ─── */}
      {enlargedToken && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border border-gray-100 relative">
            <button
              onClick={() => setEnlargedToken(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-2xl font-bold"
            >
              ×
            </button>

            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Hospital Admission & OPD Pass
            </span>
            <div className="text-4xl font-black text-blue-700 tracking-wider font-mono my-2">
              {enlargedToken.token_code}
            </div>

            <div className="inline-block px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold rounded-full mb-4">
              Status: {enlargedToken.status.toUpperCase()}
            </div>

            {/* Large QR Code for phone scan */}
            <div className="p-4 bg-white border border-gray-200 rounded-2xl inline-block shadow-xs mb-4">
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
            <p className="text-[11px] text-gray-400 font-mono mb-4">
              Scan barcode at clinic door for digital check-in
            </p>

            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-left text-xs space-y-1 mb-5">
              <div className="flex justify-between">
                <span className="text-gray-400">Doctor:</span>
                <span className="font-bold text-gray-800">{enlargedToken.doctor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Clinic Room:</span>
                <span className="font-bold text-blue-700">📍 {enlargedToken.room_number || 'Room 101'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Date:</span>
                <span className="font-medium text-gray-800">{enlargedToken.appointment_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Priority:</span>
                <span className="font-bold uppercase text-gray-800">{enlargedToken.priority.replace('_', ' ')}</span>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gray-900 hover:bg-black text-white transition shadow-sm"
            >
              🖨️ Print Token Pass
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">⭐ Rate Consultation</h3>
            <p className="text-xs text-slate-500 mb-4">
              {ratingToken.doctor_name} • Token {ratingToken.token_code}
            </p>
            <form onSubmit={handleSubmitRating} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Rating (1 to 5 Stars)</label>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRatingVal(num)}
                      className={`px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${
                        ratingVal >= num ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      ★ {num}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Feedback Comment</label>
                <textarea
                  rows="3"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Share your consultation experience..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button type="button" onClick={() => setRatingToken(null)} className="px-4 py-2 text-xs text-slate-600 rounded-xl hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl">
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
