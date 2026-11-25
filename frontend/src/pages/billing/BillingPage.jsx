/**
 * src/pages/billing/BillingPage.jsx
 * ---------------------------------
 * Module 5: Hospital Invoices, OPD + Ward Charge Calculation & PDF Receipt Downloads.
 *  - Patients view & pay only their own invoices and download PDF receipts.
 *  - Reception / Doctors / Admins generate itemized invoices from tokens or admissions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import clinicalService from '../../services/clinicalService';
import hospitalService from '../../services/hospitalService';
import opdService from '../../services/opdService';

const BillingPage = () => {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const isAuthorizedBilling = Boolean(
    isAuthenticated && user && ['patient', 'reception', 'doctor', 'admin'].includes(user.role)
  );
  const isStaff = ['reception', 'doctor', 'admin'].includes(user?.role) || user?.is_staff;

  const [invoices, setInvoices] = useState([]);
  const [patients, setPatients] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [showGenModal, setShowGenModal] = useState(false);
  const [genForm, setGenForm] = useState({
    patient_id: '',
    token_id: '',
    extraDesc: '',
    extraPrice: '',
    discount_amount: '0',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

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

  if (authLoading) return <div className="p-8 text-center text-gray-500">Checking authorization...</div>;
  if (!isAuthorizedBilling) {
    return <Navigate to="/dashboard" replace />;
  }

  const handlePay = async (invId, method = 'upi') => {
    try {
      await clinicalService.payInvoice(invId, method);
      setMsg({ type: 'success', text: `Invoice paid cleanly via ${method.toUpperCase()}. You may now download the paid PDF receipt.` });
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Payment failed.' });
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
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
      setMsg({ type: 'success', text: 'Invoice generated with PDF receipt ready.' });
      setShowGenModal(false);
      setGenForm({ patient_id: '', token_id: '', extraDesc: '', extraPrice: '', discount_amount: '0', notes: '' });
      await loadData();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to generate invoice.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💳 {t('billingTitle')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated OPD consultation & ward occupancy billing with official PDF receipt downloads.
          </p>
        </div>
        {isStaff && (
          <button
            onClick={() => setShowGenModal(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
          >
            + Generate New Invoice
          </button>
        )}
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
        <div className="py-16 text-center text-slate-400 text-sm">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          No invoices found.
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex flex-wrap justify-between items-start gap-4 border-b border-slate-100 pb-4 mb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-sm text-slate-900">{inv.invoice_number}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        inv.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {inv.status}
                    </span>
                    {inv.token_code && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px]">
                        Token {inv.token_code}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Patient: <strong className="text-slate-700">{inv.patient_name}</strong> ({inv.patient_code}) •{' '}
                    {new Date(inv.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase font-semibold">Total Amount</p>
                  <p className="text-2xl font-black text-slate-900 font-mono">₹{inv.total_amount}</p>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {(inv.items || []).map((item) => (
                  <div key={item.id} className="flex justify-between text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                    <span>
                      <strong>{item.description}</strong>{' '}
                      <span className="text-slate-400">({item.category_display} × {item.quantity})</span>
                    </span>
                    <span className="font-mono font-semibold">₹{item.line_total}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-between items-center gap-3 pt-2">
                <span className="text-xs text-slate-500">
                  {inv.status === 'paid' ? `Paid via ${(inv.payment_method || 'UPI').toUpperCase()}` : inv.notes || 'Pending settlement'}
                </span>
                <div className="flex items-center space-x-2">
                  {inv.status === 'unpaid' && (
                    <button
                      onClick={() => handlePay(inv.id, 'upi')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      💳 {t('payNow')} (UPI)
                    </button>
                  )}
                  <button
                    onClick={() => clinicalService.downloadInvoicePdf(inv.id, inv.invoice_number)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    📄 {t('downloadPdf')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showGenModal && isStaff && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Generate Hospital Invoice</h3>
              <button onClick={() => setShowGenModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <form onSubmit={handleGenerate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link Today's OPD Token (Optional)</label>
                <select
                  value={genForm.token_id}
                  onChange={(e) => setGenForm({ ...genForm, token_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Or Select Patient *</label>
                <select
                  required={!genForm.token_id}
                  value={genForm.patient_id}
                  onChange={(e) => setGenForm({ ...genForm, patient_id: e.target.value })}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Extra Service</label>
                  <input
                    type="text"
                    value={genForm.extraDesc}
                    onChange={(e) => setGenForm({ ...genForm, extraDesc: e.target.value })}
                    placeholder="e.g. ECG / Blood Test"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={genForm.extraPrice}
                    onChange={(e) => setGenForm({ ...genForm, extraPrice: e.target.value })}
                    placeholder="350"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Discount (INR)</label>
                  <input
                    type="number"
                    min="0"
                    value={genForm.discount_amount}
                    onChange={(e) => setGenForm({ ...genForm, discount_amount: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={genForm.notes}
                    onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
                    placeholder="Optional note"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowGenModal(false)} className="px-4 py-2 text-xs text-slate-600 rounded-xl hover:bg-slate-100">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">
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
