/**
 * src/pages/billing/BillingPage.jsx
 * ---------------------------------
 * Module 5: Hospital Invoices, OPD + Ward Charge Calculation & PDF Receipt Downloads.
 * Supports URL pre-filling via ?patient=<id>&token=<id>&new=1 from Doctor & Reception workflows.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

const BillingPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isAuthorizedBilling = Boolean(
    isAuthenticated && user && ['patient', 'reception', 'doctor', 'admin'].includes(user.role)
  );
  const isStaff = ['reception', 'doctor', 'admin'].includes(user?.role) || user?.is_staff;

  const urlPatientId = searchParams.get('patient') || '';
  const urlTokenId = searchParams.get('token') || '';
  const urlOpenNew = searchParams.get('new') === '1';

  const [invoices, setInvoices] = useState([]);
  const [patients, setPatients] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unpaid' | 'paid'
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const actionRef = useRef(false);

  const [showGenModal, setShowGenModal] = useState(false);
  const [genForm, setGenForm] = useState({
    patient_id: urlPatientId,
    token_id: urlTokenId,
    extraDesc: '',
    extraPrice: '',
    discount_amount: '0',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isStaff && (urlPatientId || urlTokenId)) {
      setGenForm((prev) => ({
        ...prev,
        patient_id: urlPatientId || prev.patient_id,
        token_id: urlTokenId || prev.token_id,
      }));
      if (urlOpenNew) setShowGenModal(true);
    }
  }, [isStaff, urlPatientId, urlTokenId, urlOpenNew]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const invs = await clinicalService.getInvoices();
      setInvoices(invs || []);
      if (isStaff) {
        const [pats, toks] = await Promise.all([
          hospitalService.getPatients(),
          opdService.getTokens().catch(() => []),
        ]);
        setPatients(pats || []);
        setTokens(toks || []);
      }
    } catch (err) {
      console.error('Billing load failed', err);
      setMsg({ type: 'error', text: 'Could not load hospital invoices.' });
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    if (!isAuthorizedBilling) return;
    loadData();
  }, [isAuthorizedBilling, loadData]);

  if (authLoading) return <div className="p-8 text-center text-muted text-sm">Checking authorization...</div>;
  if (!isAuthorizedBilling) {
    return <Navigate to="/dashboard" replace />;
  }

  const handlePay = async (invId, method = 'upi') => {
    if (actionRef.current) return;
    actionRef.current = true;
    setPayingId(invId);
    try {
      await clinicalService.payInvoice(invId, method);
      setMsg({ type: 'success', text: `Invoice settled cleanly via ${method.toUpperCase()}. PDF receipt is ready.` });
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Payment failed.' });
    } finally {
      setPayingId(null);
      actionRef.current = false;
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (actionRef.current) return;
    actionRef.current = true;
    try {
      setSubmitting(true);
      const payload = {
        patient_id: genForm.patient_id ? parseInt(genForm.patient_id) : null,
        token_id: genForm.token_id ? parseInt(genForm.token_id) : null,
        discount_amount: parseFloat(genForm.discount_amount || 0),
        notes: genForm.notes,
        extra_items:
          genForm.extraDesc.trim() && genForm.extraPrice
            ? [{
                description: genForm.extraDesc.trim(),
                category: 'other',
                quantity: 1,
                unit_price: parseFloat(genForm.extraPrice),
              }]
            : [],
      };
      await clinicalService.generateInvoice(payload);
      setMsg({ type: 'success', text: 'Invoice generated with official PDF receipt ready.' });
      setShowGenModal(false);
      setGenForm({ patient_id: '', token_id: '', extraDesc: '', extraPrice: '', discount_amount: '0', notes: '' });
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to generate invoice.' });
    } finally {
      actionRef.current = false;
      setSubmitting(false);
    }
  };

  const paidTotal = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const unpaidTotal = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const filteredInvoices = invoices.filter((i) => {
    if (statusFilter === 'paid') return i.status === 'paid';
    if (statusFilter === 'unpaid') return i.status !== 'paid';
    return true;
  });

  return (
    <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-hairline">
        <div className="space-y-1.5">
          <span className="editorial-eyebrow">Financial Desk · Itemized OPD &amp; Ward Billing</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">{t('billingTitle')}</h1>
          <p className="text-xs sm:text-sm text-muted">
            Automated OPD consultation &amp; ward occupancy billing with official downloadable PDF receipts.
          </p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => navigate('/billing/new')}
            className="editorial-btn-primary shrink-0"
          >
            + Generate New Invoice
          </button>
        )}
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Total Invoices</span>
          <p className="font-display text-2xl font-bold text-ink mt-1">{invoices.length}</p>
        </div>
        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Paid &amp; Settled</span>
          <p className="font-mono text-2xl font-bold text-clinical-success mt-1">₹{paidTotal.toFixed(2)}</p>
        </div>
        <div className="editorial-card p-5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Pending Balance</span>
          <p className="font-mono text-2xl font-bold text-clinical-warning mt-1">₹{unpaidTotal.toFixed(2)}</p>
        </div>
      </div>

      {/* Filter Tabs & Payment Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: `All Invoices (${invoices.length})` },
            { id: 'unpaid', label: `Unpaid (${invoices.filter((i) => i.status !== 'paid').length})` },
            { id: 'paid', label: `Paid (${invoices.filter((i) => i.status === 'paid').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-cobalt text-white border-cobalt'
                  : 'bg-white border-hairline text-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[10px] font-semibold uppercase text-muted">Method:</span>
          {['upi', 'card', 'cash'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold uppercase border transition cursor-pointer ${
                paymentMethod === m
                  ? 'bg-surface border-cobalt text-cobalt'
                  : 'bg-white border-hairline text-muted hover:text-ink'
              }`}
            >
              {m}
            </button>
          ))}
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

      {loading ? (
        <div className="py-16 text-center text-muted text-sm">Loading invoices...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="editorial-card p-12 text-center text-muted text-sm">
          No invoices found for this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredInvoices.map((inv) => (
            <div key={inv.id} className="editorial-card p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 border-b border-hairline pb-4 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-ink">{inv.invoice_number}</span>
                    <span
                      className={`font-mono px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        inv.status === 'paid'
                          ? 'bg-emerald-50 text-clinical-success border-emerald-200'
                          : 'bg-amber-50 text-clinical-warning border-amber-200'
                      }`}
                    >
                      {inv.status}
                    </span>
                    {inv.token_code && (
                      <span className="px-2 py-0.5 rounded bg-cobalt-tint text-cobalt font-mono text-[10px] font-semibold">
                        Token {inv.token_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Patient: <strong className="text-ink">{inv.patient_name}</strong>{' '}
                    <span className="font-mono">({inv.patient_code})</span> · {new Date(inv.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-[10px] text-muted uppercase font-semibold">Total Amount</p>
                  <p className="font-mono text-2xl font-bold text-ink">₹{inv.total_amount}</p>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {(inv.items || []).map((item) => (
                  <div key={item.id} className="flex justify-between text-xs text-ink bg-surface px-3.5 py-2 rounded-lg border border-hairline">
                    <span>
                      <strong>{item.description}</strong>{' '}
                      <span className="text-muted">({item.category_display} × {item.quantity})</span>
                    </span>
                    <span className="font-mono font-semibold">₹{item.line_total}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <span className="text-xs text-muted">
                  {inv.status === 'paid' ? `Paid via ${(inv.payment_method || 'UPI').toUpperCase()}` : inv.notes || 'Pending settlement'}
                </span>
                <div className="flex items-center gap-2">
                  {inv.status === 'unpaid' && (
                    <button
                      type="button"
                      onClick={() => handlePay(inv.id, paymentMethod)}
                      disabled={payingId === inv.id}
                      className="px-3.5 py-2 rounded-lg bg-clinical-success hover:opacity-95 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {payingId === inv.id ? 'Processing...' : `${t('payNow')} (${paymentMethod.toUpperCase()})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => clinicalService.downloadInvoicePdf(inv.id, inv.invoice_number)}
                    className="editorial-btn-secondary py-2 px-3.5"
                  >
                    {t('downloadPdf')} ↓
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showGenModal && isStaff && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="editorial-card max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-hairline">
              <h3 className="font-display text-lg font-bold text-ink">Generate Hospital Invoice</h3>
              <button type="button" onClick={() => setShowGenModal(false)} className="text-muted hover:text-ink text-xl font-bold cursor-pointer">×</button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Link Today&apos;s OPD Token (Optional)</label>
                <select
                  value={genForm.token_id}
                  onChange={(e) => setGenForm({ ...genForm, token_id: e.target.value })}
                  className="editorial-input"
                >
                  <option value="">-- Optional Token --</option>
                  {tokens.map((tok) => (
                    <option key={tok.id} value={tok.id}>
                      {tok.token_code} — {tok.patient_name} ({tok.doctor_name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Or Select Patient *</label>
                <select
                  required={!genForm.token_id}
                  value={genForm.patient_id}
                  onChange={(e) => setGenForm({ ...genForm, patient_id: e.target.value })}
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
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Extra Service</label>
                  <input
                    type="text"
                    value={genForm.extraDesc}
                    onChange={(e) => setGenForm({ ...genForm, extraDesc: e.target.value })}
                    placeholder="e.g. ECG / Lab Test"
                    className="editorial-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={genForm.extraPrice}
                    onChange={(e) => setGenForm({ ...genForm, extraPrice: e.target.value })}
                    placeholder="350"
                    className="editorial-input text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Discount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={genForm.discount_amount}
                    onChange={(e) => setGenForm({ ...genForm, discount_amount: e.target.value })}
                    className="editorial-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">Notes</label>
                  <input
                    type="text"
                    value={genForm.notes}
                    onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
                    placeholder="Optional note"
                    className="editorial-input text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
                <button type="button" onClick={() => setShowGenModal(false)} className="editorial-btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="editorial-btn-primary px-5">
                  {submitting ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
