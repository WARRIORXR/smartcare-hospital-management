/**
 * src/pages/patient/PatientJourneyPage.jsx
 * ----------------------------------------
 * Dedicated Full-Page Unified Patient Care Journey Timeline.
 * Visualizes Modules 1-5 connected chronologically under a single Patient ID:
 *   01 OPD Consultation -> 02 Prescriptions & Labs -> 03 Ward Beds
 *   -> 04 Blood Bank Cross-Match -> 05 GST Invoices & PDF Receipts
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';
import hospitalService from '../../services/hospitalService';
import clinicalService from '../../services/clinicalService';

const STAGE_META = [
  { key: 'opd', step: '01', label: 'OPD Tokens & Consultation', accent: 'bg-cobalt-tint text-cobalt border-cobalt/20' },
  { key: 'records', step: '02', label: 'Prescriptions & Lab Reports', accent: 'bg-emerald-50 text-clinical-success border-emerald-200' },
  { key: 'beds', step: '03', label: 'Inpatient Ward Allocation', accent: 'bg-cobalt-tint text-cobalt border-cobalt/20' },
  { key: 'blood', step: '04', label: 'Blood Bank Requests', accent: 'bg-rose-50 text-clinical-danger border-rose-200' },
  { key: 'billing', step: '05', label: 'Itemized Billing & Receipts', accent: 'bg-emerald-50 text-clinical-success border-emerald-200' },
];

const PatientJourneyPage = () => {
  const { patientId: urlPatientId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const isAuthorized = Boolean(
    isAuthenticated && user && ['patient', 'doctor', 'reception', 'bloodbank_staff', 'admin'].includes(user.role)
  );
  const isStaff = Boolean(user && user.role !== 'patient');

  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(urlPatientId || '');
  const [journey, setJourney] = useState(null);
  const [selectedStage, setSelectedStage] = useState('opd');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingKey, setDownloadingKey] = useState(null);

  // Resolve target patient ID safely
  useEffect(() => {
    if (!isAuthorized) return;
    let active = true;

    const init = async () => {
      if (isStaff) {
        try {
          const pats = await hospitalService.getPatients();
          if (!active) return;
          const list = Array.isArray(pats) ? pats : pats?.results || [];
          setPatients(list);
          if (urlPatientId) {
            setSelectedPatientId(String(urlPatientId));
          } else if (list.length > 0) {
            setSelectedPatientId((prev) => prev || String(list[0].id));
          } else {
            setLoading(false);
          }
        } catch {
          if (active) {
            setError('Failed to load patient directory.');
            setLoading(false);
          }
        }
      } else {
        try {
          const profData = await authService.getProfile();
          if (!active) return;
          const pid = profData?.profile?.id || user?.patient_id_pk || user?.id;
          setSelectedPatientId(String(pid));
        } catch {
          if (active) setSelectedPatientId(String(user?.patient_id_pk || user?.id));
        }
      }
    };

    init();
    return () => { active = false; };
  }, [isAuthorized, isStaff, urlPatientId, user]);

  const fetchJourney = useCallback(async (pid) => {
    if (!pid) return;
    try {
      setLoading(true);
      setError('');
      const data = await hospitalService.getPatientJourney(pid);
      setJourney(data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Unable to load medical journey.');
      setJourney(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized || !selectedPatientId) return;
    fetchJourney(selectedPatientId);
  }, [isAuthorized, selectedPatientId, fetchJourney]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isAuthorized) return <Navigate to="/login" replace />;

  const handleDownloadLabReport = async (rec) => {
    try {
      setDownloadingKey(`rec-${rec.id}`);
      await clinicalService.downloadLabReport(rec.id, rec.attachment_name || `record_${rec.id}.pdf`);
    } catch {
      setError('Could not download lab report file.');
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadInvoice = async (inv) => {
    try {
      setDownloadingKey(`inv-${inv.id}`);
      await clinicalService.downloadInvoicePdf(inv.id, inv.invoice_number);
    } catch {
      setError('Could not download invoice PDF.');
    } finally {
      setDownloadingKey(null);
    }
  };

  const opdList = journey?.module_1_opd || [];
  const activeBed = journey?.module_2_beds?.active_admission || null;
  const bedHistory = journey?.module_2_beds?.admissions_history || [];
  const bloodList = journey?.module_3_bloodbank || [];
  const recordsList = journey?.module_4_records || [];
  const billingList = journey?.module_5_billing || [];
  const pat = journey?.patient;
  const sum = journey?.journey_summary;

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-hairline">
        <div className="space-y-1">
          <span className="editorial-eyebrow">Unified Longitudinal Medical Record</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Patient Care Journey Timeline
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Chronological care trail across OPD visits, prescriptions, ward admissions, blood bank, and billing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isStaff && patients.length > 0 && (
            <select
              aria-label="Select patient for journey"
              value={selectedPatientId}
              onChange={(e) => {
                setSelectedPatientId(e.target.value);
                navigate(`/patient/journey/${e.target.value}`, { replace: true });
              }}
              className="editorial-input py-2 px-3 text-xs font-semibold w-64"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.user?.first_name} {p.user?.last_name} ({p.patient_id})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => navigate(isStaff ? '/doctor/dashboard' : '/patient/book-slot')}
            className="editorial-btn-primary"
          >
            {isStaff ? '← Clinical Desk' : '+ Book Follow-Up'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-clinical-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-cobalt" />
        </div>
      ) : journey ? (
        <>
          {/* Patient Identity Banner */}
          <div className="editorial-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-cobalt-tint text-cobalt font-display font-bold text-base flex items-center justify-center shrink-0">
                {(pat?.name || 'PT').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-ink">{pat?.name}</h2>
                  <span className="px-2 py-0.5 rounded bg-cobalt-tint font-mono text-[11px] font-bold text-cobalt">
                    {pat?.patient_code || `PAT-${pat?.id}`}
                  </span>
                  {pat?.blood_group && (
                    <span className="px-2 py-0.5 rounded bg-rose-50 font-mono text-[11px] font-bold text-clinical-danger border border-rose-200">
                      {pat.blood_group}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {pat?.gender === 'M' ? 'Male' : pat?.gender === 'F' ? 'Female' : 'Other'} • Connected across 5 hospital services
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="editorial-surface px-3.5 py-2">
                <span className="block font-mono text-[10px] text-muted uppercase">OPD Visits</span>
                <span className="font-mono text-sm font-bold text-cobalt">{sum?.total_opd_visits ?? opdList.length}</span>
              </div>
              <div className="editorial-surface px-3.5 py-2">
                <span className="block font-mono text-[10px] text-muted uppercase">Ward Status</span>
                <span className={`font-mono text-sm font-bold ${sum?.is_currently_admitted ? 'text-clinical-danger' : 'text-ink'}`}>
                  {sum?.is_currently_admitted ? sum.current_bed : 'Outpatient'}
                </span>
              </div>
              <div className="editorial-surface px-3.5 py-2">
                <span className="block font-mono text-[10px] text-muted uppercase">Records &amp; Labs</span>
                <span className="font-mono text-sm font-bold text-clinical-success">{sum?.total_medical_records ?? recordsList.length}</span>
              </div>
              <div className="editorial-surface px-3.5 py-2">
                <span className="block font-mono text-[10px] text-muted uppercase">Invoices</span>
                <span className="font-mono text-sm font-bold text-ink">{sum?.total_invoices ?? billingList.length}</span>
              </div>
            </div>
          </div>

          {/* 2-Column Interactive Timeline + Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_410px] gap-6 items-start">
            {/* Left Chronological 5-Stage Timeline */}
            <div className="space-y-3">
              {STAGE_META.map((stage) => {
                const isSelected = selectedStage === stage.key;
                let summaryText = '';
                let countBadge = '';
                if (stage.key === 'opd') {
                  countBadge = `${opdList.length} Token(s)`;
                  summaryText = opdList[0]
                    ? `Latest: ${opdList[0].token_code} with ${opdList[0].doctor_name} (${opdList[0].status})`
                    : 'No OPD consultation tokens recorded yet.';
                } else if (stage.key === 'records') {
                  countBadge = `${recordsList.length} Record(s)`;
                  summaryText = recordsList[0]
                    ? `Latest: ${recordsList[0].title} (${recordsList[0].record_type})`
                    : 'No prescriptions, visit notes, or lab PDFs recorded yet.';
                } else if (stage.key === 'beds') {
                  countBadge = activeBed ? 'Active Inpatient' : `${bedHistory.length} History`;
                  summaryText = activeBed
                    ? `Bed ${activeBed.bed_number} • ${activeBed.ward_name} (${activeBed.diagnosis || 'Observation'})`
                    : bedHistory[0]
                    ? `Previous stay: Bed ${bedHistory[0].bed_number} (${bedHistory[0].ward_name}) — Discharged`
                    : 'No inpatient ward admissions on record.';
                } else if (stage.key === 'blood') {
                  countBadge = `${bloodList.length} Request(s)`;
                  summaryText = bloodList[0]
                    ? `Latest: ${bloodList[0].units_required}u ${bloodList[0].blood_group} (${bloodList[0].status})`
                    : 'No blood transfusion requests logged.';
                } else {
                  countBadge = `${billingList.length} Invoice(s)`;
                  summaryText = billingList[0]
                    ? `Latest: ${billingList[0].invoice_number} • ₹${Number(billingList[0].total_amount).toFixed(2)} (${billingList[0].status})`
                    : 'No billing invoices generated yet.';
                }

                return (
                  <div
                    key={stage.key}
                    onClick={() => setSelectedStage(stage.key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedStage(stage.key); }}
                    className={`p-4 sm:p-5 rounded-xl border transition flex items-center justify-between gap-4 cursor-pointer ${
                      isSelected
                        ? 'bg-cobalt-tint/50 border-cobalt shadow-2xs'
                        : 'bg-white border-hairline hover:border-cobalt/40'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-full font-mono text-xs font-bold flex items-center justify-center border shrink-0 ${stage.accent}`}>
                        {stage.step}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-ink">{stage.label}</h3>
                          <span className="px-2 py-0.5 rounded-full bg-white border border-hairline font-mono text-[10px] font-semibold text-muted">
                            {countBadge}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1 truncate">{summaryText}</p>
                      </div>
                    </div>

                    <span className={`text-xs font-semibold shrink-0 ${isSelected ? 'text-cobalt' : 'text-muted'}`}>
                      {isSelected ? 'Inspecting •' : 'Inspect →'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Contextual Inspector Panel */}
            <aside className="editorial-card p-6 border-cobalt/30 space-y-4 lg:sticky lg:top-24">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <span className="editorial-eyebrow">
                  Stage {STAGE_META.find((s) => s.key === selectedStage)?.step} Details
                </span>
                <span className="text-xs font-semibold text-muted">{pat?.patient_code}</span>
              </div>

              {selectedStage === 'opd' && (
                <div className="space-y-3">
                  {opdList.length === 0 ? (
                    <p className="text-xs text-muted py-6 text-center">No OPD visits yet.</p>
                  ) : opdList.slice(0, 5).map((tk) => (
                    <div key={tk.id} className="editorial-surface p-3.5 space-y-1 text-xs">
                      <div className="flex justify-between font-mono font-bold text-cobalt">
                        <span>{tk.token_code}</span>
                        <span className="text-[10px] uppercase text-clinical-success">{tk.status_display || tk.status}</span>
                      </div>
                      <p className="font-bold text-ink">{tk.doctor_name}</p>
                      <p className="text-muted">{tk.department_name} • Room {tk.room_number} • {tk.appointment_date}</p>
                      {tk.symptoms && <p className="italic text-ink pt-1">“{tk.symptoms}”</p>}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate(isStaff ? '/doctor/dashboard' : '/patient/tokens')}
                    className="w-full editorial-btn-primary py-2.5"
                  >
                    Open OPD Passes &amp; Queue →
                  </button>
                </div>
              )}

              {selectedStage === 'records' && (
                <div className="space-y-3">
                  {recordsList.length === 0 ? (
                    <p className="text-xs text-muted py-6 text-center">No clinical records uploaded yet.</p>
                  ) : recordsList.slice(0, 5).map((rec) => (
                    <div key={rec.id} className="editorial-surface p-3.5 space-y-1.5 text-xs">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="font-mono text-[10px] font-bold uppercase text-clinical-success">{rec.record_type}</span>
                          <p className="font-bold text-ink">{rec.title}</p>
                        </div>
                        {rec.has_attachment && (
                          <button
                            type="button"
                            disabled={downloadingKey === `rec-${rec.id}`}
                            onClick={() => handleDownloadLabReport(rec)}
                            className="px-2.5 py-1 rounded bg-white border border-hairline text-[11px] font-semibold text-cobalt cursor-pointer"
                          >
                            {downloadingKey === `rec-${rec.id}` ? '...' : 'PDF ↓'}
                          </button>
                        )}
                      </div>
                      {rec.diagnosis && <p className="text-ink"><strong>Dx:</strong> {rec.diagnosis}</p>}
                      <p className="text-[11px] text-muted">{rec.doctor_name} • {new Date(rec.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                  <button type="button" onClick={() => navigate('/records')} className="w-full editorial-btn-primary py-2.5">
                    Open Full Medical Records →
                  </button>
                </div>
              )}

              {selectedStage === 'beds' && (
                <div className="space-y-3">
                  {activeBed ? (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-1 text-xs">
                      <span className="font-mono text-[10px] font-bold uppercase text-clinical-danger">Active Inpatient</span>
                      <p className="font-display text-lg font-bold text-ink">Bed {activeBed.bed_number}</p>
                      <p className="font-semibold text-clinical-danger">{activeBed.ward_name} ({activeBed.ward_type})</p>
                      <p className="text-ink">Attending: {activeBed.attending_doctor_name}</p>
                      {activeBed.diagnosis && <p className="text-muted pt-1">Dx: {activeBed.diagnosis}</p>}
                    </div>
                  ) : (
                    <div className="editorial-surface p-4 text-xs text-center text-muted">
                      Patient is not currently occupying an inpatient bed.
                    </div>
                  )}
                  {bedHistory.slice(0, 4).map((adm) => (
                    <div key={adm.id} className="editorial-surface p-3 text-xs flex justify-between">
                      <span className="font-semibold text-ink">{adm.bed_number} ({adm.ward_name})</span>
                      <span className="font-mono text-[10px] uppercase text-muted">{adm.status}</span>
                    </div>
                  ))}
                  {isStaff && (
                    <button type="button" onClick={() => navigate('/beds')} className="w-full editorial-btn-primary py-2.5">
                      Open Ward Bed Grid →
                    </button>
                  )}
                </div>
              )}

              {selectedStage === 'blood' && (
                <div className="space-y-3">
                  {bloodList.length === 0 ? (
                    <p className="text-xs text-muted py-6 text-center">No blood requests logged.</p>
                  ) : bloodList.slice(0, 5).map((br) => (
                    <div key={br.id} className="editorial-surface p-3.5 text-xs space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-clinical-danger">{br.units_required} Unit(s) {br.blood_group}</span>
                        <span className="font-mono text-[10px] uppercase text-muted">{br.status}</span>
                      </div>
                      <p className="text-muted">Priority: {br.priority} • Purpose: {br.purpose}</p>
                    </div>
                  ))}
                  <button type="button" onClick={() => navigate('/bloodbank/requests')} className="w-full editorial-btn-primary py-2.5">
                    Open Blood Bank Requests →
                  </button>
                </div>
              )}

              {selectedStage === 'billing' && (
                <div className="space-y-3">
                  {billingList.length === 0 ? (
                    <p className="text-xs text-muted py-6 text-center">No hospital invoices generated.</p>
                  ) : billingList.slice(0, 5).map((inv) => (
                    <div key={inv.id} className="editorial-surface p-3.5 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-mono font-bold text-ink">{inv.invoice_number}</p>
                        <p className="font-semibold text-ink">₹{Number(inv.total_amount).toFixed(2)} • <span className="uppercase">{inv.status}</span></p>
                      </div>
                      <button
                        type="button"
                        disabled={downloadingKey === `inv-${inv.id}`}
                        onClick={() => handleDownloadInvoice(inv)}
                        className="editorial-btn-secondary py-1.5 px-3"
                      >
                        {downloadingKey === `inv-${inv.id}` ? '...' : 'PDF ↓'}
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => navigate('/billing')} className="w-full editorial-btn-primary py-2.5">
                    Open Billing &amp; Receipts →
                  </button>
                </div>
              )}
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PatientJourneyPage;
