/**
 * src/pages/records/MedicalRecordsPage.jsx
 * ----------------------------------------
 * Module 4: Prescriptions, Visit Notes & Lab Reports (with secure file upload/download).
 * Supports URL pre-filling via ?patient=<id>&new=1 from Doctor Consultation Room.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';

const MedicalRecordsPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isAuthorizedRecords = Boolean(
    isAuthenticated && user && ['patient', 'doctor', 'admin'].includes(user.role)
  );
  const isClinician = user?.role === 'doctor' || user?.role === 'admin' || user?.is_staff;

  const urlPatientId = searchParams.get('patient') || '';
  const urlOpenNew = searchParams.get('new') === '1';

  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const submittingRef = useRef(false);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    patient: urlPatientId,
    record_type: 'prescription',
    title: '',
    diagnosis: '',
    visit_notes: '',
    medicineName: '',
    dosage: '1 Tablet',
    frequency: 'Twice Daily (BD)',
    duration: '5 days',
  });
  const [attachment, setAttachment] = useState(null);

  useEffect(() => {
    if (isClinician && urlPatientId) {
      setFormData((prev) => ({ ...prev, patient: urlPatientId }));
      if (urlOpenNew) setShowModal(true);
    }
  }, [isClinician, urlPatientId, urlOpenNew]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const recs = await clinicalService.getRecords();
      setRecords(recs || []);
      if (isClinician) {
        const pats = await hospitalService.getPatients();
        setPatients(pats || []);
      }
    } catch (err) {
      console.error('Failed to load medical records', err);
      setMsg({ type: 'error', text: 'Failed to load medical records.' });
    } finally {
      setLoading(false);
    }
  }, [isClinician]);

  useEffect(() => {
    if (!isAuthorizedRecords) return;
    loadData();
  }, [isAuthorizedRecords, loadData]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isAuthorizedRecords) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMsg({ type: '', text: '' });
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('patient', formData.patient);
      fd.append('record_type', formData.record_type);
      fd.append('title', formData.title);
      fd.append('diagnosis', formData.diagnosis);
      fd.append('visit_notes', formData.visit_notes);

      const rxItems = formData.medicineName.trim()
        ? [{
            medicine: formData.medicineName.trim(),
            dosage: formData.dosage,
            frequency: formData.frequency,
            duration: formData.duration,
          }]
        : [];
      fd.append('prescription_items', JSON.stringify(rxItems));

      if (attachment) {
        fd.append('attachment', attachment);
      }

      await clinicalService.createRecord(fd, true);
      setMsg({ type: 'success', text: 'Medical record saved securely and logged to Audit Trail.' });
      setShowModal(false);
      setAttachment(null);
      setFormData({
        patient: '',
        record_type: 'prescription',
        title: '',
        diagnosis: '',
        visit_notes: '',
        medicineName: '',
        dosage: '1 Tablet',
        frequency: 'Twice Daily (BD)',
        duration: '5 days',
      });
      await loadData();
    } catch (err) {
      console.error('Create record error', err);
      const detail = err.response?.data?.attachment?.[0] || err.response?.data?.detail || 'Failed to save medical record.';
      setMsg({ type: 'error', text: detail });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const filtered = records.filter((r) => {
    if (filterType !== 'all' && r.record_type !== filterType) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.title || '').toLowerCase().includes(q) ||
      (r.diagnosis || '').toLowerCase().includes(q) ||
      (r.patient_name || '').toLowerCase().includes(q) ||
      (r.patient_code || '').toLowerCase().includes(q) ||
      (r.doctor_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <span className="editorial-eyebrow">Clinical Documentation · Audited PHI</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">{t('medicalRecordsTitle')}</h1>
          <p className="text-xs sm:text-sm text-muted">
            {isClinician
              ? 'Write visit notes, prescriptions, and upload encrypted lab reports. Every view is logged.'
              : 'Review your prescriptions, consultation notes, and download verified lab reports.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isClinician ? (
            <>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="editorial-btn-secondary"
              >
                Go to Billing →
              </button>
              <button
                type="button"
                onClick={() => navigate(urlPatientId ? `/records/new?patient=${urlPatientId}` : '/records/new')}
                className="editorial-btn-primary"
              >
                + Write Rx / Lab Record
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/billing')}
              className="editorial-btn-primary"
            >
              View Bills &amp; Receipts →
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: `All Records (${records.length})` },
            { id: 'prescription', label: 'Prescriptions' },
            { id: 'visit_note', label: 'Visit Notes' },
            { id: 'lab_report', label: 'Lab Reports' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                filterType === tab.id
                  ? 'bg-cobalt text-white border-cobalt'
                  : 'bg-white border-hairline text-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search diagnosis, title, doctor, PAT-ID..."
          className="editorial-input py-1.5 px-3 text-xs sm:w-72"
        />
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

      {loading ? (
        <div className="py-16 text-center text-muted text-sm">Loading medical records...</div>
      ) : filtered.length === 0 ? (
        <div className="editorial-card p-12 text-center text-muted text-sm">
          No medical records found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((rec) => (
            <div key={rec.id} className="editorial-card p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      rec.record_type === 'prescription'
                        ? 'bg-cobalt-tint text-cobalt border-cobalt/20'
                        : rec.record_type === 'lab_report'
                        ? 'bg-amber-50 text-clinical-warning border-amber-200'
                        : 'bg-emerald-50 text-clinical-success border-emerald-200'
                    }`}
                  >
                    {rec.record_type_display || rec.record_type}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {new Date(rec.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-base font-bold text-ink">{rec.title}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    Patient: <strong className="text-ink">{rec.patient_name}</strong>{' '}
                    <span className="font-mono">({rec.patient_code})</span> · {rec.doctor_name}
                  </p>
                </div>

                {rec.diagnosis && (
                  <p className="text-xs font-semibold text-ink bg-surface px-3 py-2 rounded-lg border border-hairline">
                    Diagnosis: {rec.diagnosis}
                  </p>
                )}

                {rec.visit_notes && (
                  <p className="text-xs text-muted leading-relaxed">{rec.visit_notes}</p>
                )}

                {Array.isArray(rec.prescription_items) && rec.prescription_items.length > 0 && (
                  <div className="bg-cobalt-tint/40 border border-cobalt/15 rounded-xl p-3.5 space-y-2">
                    <p className="font-mono text-[10px] font-bold uppercase text-cobalt">Medications Prescribed</p>
                    <ul className="space-y-1.5">
                      {rec.prescription_items.map((item, i) => (
                        <li key={i} className="text-xs text-ink flex justify-between gap-2">
                          <span className="font-semibold">{item.medicine}</span>
                          <span className="text-muted font-mono text-[11px]">
                            {item.dosage} · {item.frequency} ({item.duration})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {(rec.has_attachment || isClinician) && (
                <div className="pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-2">
                  {rec.has_attachment ? (
                    <>
                      <span className="text-xs text-muted font-mono truncate max-w-[200px]">
                        {rec.attachment_name || 'Lab Report'}
                      </span>
                      <button
                        type="button"
                        onClick={() => clinicalService.downloadLabReport(rec.id, rec.attachment_name || `report_${rec.id}.pdf`)}
                        className="editorial-btn-secondary py-1.5 px-3"
                      >
                        Download Report ↓
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted">Clinical Entry Saved</span>
                  )}
                  {isClinician && rec.patient && (
                    <button
                      type="button"
                      onClick={() => navigate(`/billing?patient=${rec.patient}&new=1`)}
                      className="text-xs font-semibold text-cobalt hover:underline cursor-pointer"
                    >
                      Generate Invoice →
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && isClinician && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="editorial-card max-w-lg w-full p-6 sm:p-7 shadow-2xl my-8">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-hairline">
              <h3 className="font-display text-lg font-bold text-ink">Create Clinical Record</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-muted hover:text-ink text-xl font-bold cursor-pointer">×</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Patient *</label>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Record Type</label>
                  <select
                    value={formData.record_type}
                    onChange={(e) => setFormData({ ...formData, record_type: e.target.value })}
                    className="editorial-input"
                  >
                    <option value="prescription">Prescription</option>
                    <option value="visit_note">Visit Note</option>
                    <option value="lab_report">Lab Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="e.g. Viral Fever"
                    className="editorial-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Record Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Outpatient Consultation & Prescription"
                  className="editorial-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Clinical Visit Notes</label>
                <textarea
                  rows="2"
                  value={formData.visit_notes}
                  onChange={(e) => setFormData({ ...formData, visit_notes: e.target.value })}
                  placeholder="Observations, vitals, instructions..."
                  className="editorial-input resize-none"
                />
              </div>
              <div className="p-3.5 rounded-xl bg-surface border border-hairline space-y-2.5">
                <p className="font-mono text-[10px] font-bold text-cobalt uppercase tracking-wider">Medication (Optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={formData.medicineName}
                    onChange={(e) => setFormData({ ...formData, medicineName: e.target.value })}
                    placeholder="Medicine name & mg"
                    className="editorial-input py-1.5 px-2.5 text-xs"
                  />
                  <input
                    type="text"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    placeholder="Dosage"
                    className="editorial-input py-1.5 px-2.5 text-xs"
                  />
                  <input
                    type="text"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    placeholder="Frequency"
                    className="editorial-input py-1.5 px-2.5 text-xs"
                  />
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="Duration"
                    className="editorial-input py-1.5 px-2.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Lab Report Attachment (.pdf, .png, .jpg — Max 5MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="w-full text-xs text-muted"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="editorial-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="editorial-btn-primary px-5"
                >
                  {submitting ? 'Saving...' : 'Save Medical Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecordsPage;
