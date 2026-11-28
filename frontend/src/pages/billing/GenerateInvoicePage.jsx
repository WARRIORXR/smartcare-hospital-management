/**
 * src/pages/billing/GenerateInvoicePage.jsx
 * -----------------------------------------
 * Dedicated Staff Page for Itemized OPD & Ward Invoice Generation (/billing/new),
 * aligned with Paper Screen 25 (Generate Itemized Billing Invoice).
 */

import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

const EMPTY_ITEM = () => ({ description: '', category: 'lab_test', quantity: 1, unit_price: '' });

const CATEGORY_OPTIONS = [
  { value: 'lab_test', label: 'Lab / Diagnostic' },
  { value: 'medication', label: 'Pharmacy / Medication' },
  { value: 'opd_fee', label: 'OPD Procedure' },
  { value: 'ward_charge', label: 'Ward / Bed Fee' },
  { value: 'blood_bank', label: 'Blood Bank Unit' },
  { value: 'other', label: 'Other Charge' },
];

const GenerateInvoicePage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const submittingRef = useRef(false);

  const isBillingStaff = Boolean(
    isAuthenticated && user && (['reception', 'doctor', 'admin'].includes(user.role) || user.is_staff)
  );

  const urlPatientId = searchParams.get('patient') || '';
  const urlTokenId = searchParams.get('token') || '';

  const [patients, setPatients] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    patient_id: urlPatientId,
    token_id: urlTokenId,
    discount_amount: '0',
    notes: '',
  });
  const [extraItems, setExtraItems] = useState([EMPTY_ITEM()]);

  useEffect(() => {
    if (!isBillingStaff) return;
    let active = true;
    Promise.all([
      hospitalService.getPatients().catch(() => []),
      opdService.getTokens().catch(() => []),
      hospitalService.getDoctors().catch(() => []),
    ])
      .then(([pats, toks, docs]) => {
        if (!active) return;
        const pList = Array.isArray(pats) ? pats : pats?.results || [];
        const tList = Array.isArray(toks) ? toks : toks?.results || [];
        const dList = Array.isArray(docs) ? docs : docs?.results || [];
        setPatients(pList);
        setTokens(tList);
        setDoctors(dList);
        if (!urlPatientId && !urlTokenId && pList.length > 0) {
          setFormData((prev) => ({ ...prev, patient_id: prev.patient_id || String(pList[0].id) }));
        }
      })
      .catch(() => {
        if (active) setError('Could not load patients or OPD tokens.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isBillingStaff, urlPatientId, urlTokenId]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isBillingStaff) return <Navigate to="/billing" replace />;

  const handleItemChange = (idx, field, value) => {
    setExtraItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const addItemRow = () => setExtraItems((prev) => [...prev, EMPTY_ITEM()]);
  const removeItemRow = (idx) => {
    setExtraItems((prev) => (prev.length === 1 ? [EMPTY_ITEM()] : prev.filter((_, i) => i !== idx)));
  };

  const selectedPatient = patients.find((p) => String(p.id) === String(formData.patient_id));
  const selectedToken = tokens.find((t) => String(t.id) === String(formData.token_id));
  const linkedDoctor = selectedToken ? doctors.find((d) => String(d.id) === String(selectedToken.doctor)) : null;

  const estimatedOpdFee = selectedToken
    ? Math.max(500, Number(linkedDoctor?.consultation_fee || 500))
    : 0;

  const validItems = extraItems.filter((it) => it.description.trim() && Number(it.unit_price) > 0);
  const extraSubtotal = validItems.reduce((sum, it) => sum + Number(it.quantity || 1) * Number(it.unit_price || 0), 0);
  const discountVal = Math.max(0, Number(formData.discount_amount || 0));
  const estimatedSubtotal = estimatedOpdFee + extraSubtotal;
  const estimatedTotal = Math.max(0, estimatedSubtotal - discountVal);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setError('');

    if (!formData.patient_id && !formData.token_id) {
      setError('Select either an OPD token or a patient profile to bill.');
      return;
    }

    submittingRef.current = true;
    try {
      setSubmitting(true);
      await clinicalService.generateInvoice({
        patient_id: formData.patient_id ? parseInt(formData.patient_id, 10) : null,
        token_id: formData.token_id ? parseInt(formData.token_id, 10) : null,
        discount_amount: discountVal,
        notes: formData.notes.trim(),
        extra_items: validItems.map((it) => ({
          description: it.description.trim(),
          category: it.category || 'other',
          quantity: parseInt(it.quantity || 1, 10),
          unit_price: parseFloat(it.unit_price),
        })),
      });
      navigate('/billing');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to generate invoice.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-hairline">
        <div className="space-y-1">
          <span className="editorial-eyebrow">Financial Counter · Create Itemized Bill</span>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            Generate Hospital Invoice &amp; Receipt
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            Automatically includes OPD consultation &amp; active inpatient ward stay fees alongside custom procedures.
          </p>
        </div>

        <button type="button" onClick={() => navigate('/billing')} className="editorial-btn-secondary shrink-0">
          ← Back to Invoices
        </button>
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left Form Column */}
          <div className="space-y-5">
            <div className="bg-canvas rounded-2xl border border-hairline p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-ink">
                  1. Patient &amp; OPD / Ward Encounter Link
                </h2>
                {urlPatientId && (
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-cobalt-tint text-cobalt uppercase">
                    Encounter Locked
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Select Patient *</label>
                  <select
                    required={!formData.token_id}
                    value={formData.patient_id}
                    onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                    className="editorial-input font-semibold"
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
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Linked OPD Token (Auto-Bills Consultation)
                  </label>
                  <select
                    value={formData.token_id}
                    onChange={(e) => {
                      const chosenToken = tokens.find((t) => String(t.id) === e.target.value);
                      setFormData({
                        ...formData,
                        token_id: e.target.value,
                        patient_id: chosenToken?.patient ? String(chosenToken.patient) : formData.patient_id,
                      });
                    }}
                    className="editorial-input"
                  >
                    <option value="">-- Optional OPD Token --</option>
                    {tokens.map((tok) => (
                      <option key={tok.id} value={tok.id}>
                        {tok.token_code} — {tok.patient_name} ({tok.doctor_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Discount Amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discount_amount}
                    onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                    className="editorial-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Billing Remarks / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Cardiology diagnostics + Ward observation"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="editorial-input"
                  />
                </div>
              </div>
            </div>

            {/* Procedures, Labs & Medication Line Items */}
            <div className="bg-canvas rounded-2xl border border-hairline p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-ink">
                    2. Procedures, Labs &amp; Medication Line Items
                  </h2>
                  <p className="text-[11px] text-muted mt-0.5">
                    Add itemized diagnostic scans, ECG panels, pharmacy meds, or blood bank charges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="px-3 py-1.5 rounded-lg border border-hairline bg-surface hover:bg-cobalt-tint text-cobalt text-xs font-semibold transition cursor-pointer shrink-0"
                >
                  + Add Line Item
                </button>
              </div>

              <div className="space-y-2.5">
                {extraItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[1.5fr_150px_68px_108px_auto] gap-2.5 p-3 rounded-xl bg-surface border border-hairline items-center"
                  >
                    <input
                      type="text"
                      placeholder="Service description (e.g. 12-Lead ECG)"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="editorial-input py-2 px-3 text-xs"
                    />
                    <select
                      value={item.category}
                      onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                      className="editorial-input h-[38px] text-xs leading-[36px] py-0"
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      className="editorial-input py-2 px-2.5 text-xs font-mono text-center"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit Price ₹"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                      className="editorial-input py-2 px-2.5 text-xs font-mono font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      aria-label="Remove line item"
                      className="px-2.5 py-2 rounded-lg text-xs font-bold text-clinical-danger hover:bg-rose-50 transition cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Live Billing Preview Sidebar */}
          <aside className="bg-surface rounded-2xl border border-hairline p-6 space-y-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <span className="editorial-eyebrow">Live Billing Preview</span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-clinical-success">
                PDF READY
              </span>
            </div>

            <div className="bg-canvas rounded-xl border border-hairline p-3.5 space-y-1">
              <div className="font-display text-sm font-bold text-ink">
                {selectedPatient
                  ? `${selectedPatient.user?.first_name || ''} ${selectedPatient.user?.last_name || ''} • ${selectedPatient.patient_id}`
                  : 'Select a Patient'}
              </div>
              <div className="text-xs text-muted">
                {selectedToken
                  ? `OPD Token ${selectedToken.token_code} • ${selectedToken.doctor_name}`
                  : 'Standalone / Ward Invoice (No OPD Token Selected)'}
              </div>
            </div>

            <div className="space-y-2.5 pb-3 border-b border-hairline text-xs">
              <div className="flex justify-between">
                <span className="text-muted">OPD Consultation (Auto)</span>
                <span className="font-mono font-semibold text-ink">
                  {selectedToken ? `₹${estimatedOpdFee.toFixed(2)}` : 'Auto on backend'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Custom Procedures ({validItems.length} items)</span>
                <span className="font-mono font-semibold text-ink">₹{extraSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Discount Applied</span>
                <span className="font-mono font-semibold text-clinical-success">- ₹{discountVal.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-muted pt-1">
                Active inpatient ward stay charges (if admitted) are merged cleanly at generation time.
              </p>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="font-display text-sm font-bold text-ink">Estimated Payable</span>
              <span className="font-mono text-2xl font-bold text-cobalt">₹{estimatedTotal.toFixed(2)}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full editorial-btn-primary py-3 text-sm"
            >
              {submitting ? 'Generating Official Invoice...' : 'Generate Invoice & PDF Receipt →'}
            </button>
          </aside>
        </form>
      )}
    </div>
  );
};

export default GenerateInvoicePage;
