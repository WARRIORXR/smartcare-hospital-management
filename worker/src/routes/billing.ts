import { Hono } from 'hono';
import { requireAuth } from '../auth';
import { buildInvoicePdfBytes } from '../pdf';
import { displayLabel, fetchInvoicesDetailed } from '../serializers';
import {
  AppEnv,
  AuthUser,
  fullName,
  isAdminUser,
  isClinicalStaffUser,
  nowIso,
  parseIntId,
  recordAuditLog,
  round2,
  todayIstDate,
} from '../utils';

const WARD_DAILY_RATES: Record<string, number> = {
  general: 1500.0,
  semi: 2500.0,
  private: 4500.0,
  icu: 8000.0,
  emergency: 3500.0,
  pediatric: 2000.0,
  maternity: 3000.0,
};

function checkInvoiceAccess(user: AuthUser, patientId: number): boolean {
  if (isClinicalStaffUser(user)) return true;
  if (user.role === 'patient' && user.patient_profile_id) {
    return patientId === user.patient_profile_id;
  }
  return false;
}

export const billingRoutes = new Hono<AppEnv>({ strict: false });

billingRoutes.get('/invoices', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    return c.json(await fetchInvoicesDetailed(c.env.DB, 'WHERE inv.patient_id = ?', [user.patient_profile_id]));
  }
  if (!isClinicalStaffUser(user)) return c.json([]);

  const clauses: string[] = [];
  const binds: unknown[] = [];
  const patId = parseIntId(c.req.query('patient'));
  const st = c.req.query('status');
  if (patId) {
    clauses.push('inv.patient_id = ?');
    binds.push(patId);
  }
  if (st) {
    clauses.push('inv.status = ?');
    binds.push(st);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return c.json(await fetchInvoicesDetailed(c.env.DB, where, binds));
});

billingRoutes.post('/invoices/generate', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isClinicalStaffUser(user)) {
    return c.json({ detail: 'Only reception, doctors, or administrators can generate hospital invoices.' }, 403);
  }

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const tokenId = parseIntId(body.token_id as string);
  const admissionId = parseIntId(body.admission_id as string);
  let patientId = parseIntId(body.patient_id as string);
  const discountAmount = Math.max(0, round2(Number(body.discount_amount ?? 0)));
  const taxAmount = Math.max(0, round2(Number(body.tax_amount ?? 0)));
  const notes = String(body.notes || '');
  const extraItems = Array.isArray(body.extra_items) ? (body.extra_items as Array<Record<string, unknown>>) : [];

  let tokenRow: Record<string, unknown> | null = null;
  let admRow: Record<string, unknown> | null = null;

  if (tokenId) {
    tokenRow = await c.env.DB
      .prepare(
        `SELECT t.id, t.patient_id, t.token_code, doc.consultation_fee, u.first_name, u.last_name, u.username
         FROM opd_tokens t
         LEFT JOIN doctors doc ON doc.id = t.doctor_id
         LEFT JOIN users u ON u.id = doc.user_id
         WHERE t.id = ?`
      )
      .bind(tokenId)
      .first<Record<string, unknown>>();
    if (!tokenRow) return c.json({ detail: 'Token not found.' }, 404);
    patientId = patientId || Number(tokenRow.patient_id);
  }

  if (admissionId) {
    admRow = await c.env.DB
      .prepare(
        `SELECT a.id, a.patient_id, a.admission_date, a.discharge_date, b.bed_number, w.name AS ward_name, w.ward_type
         FROM admissions a
         JOIN beds b ON b.id = a.bed_id
         JOIN wards w ON w.id = b.ward_id
         WHERE a.id = ?`
      )
      .bind(admissionId)
      .first<Record<string, unknown>>();
    if (!admRow) return c.json({ detail: 'Admission not found.' }, 404);
    patientId = patientId || Number(admRow.patient_id);
  }

  if (!patientId) {
    return c.json({ detail: 'Provide patient_id, token_id, or admission_id to generate an invoice.' }, 400);
  }

  const patExists = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ?').bind(patientId).first();
  if (!patExists) return c.json({ detail: 'Patient not found.' }, 404);

  const itemsToInsert: Array<{ description: string; category: string; quantity: number; unit_price: number; line_total: number }> = [];

  if (tokenRow) {
    const rawFee = Number(tokenRow.consultation_fee || 0);
    const fee = rawFee > 0 ? round2(rawFee) : 500.0;
    const docLabel = tokenRow.username
      ? `Dr. ${fullName(tokenRow.first_name as string, tokenRow.last_name as string, tokenRow.username as string)}`
      : 'OPD Specialist';
    itemsToInsert.push({
      description: `OPD Consultation (${String(tokenRow.token_code)}) - ${docLabel}`,
      category: 'opd_fee',
      quantity: 1,
      unit_price: fee,
      line_total: fee,
    });
  }

  if (admRow) {
    const startMs = Date.parse(String(admRow.admission_date));
    const endMs = admRow.discharge_date ? Date.parse(String(admRow.discharge_date)) : Date.now();
    const hours = Math.max(1.0, (endMs - startMs) / 3600000);
    const days = Math.max(1, Math.ceil(hours / 24.0));
    const rate = WARD_DAILY_RATES[String(admRow.ward_type || 'general')] ?? 1500.0;
    itemsToInsert.push({
      description: `${String(admRow.ward_name)} (${String(admRow.bed_number)}) - ${days} day(s)`,
      category: 'ward_charge',
      quantity: days,
      unit_price: rate,
      line_total: round2(days * rate),
    });
  }

  for (const extra of extraItems) {
    const desc = String(extra.description || '').trim();
    if (!desc) continue;
    const qty = Math.max(1, Number(extra.quantity ?? 1));
    const unitPrice = Math.max(0, round2(Number(extra.unit_price ?? 0)));
    itemsToInsert.push({
      description: desc.slice(0, 255),
      category: String(extra.category || 'other'),
      quantity: qty,
      unit_price: unitPrice,
      line_total: round2(qty * unitPrice),
    });
  }

  if (itemsToInsert.length === 0) {
    itemsToInsert.push({
      description: 'General OPD Consultation & Registration',
      category: 'opd_fee',
      quantity: 1,
      unit_price: 500.0,
      line_total: 500.0,
    });
  }

  const subtotal = round2(itemsToInsert.reduce((acc, i) => acc + i.line_total, 0));
  const totalAmount = Math.max(0, round2(subtotal + taxAmount - discountAmount));
  const invNumber = `INV-${todayIstDate().replace(/-/g, '')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const ts = nowIso();

  const res = await c.env.DB
    .prepare(
      `INSERT INTO billing_invoices
       (invoice_number, patient_id, token_id, admission_id, created_by_id, status, subtotal, tax_amount, discount_amount, total_amount, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(invNumber, patientId, tokenId, admissionId, user.id, subtotal, taxAmount, discountAmount, totalAmount, notes, ts, ts)
    .run();

  const invoiceId = Number(res.meta.last_row_id);
  await c.env.DB.batch(
    itemsToInsert.map((item) =>
      c.env.DB
        .prepare('INSERT INTO billing_invoice_items (invoice_id, description, category, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(invoiceId, item.description, item.category, item.quantity, item.unit_price, item.line_total)
    )
  );

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'Invoice',
    resource_id: invoiceId,
    patient_id: patientId,
    details: `Generated ${invNumber} for INR ${totalAmount.toFixed(2)}.`,
  });

  const [created] = await fetchInvoicesDetailed(c.env.DB, 'WHERE inv.id = ?', [invoiceId]);
  return c.json(created, 201);
});

