/**
 * src/pages/reception/ReceptionDashboard.jsx
 * ------------------------------------------
 * Dedicated Front-Desk Reception Portal.
 * Fixes previously broken `/reception/dashboard` routing and gives Receptionists:
 *  - Walk-In OPD Token Issuance on behalf of registered patients
 *  - Live 5s-polling hospital OPD token board
 *  - Direct shortcuts to Ward Admissions (/beds), Billing Desk (/billing), and Blood Requests
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

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

  if (authLoading) return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-gradient-to-r from-indigo-700 to-blue-800 rounded-2xl p-6 text-white shadow-md mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 mb-2">
            🧾 {t('receptionPortal')}
          </span>
          <h1 className="text-2xl font-bold">{t('welcome')}, {user.first_name || user.username}</h1>
          <p className="text-xs text-indigo-100 mt-1">
            Issue walk-in OPD tokens, coordinate inpatient beds, and generate patient billing receipts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/beds')} className="px-4 py-2 rounded-xl bg-white text-indigo-900 text-xs font-bold cursor-pointer">
            🛏️ Ward Admissions
          </button>
          <button onClick={() => navigate('/billing')} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer">
            💳 Billing & PDF Receipts
          </button>
        </div>
      </div>

      {msg.text && (
        <div
          className={`mb-5 p-3.5 rounded-xl text-xs font-semibold border ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Issue Walk-in Token Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-3">🎟️ Issue OPD Walk-In Token</h2>
          <form onSubmit={handleIssueToken} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Patient *</label>
              <select
                required
                value={formData.patient}
                onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">On-Duty Doctor *</label>
              <select
                required
                value={formData.doctor}
                onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
              >
                <option value="">Select Doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.doctor_name} ({d.department_name} - {d.room_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
              >
                <option value="normal">Normal</option>
                <option value="senior_citizen">Senior Citizen</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chief Complaint / Notes</label>
              <textarea
                rows="2"
                value={formData.symptoms}
                onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                placeholder="Brief walk-in notes..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Generating...' : 'Issue OPD Token'}
            </button>
          </form>
        </div>

        {/* Today's Live OPD Queue Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-slate-900">📋 Today's OPD Queue Desk</h2>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              🟢 {t('liveQueueActive')}
            </span>
          </div>
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Loading live tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">No tokens issued yet today.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <th className="py-2 pr-3">Token</th>
                    <th className="py-2 pr-3">Patient</th>
                    <th className="py-2 pr-3">Doctor</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tokens.map((tok) => (
                    <tr key={tok.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold text-blue-700">{tok.token_code}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-800">{tok.patient_name}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{tok.doctor_name}</td>
                      <td className="py-2.5 pr-3 capitalize">{tok.priority.replace('_', ' ')}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                          {tok.status}
                        </span>
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
