/**
 * src/pages/records/CreateRecordPage.jsx
 * --------------------------------------
 * Dedicated Clinician E-Prescription, Visit Note & Lab Report Authoring Page (/records/new).
 * Supports multi-row structured medications, diagnosis entry, and encrypted file upload.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';

const RECORD_TYPES = [
  { id: 'prescription', label: 'E-Prescription' },
  { id: 'visit_note', label: 'Visit SOAP Note' },
  { id: 'lab_report', label: 'Lab Report' },
];

const EMPTY_MED_ROW = () => ({
  medicine: '',
  dosage: '1 Tablet',
  frequency: '1-0-1 (Twice Daily)',
  duration: '5 Days',
});

const CreateRecordPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submittingRef = useRef(false);

  const isClinician = Boolean(
    isAuthenticated && user && (['doctor', 'admin'].includes(user.role) || user.is_staff)
  );
  const urlPatientId = searchParams.get('patient') || '';

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    patient: urlPatientId,
    record_type: 'prescription',
    title: '',
    diagnosis: '',
    visit_notes: '',
  });
  const [medications, setMedications] = useState([EMPTY_MED_ROW()]);
  const [attachment, setAttachment] = useState(null);

  useEffect(() => {
    if (!isClinician) return;
    let active = true;
    hospitalService.getPatients()
      .then((pats) => {
        if (!active) return;
        const list = Array.isArray(pats) ? pats : pats?.results || [];
        setPatients(list);
        if (!urlPatientId && list.length > 0) {
          setFormData((prev) => ({ ...prev, patient: prev.patient || String(list[0].id) }));
        }
      })
      .catch(() => {
        if (active) setError('Could not load patient directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isClinician, urlPatientId]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isClinician) return <Navigate to="/records" replace />;

  const handleMedChange = (idx, field, value) => {
    setMedications((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const addMedRow = () => setMedications((prev) => [...prev, EMPTY_MED_ROW()]);

  const removeMedRow = (idx) => {
    setMedications((prev) => (prev.length === 1 ? [EMPTY_MED_ROW()] : prev.filter((_, i) => i !== idx)));
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    if (!formData.patient || !formData.title.trim()) {
      setError('Please select a patient and provide a clinical record title.');
      return;
    }

    submittingRef.current = true;
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('patient', formData.patient);
      fd.append('record_type', formData.record_type);
      fd.append('title', formData.title.trim());
      fd.append('diagnosis', formData.diagnosis.trim());
      fd.append('visit_notes', formData.visit_notes.trim());

      const validMeds = medications
        .filter((m) => m.medicine.trim().length > 0)
        .map((m) => ({
          medicine: m.medicine.trim(),
          dosage: m.dosage.trim() || 'As directed',
          frequency: m.frequency.trim() || 'Once Daily',
          duration: m.duration.trim() || '5 Days',
        }));

      fd.append('prescription_items', JSON.stringify(validMeds));
      if (attachment) fd.append('attachment', attachment);

      await clinicalService.createRecord(fd, true);
      navigate('/records', { state: { createdSuccess: true } });
    } catch (err) {
      const detail =
        err.response?.data?.attachment?.[0] ||
        err.response?.data?.detail ||
        'Failed to publish medical record.';
      setError(detail);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const selectedPatient = patients.find((p) => String(p.id) === String(formData.patient));

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-hairline">
        <div className="space-y-1">
          <span className="editorial-eyebrow">Clinician Authoring • Audited PHI Entry</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Write E-Prescription &amp; Clinical Record
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Structured medication rows and diagnostic lab PDFs publish directly to the patient&apos;s Care Journey.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/records')} className="editorial-btn-secondary">
            ← Back to Records
          </button>
          <button type="button" onClick={() => navigate('/doctor/dashboard')} className="editorial-btn-secondary">
            Consultation Room
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 border-l-4 border-l-clinical-danger text-xs font-semibold text-clinical-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cobalt" />
        </div>
      ) : (
        <form onSubmit={handlePublish} className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6 items-start">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Patient & Clinical Assessment */}
            <div className="editorial-card p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Patient Identity *</label>
                  <select
                    required
                    value={formData.patient}
                    onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
                    className="editorial-input font-semibold"
                  >
                    <option value="">Select Patient</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.user?.first_name} {p.user?.last_name} ({p.patient_id} • {p.blood_group || 'O+'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Record Classification</label>
                  <div className="grid grid-cols-3 gap-2">
                    {RECORD_TYPES.map((rt) => (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, record_type: rt.id })}
                        className={`py-2.5 px-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          formData.record_type === rt.id
                            ? 'bg-cobalt text-white border-cobalt'
                            : 'bg-surface border-hairline text-muted hover:text-ink'
                        }`}
                      >
                        {rt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Record Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cardiology Follow-Up Consultation"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="editorial-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Primary Diagnosis / Assessment</label>
                  <input
                    type="text"
                    placeholder="e.g. Mild Essential Hypertension"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    className="editorial-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Clinical Visit Notes &amp; Instructions</label>
                <textarea
                  rows="3"
                  placeholder="Document vitals, examination findings, diet guidance, and follow-up timeline..."
                  value={formData.visit_notes}
                  onChange={(e) => setFormData({ ...formData, visit_notes: e.target.value })}
                  className="editorial-input resize-none"
                />
              </div>
            </div>

            {/* Structured Multi-Row Medication Builder */}
            <div className="editorial-card p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-bold text-ink">Structured Medication Regimen (Rx)</h2>
                  <span className="px-2 py-0.5 rounded-full bg-cobalt-tint text-cobalt font-mono text-[10px] font-bold">
                    {medications.filter((m) => m.medicine.trim()).length} ADDED
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addMedRow}
                  className="px-3 py-1.5 rounded-lg bg-cobalt-tint hover:bg-cobalt text-cobalt hover:text-white text-xs font-semibold transition cursor-pointer"
                >
                  + Add Medicine Row
                </button>
              </div>

              <div className="space-y-2.5">
                {medications.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1.2fr_0.9fr_auto] gap-2 p-3 rounded-xl bg-surface border border-hairline items-center"
                  >
                    <input
                      type="text"
                      placeholder="Medicine name & strength"
                      value={row.medicine}
                      onChange={(e) => handleMedChange(idx, 'medicine', e.target.value)}
                      className="editorial-input py-2 px-3 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Dosage"
                      value={row.dosage}
                      onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                      className="editorial-input py-2 px-3 text-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Frequency"
                      value={row.frequency}
                      onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                      className="editorial-input py-2 px-3 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Duration"
                      value={row.duration}
                      onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                      className="editorial-input py-2 px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeMedRow(idx)}
                      className="px-2.5 py-2 rounded-lg text-xs font-semibold text-clinical-danger hover:bg-rose-50 transition cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Rail: Lab PDF Upload + Sign-off */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <div className="editorial-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-ink">Diagnostic Lab Upload</h2>
                <span className="font-mono text-[10px] text-muted uppercase">Max 5 MB</span>
              </div>

              <label className="block p-5 rounded-xl bg-cobalt-tint/40 border border-dashed border-cobalt/50 text-center cursor-pointer hover:bg-cobalt-tint/70 transition">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-lg bg-white border border-cobalt/20 text-cobalt flex items-center justify-center mx-auto mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-cobalt">Select PDF, PNG, or Lab Scan</p>
                <p className="text-[11px] text-muted mt-1">Stored privately with RBAC access checks</p>
              </label>

              {attachment && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-clinical-success truncate">{attachment.name}</p>
                    <p className="font-mono text-[10px] text-clinical-success">
                      {(attachment.size / 1024).toFixed(1)} KB • Ready to attach
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="text-xs font-bold text-clinical-danger cursor-pointer shrink-0"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="editorial-card p-6 border-cobalt/30 space-y-4">
              <span className="editorial-eyebrow">Clinician Sign-Off</span>
              <div className="editorial-surface p-3.5 text-xs space-y-1">
                <p className="font-bold text-ink">
                  {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
                </p>
                <p className="text-muted capitalize">Role: {user?.role} • Encrypted Audit Logged</p>
                {selectedPatient && (
                  <p className="font-mono text-[11px] text-cobalt pt-1">
                    Target: {selectedPatient.patient_id} ({selectedPatient.user?.first_name})
                  </p>
                )}
              </div>

              <ul className="text-xs text-muted space-y-1.5">
                <li>✓ Syncs immediately to Patient Records portal</li>
                <li>✓ Appears in longitudinal Care Journey Timeline</li>
                <li>✓ Links to OPD / Inpatient billing workflow</li>
              </ul>

              <button
                type="submit"
                disabled={submitting}
                className="w-full editorial-btn-primary py-3 text-sm"
              >
                {submitting ? 'Publishing Clinical Record...' : 'Publish Signed Record →'}
              </button>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
};

export default CreateRecordPage;
