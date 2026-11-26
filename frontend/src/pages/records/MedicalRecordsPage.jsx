/**
 * src/pages/records/MedicalRecordsPage.jsx
 * ----------------------------------------
 * Module 4: Prescriptions, Visit Notes & Lab Reports (with secure file upload/download).
 *  - Doctors / Admins: Create clinical notes, structured prescriptions, or upload lab report PDFs/images.
 *  - Patients: Read & download ONLY their own medical records.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';

const MedicalRecordsPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const isAuthorizedRecords = Boolean(
    isAuthenticated && user && ['patient', 'doctor', 'admin'].includes(user.role)
  );
  const isClinician = user?.role === 'doctor' || user?.role === 'admin' || user?.is_staff;

  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const submittingRef = useRef(false);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
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
  const [attachment, setAttachment] = useState(null);

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

  if (authLoading) return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
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

  const filtered = filterType === 'all' ? records : records.filter((r) => r.record_type === filterType);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🩺 {t('medicalRecordsTitle')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {isClinician
              ? 'Write visit notes, prescriptions, and upload encrypted lab reports for patients.'
              : 'View your personal prescriptions, consultation notes, and download lab reports.'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {['all', 'prescription', 'visit_note', 'lab_report'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                filterType === type ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
          {isClinician && (
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              + New Clinical Record
            </button>
          )}
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

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading medical records...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          No medical records found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((rec) => (
            <div key={rec.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                      rec.record_type === 'prescription'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : rec.record_type === 'lab_report'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {rec.record_type_display || rec.record_type}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(rec.created_at).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900">{rec.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Patient: <strong className="text-slate-700">{rec.patient_name}</strong> ({rec.patient_code}) • {rec.doctor_name}
                </p>

                {rec.diagnosis && (
                  <p className="mt-2 text-xs font-semibold text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    Diagnosis: {rec.diagnosis}
                  </p>
                )}

                {rec.visit_notes && (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{rec.visit_notes}</p>
                )}

                {Array.isArray(rec.prescription_items) && rec.prescription_items.length > 0 && (
                  <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase text-blue-700 mb-1.5">Medications Prescribed</p>
                    <ul className="space-y-1">
                      {rec.prescription_items.map((item, i) => (
                        <li key={i} className="text-xs text-slate-800 flex justify-between">
                          <span className="font-semibold">💊 {item.medicine}</span>
                          <span className="text-slate-600 font-mono text-[11px]">
                            {item.dosage} • {item.frequency} ({item.duration})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {rec.has_attachment && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 truncate max-w-[200px]">
                    📎 {rec.attachment_name || 'Lab Report'}
                  </span>
                  <button
                    onClick={() => clinicalService.downloadLabReport(rec.id, rec.attachment_name || `report_${rec.id}.pdf`)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    ⬇ Download File
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && isClinician && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Create Clinical Record</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient *</label>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Record Type</label>
                  <select
                    value={formData.record_type}
                    onChange={(e) => setFormData({ ...formData, record_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="prescription">Prescription</option>
                    <option value="visit_note">Visit Note</option>
                    <option value="lab_report">Lab Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnosis</label>
                  <input
                    type="text"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="e.g. Viral Fever"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Record Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Outpatient Consultation & Prescription"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Visit Notes</label>
                <textarea
                  rows="2"
                  value={formData.visit_notes}
                  onChange={(e) => setFormData({ ...formData, visit_notes: e.target.value })}
                  placeholder="Observations, vitals, instructions..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                <p className="text-[11px] font-bold text-blue-800 uppercase">Medication (Optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={formData.medicineName}
                    onChange={(e) => setFormData({ ...formData, medicineName: e.target.value })}
                    placeholder="Medicine name & mg"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    value={formData.dosage}
                    onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                    placeholder="Dosage"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    placeholder="Frequency"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="Duration"
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lab Report Attachment (.pdf, .png, .jpg — Max 5MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-600"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50"
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