billingRoutes.get('/invoices/:pk/pdf', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const [inv] = await fetchInvoicesDetailed(c.env.DB, 'WHERE inv.id = ?', [id]);
  if (!inv) return c.json({ detail: 'Not found.' }, 404);

  if (!checkInvoiceAccess(user, inv.patient)) {
    return c.json({ detail: "Access denied. You cannot download another patient's receipt." }, 403);
  }

  await recordAuditLog(c, {
    action: 'EXPORT',
    resource_type: 'InvoicePDFReceipt',
    resource_id: id,
    patient_id: inv.patient,
    details: `Downloaded PDF receipt ${inv.invoice_number}.`,
  });

  const pdfBytes = await buildInvoicePdfBytes({
    invoice_number: inv.invoice_number,
    status: inv.status,
    created_at: inv.created_at,
    paid_at: inv.paid_at,
    payment_method: inv.payment_method,
    patient_name: inv.patient_name,
    patient_code: inv.patient_code,
    patient_phone: inv.patient_phone,
    token_code: inv.token_code,
    ward_info: inv.ward_info,
    subtotal: Number(inv.subtotal),
    tax_amount: Number(inv.tax_amount),
    discount_amount: Number(inv.discount_amount),
    total_amount: Number(inv.total_amount),
    notes: inv.notes,
    items: inv.items.map((it) => ({
      description: it.description,
      category_display: it.category_display || displayLabel('invoiceCategory', it.category),
      quantity: it.quantity,
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
    })),
  });

  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${inv.invoice_number}_receipt.pdf"`,
    },
  });
});

billingRoutes.get('/invoices/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const [inv] = await fetchInvoicesDetailed(c.env.DB, 'WHERE inv.id = ?', [id]);
  if (!inv) return c.json({ detail: 'Not found.' }, 404);
  if (!checkInvoiceAccess(user, inv.patient)) {
    return c.json({ detail: "You do not have permission to view another patient's invoice." }, 403);
  }
  return c.json(inv);
});

billingRoutes.post('/invoices/:pk/pay', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const method = String(body.payment_method || 'upi').toLowerCase();
  if (!['cash', 'card', 'upi', 'insurance'].includes(method)) {
    return c.json({ detail: 'Invalid payment method.' }, 400);
  }

  const existing = id ? await c.env.DB.prepare('SELECT * FROM billing_invoices WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  if (!checkInvoiceAccess(user, Number(existing.patient_id))) {
    return c.json({ detail: 'Not authorized to pay this invoice.' }, 403);
  }
  if (existing.status === 'paid') {
    return c.json({ detail: 'Invoice is already paid.' }, 400);
  }

  const ts = nowIso();
  await c.env.DB
    .prepare("UPDATE billing_invoices SET status = 'paid', payment_method = ?, paid_at = ?, updated_at = ? WHERE id = ?")
    .bind(method, ts, ts, id)
    .run();

  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'InvoicePayment',
    resource_id: id!,
    patient_id: Number(existing.patient_id),
    details: `Marked ${String(existing.invoice_number)} PAID via ${method.toUpperCase()}.`,
  });

  const [updated] = await fetchInvoicesDetailed(c.env.DB, 'WHERE inv.id = ?', [id]);
  return c.json(updated);
});
