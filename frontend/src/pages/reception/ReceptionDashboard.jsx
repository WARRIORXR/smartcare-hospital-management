/**
 * src/pages/reception/ReceptionDashboard.jsx
 * ------------------------------------------
 * Editorial Clinical Front-Desk Reception Portal:
 *  - Walk-In OPD Token Issuance on behalf of registered patients (with priority pills)
 *  - Live 5s-polling hospital OPD token board
 *  - Direct shortcuts to Ward Admissions (/beds) and Billing & PDF Receipts (/billing)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

const PRIORITY_OPTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'senior_citizen', label: 'Senior' },
  { id: 'emergency', label: 'Emergency' },
];

const ReceptionDashboard = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const isAuthorizedReception = Boolean(
    isAuthenticated && user && ['reception', 'admin'].includes(user.role)
  );

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const submittingRef = useRef(false);

  const [formData, setFormData] = useState({
    patient: '',
    doctor: '',
    priority: 'normal',
    symptoms: '',
  });

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [pats, docs, toks] = await Promise.all([
        hospitalService.getPatients(),
        hospitalService.getDoctors({ available: true }),
        opdService.getTokens(),
      ]);
      setPatients(pats || []);
      setDoctors(docs || []);
      setTokens(toks || []);
    } catch (err) {
      console.error('Reception load error', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorizedReception) return;
    loadData(false);
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, [isAuthorizedReception, loadData]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isAuthorizedReception) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleIssueToken = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMsg({ type: '', text: '' });
    try {
      setSubmitting(true);
      const created = await opdService.generateToken({
        patient: parseInt(formData.patient),
        doctor: parseInt(formData.doctor),
        priority: formData.priority,
        symptoms: formData.symptoms,
      });
      setMsg({ type: 'success', text: `Walk-in token ${created.token_code} issued cleanly.` });
      setFormData({ patient: '', doctor: '', priority: 'normal', symptoms: '' });
      await loadData(true);
    } catch (err) {
      const data = err.response?.data;
      setMsg({
        type: 'error',
        text: data?.non_field_errors?.[0] || data?.doctor?.[0] || data?.detail || 'Could not generate token.',
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="editorial-eyebrow">{t('receptionPortal')} · LIVE 5S QUEUE</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Front-Desk Operations
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Signed in as <span className="font-semibold text-ink">{user.first_name || user.username}</span>. Issue walk-in OPD tokens, coordinate inpatient beds, and generate billing receipts.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button type="button" onClick={() => navigate('/beds')} className="editorial-btn-secondary">
            Ward Admissions
          </button>
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-clinical-success hover:opacity-95 text-white text-xs font-semibold transition cursor-pointer"
          >
            Billing &amp; PDF Receipts
          </button>
        </div>
      </div>

      {msg.text && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-clinical-success'
              : 'bg-rose-50 border-rose-200 text-clinical-danger'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* Issue Walk-in Token Card */}
        <div className="editorial-surface p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-ink">Issue Walk-In OPD Token</h2>
          <form onSubmit={handleIssueToken} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Registered Patient *</label>
              <select
                required
                value={formData.patient}
                onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                className="editorial-input"
              >
                <option value="">Select Patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.user?.first_name} {p.user?.last_name} ({p.patient_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">On-Duty Doctor *</label>
              <select
                required
                value={formData.doctor}
                onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                className="editorial-input"
              >
                <option value="">Select Doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.doctor_name} · {d.room_number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Priority</label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITY_OPTIONS.map((opt) => {
                  const selected = formData.priority === opt.id;
                  const isEmergency = opt.id === 'emergency';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, priority: opt.id })}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        selected
                          ? isEmergency
                            ? 'border-clinical-danger bg-rose-50 text-clinical-danger'
                            : 'border-cobalt bg-cobalt-tint text-cobalt'
                          : isEmergency
                          ? 'border-hairline bg-white text-clinical-danger hover:bg-rose-50/40'
                          : 'border-hairline bg-white text-muted hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Chief Complaint</label>
              <textarea
                rows="3"
                value={formData.symptoms}
                onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                placeholder="Brief walk-in notes..."
                className="editorial-input resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full editorial-btn-primary py-2.5"
            >
              {submitting ? 'Generating...' : 'Issue OPD Token'}
            </button>
          </form>
        </div>

        {/* Today's Live OPD Queue Table */}
        <div className="editorial-card overflow-hidden">
          <div className="px-6 py-4 border-b border-hairline flex flex-wrap justify-between items-center gap-2">
            <h2 className="font-display text-base font-bold text-ink">Today&apos;s Live OPD Queue Desk</h2>
            <span className="font-mono text-[11px] font-semibold text-clinical-success uppercase">
              {tokens.length} ACTIVE TOKENS · {t('liveQueueActive')}
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted text-xs">Loading live tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs">No tokens issued yet today.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface border-b border-hairline font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-3 px-5">Token</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Doctor</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-5 text-right">Next Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {tokens.map((tok) => (
                    <tr key={tok.id} className="hover:bg-surface/50 transition">
                      <td className="py-3.5 px-5 font-mono font-bold text-cobalt">{tok.token_code}</td>
                      <td className="py-3.5 px-4 font-semibold text-ink">{tok.patient_name}</td>
                      <td className="py-3.5 px-4 text-muted">{tok.doctor_name}</td>
                      <td className={`py-3.5 px-4 capitalize font-semibold ${
                        tok.priority === 'emergency'
                          ? 'text-clinical-danger'
                          : tok.priority === 'senior_citizen'
                          ? 'text-clinical-warning'
                          : 'text-muted'
                      }`}>
                        {tok.priority.replace('_', ' ')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-mono text-[10px] font-bold uppercase ${
                          tok.status === 'called' || tok.status === 'in_progress'
                            ? 'text-cobalt'
                            : tok.status === 'completed'
                            ? 'text-clinical-success'
                            : 'text-muted'
                        }`}>
                          {tok.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/billing?patient=${tok.patient}&token=${tok.id}&new=1`)}
                          className="font-mono text-[11px] font-semibold text-cobalt hover:underline cursor-pointer"
                        >
                          Invoice →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceptionDashboard;
