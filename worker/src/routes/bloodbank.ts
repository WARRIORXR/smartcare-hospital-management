import { Hono } from 'hono';
import { requireAuth } from '../auth';
import {
  ALL_BLOOD_GROUPS,
  COMPATIBLE_DONORS,
  ensureAndFetchBloodStock,
  fetchBloodRequestsDetailed,
  serializeBloodStockRow,
  serializeDonorRow,
} from '../serializers';
import {
  AppEnv,
  AuthUser,
  addDaysDateStr,
  fullName,
  isAdminUser,
  isAnyStaffUser,
  nowIso,
  parseIntId,
  recordAuditLog,
  todayIstDate,
} from '../utils';

function canManageBloodBank(user: AuthUser): boolean {
  return ['bloodbank_staff', 'admin'].includes(user.role) || isAdminUser(user);
}

function canViewDonors(user: AuthUser): boolean {
  return ['bloodbank_staff', 'admin', 'doctor'].includes(user.role) || isAdminUser(user);
}

export const bloodBankRoutes = new Hono<AppEnv>({ strict: false });

bloodBankRoutes.get('/stock', requireAuth, async (c) => {
  const stock = await ensureAndFetchBloodStock(c.env.DB);
  const totalUnits = stock.reduce((acc, s) => acc + s.units_available, 0);
  const criticalGroups = stock.filter((s) => s.units_available < 3).map((s) => s.blood_group);

  return c.json({
    summary: {
      total_units: totalUnits,
      critical_count: criticalGroups.length,
      critical_groups: criticalGroups,
      has_red_alert: criticalGroups.length > 0,
      threshold_rule: 'Red Alert triggered when stock is less than 3 units',
    },
    stock,
    timestamp: nowIso(),
  });
});

bloodBankRoutes.post('/stock/update', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!canManageBloodBank(user)) return c.json({ detail: 'Blood bank staff or admin access required.' }, 403);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const bloodGroup = String(body.blood_group || '').trim();
  const units = Number(body.units);
  const action = String(body.action || 'set').trim();
  const expiryDate = String(body.expiry_date || '').trim();
  const notes = String(body.notes || '');
  const donorName = String(body.donor_name || '');

  if (!ALL_BLOOD_GROUPS.includes(bloodGroup)) return c.json({ blood_group: ['Invalid blood group.'] }, 400);
  if (!Number.isInteger(units) || units < 0) return c.json({ units: ['Units must be a non-negative integer.'] }, 400);
  if (!['set', 'add', 'deduct'].includes(action)) return c.json({ action: ['Invalid action.'] }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return c.json({ expiry_date: ['Valid expiry_date (YYYY-MM-DD) is required.'] }, 400);

  let stock = await c.env.DB.prepare('SELECT * FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  if (!stock) {
    await c.env.DB
      .prepare('INSERT INTO blood_stock (blood_group, units_available, units_reserved, minimum_threshold, expiry_date) VALUES (?, 0, 0, 3, ?)')
      .bind(bloodGroup, expiryDate)
      .run();
    stock = await c.env.DB.prepare('SELECT * FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  }

  const prevUnits = Number(stock!.units_available || 0);
  let nextUnits = prevUnits;
  if (action === 'set') nextUnits = units;
  else if (action === 'add') nextUnits = prevUnits + units;
  else {
    if (prevUnits < units) {
      return c.json({ error: `Cannot deduct ${units} units. Only ${prevUnits} units of ${bloodGroup} are available in stock.` }, 400);
    }
    nextUnits = prevUnits - units;
  }

  const ts = nowIso();
  await c.env.DB
    .prepare('UPDATE blood_stock SET units_available = ?, expiry_date = ?, last_updated = ? WHERE blood_group = ?')
    .bind(nextUnits, expiryDate, ts, bloodGroup)
    .run();

  if ((action === 'add' || action === 'set') && units > 0) {
    const stamp = ts.replace(/[^0-9]/g, '').slice(0, 14);
    const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    const batchNum = `BB-${bloodGroup.replace('+', 'P').replace('-', 'N')}-${stamp}-${suffix}`;
    await c.env.DB
      .prepare(
        `INSERT INTO blood_batches (blood_group, units, batch_number, donor_name, collection_date, expiry_date, recorded_by_id, is_disposed, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .bind(bloodGroup, action === 'add' ? units : Math.max(1, units), batchNum, donorName, todayIstDate(), expiryDate, user.id, notes)
      .run();
  }

  const updatedRow = await c.env.DB.prepare('SELECT * FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  const serialized = serializeBloodStockRow(updatedRow!);
  return c.json({
    message: `Successfully updated ${bloodGroup} stock: ${prevUnits} -> ${nextUnits} units (Expiry: ${expiryDate}).`,
    stock: serialized,
    is_critical: nextUnits < 3,
  });
});

bloodBankRoutes.get('/batches', requireAuth, async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT bb.*, u.first_name, u.last_name, u.username
       FROM blood_batches bb
       LEFT JOIN users u ON u.id = bb.recorded_by_id
       ORDER BY bb.expiry_date ASC, bb.created_at DESC`
    )
    .all<Record<string, unknown>>();
  const today = todayIstDate();

  return c.json(
    rows.results.map((r) => {
      const exp = String(r.expiry_date);
      return {
        id: Number(r.id),
        blood_group: String(r.blood_group),
        units: Number(r.units),
        batch_number: String(r.batch_number),
        donor_name: String(r.donor_name || ''),
        collection_date: String(r.collection_date),
        expiry_date: exp,
        recorded_by: r.recorded_by_id ? Number(r.recorded_by_id) : null,
        recorded_by_name: r.recorded_by_id
          ? fullName(r.first_name as string, r.last_name as string, r.username as string)
          : 'System Staff',
        is_disposed: Boolean(r.is_disposed),
        notes: String(r.notes || ''),
        days_until_expiry: Math.round((Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000),
        created_at: String(r.created_at),
      };
    })
  );
});

bloodBankRoutes.post('/batches', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!canManageBloodBank(user)) return c.json({ detail: 'Not authorized.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const bloodGroup = String(body.blood_group || '').trim();
  const units = Number(body.units ?? 1);
  const batchNumber = String(body.batch_number || `BB-${Date.now()}`).trim();
  const expiryDate = String(body.expiry_date || addDaysDateStr(todayIstDate(), 35)).trim();
  if (!ALL_BLOOD_GROUPS.includes(bloodGroup)) return c.json({ blood_group: ['Invalid blood group.'] }, 400);

  const res = await c.env.DB
    .prepare(
      `INSERT INTO blood_batches (blood_group, units, batch_number, donor_name, collection_date, expiry_date, recorded_by_id, is_disposed, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .bind(bloodGroup, units, batchNumber, String(body.donor_name || ''), todayIstDate(), expiryDate, user.id, String(body.notes || ''))
    .run();

  const existing = await c.env.DB.prepare('SELECT * FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  if (!existing) {
    await c.env.DB
      .prepare('INSERT INTO blood_stock (blood_group, units_available, minimum_threshold, expiry_date) VALUES (?, ?, 3, ?)')
      .bind(bloodGroup, units, expiryDate)
      .run();
  } else {
    const earliestExp = !existing.expiry_date || expiryDate < String(existing.expiry_date) ? expiryDate : String(existing.expiry_date);
    await c.env.DB
      .prepare('UPDATE blood_stock SET units_available = units_available + ?, expiry_date = ?, last_updated = ? WHERE blood_group = ?')
      .bind(units, earliestExp, nowIso(), bloodGroup)
      .run();
  }

  const row = await c.env.DB.prepare('SELECT * FROM blood_batches WHERE id = ?').bind(Number(res.meta.last_row_id)).first<Record<string, unknown>>();
  return c.json(
    {
      id: Number(row?.id),
      blood_group: bloodGroup,
      units,
      batch_number: batchNumber,
      donor_name: String(row?.donor_name || ''),
      collection_date: String(row?.collection_date),
      expiry_date: expiryDate,
      recorded_by: user.id,
      recorded_by_name: fullName(user.first_name, user.last_name, user.username),
      is_disposed: false,
      notes: String(row?.notes || ''),
      created_at: String(row?.created_at || nowIso()),
    },
    201
  );
});

bloodBankRoutes.get('/donors/matching', requireAuth, async (c) => {
  if (!canViewDonors(c.get('user')!)) return c.json({ detail: 'Not authorized to view donor registry.' }, 403);
  const bloodGroup = (c.req.query('blood_group') || '').trim().toUpperCase();
  const city = (c.req.query('city') || '').trim();
  if (!bloodGroup) return c.json({ error: 'blood_group parameter is required (e.g. ?blood_group=O-)' }, 400);

  const compatible = COMPATIBLE_DONORS[bloodGroup] ?? [bloodGroup];
  const placeholders = compatible.map(() => '?').join(', ');
  const rows = (
    await c.env.DB
      .prepare(`SELECT * FROM donors WHERE blood_group IN (${placeholders}) AND is_eligible = 1 ORDER BY created_at DESC`)
      .bind(...compatible)
      .all<Record<string, unknown>>()
  ).results;

  const sorted = city
    ? [...rows].sort((a, b) => {
        const aHit = String(a.city || '').toLowerCase().includes(city.toLowerCase()) ? 0 : 1;
        const bHit = String(b.city || '').toLowerCase().includes(city.toLowerCase()) ? 0 : 1;
        return aHit - bHit;
      })
    : rows;

  const today = todayIstDate();
  const donors = sorted.slice(0, 20).map((r) => serializeDonorRow(r, today));
  const stockRow = await c.env.DB.prepare('SELECT units_available FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  const avail = Number(stockRow?.units_available || 0);

  return c.json({
    requested_blood_group: bloodGroup,
    compatible_blood_groups: compatible,
    available_stock_units: avail,
    is_stock_low: avail < 3,
    matching_donors_count: donors.length,
    donors,
  });
});

bloodBankRoutes.get('/donors', requireAuth, async (c) => {
  if (!canViewDonors(c.get('user')!)) return c.json({ detail: 'Not authorized to view donor registry.' }, 403);
  const bg = c.req.query('blood_group');
  const city = c.req.query('city');
  const canDonate = c.req.query('can_donate');
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (bg) {
    clauses.push('blood_group = ?');
    binds.push(bg);
  }
  if (city) {
    clauses.push('city LIKE ?');
    binds.push(`%${city}%`);
  }
  if (canDonate === 'true') {
    clauses.push('is_eligible = 1');
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`SELECT * FROM donors ${where} ORDER BY created_at DESC`).bind(...binds).all<Record<string, unknown>>();
  const today = todayIstDate();
  return c.json(rows.results.map((r) => serializeDonorRow(r, today)));
});

bloodBankRoutes.post('/donors', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!canViewDonors(user)) return c.json({ detail: 'Not authorized.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const name = String(body.name || '').trim();
  const bg = String(body.blood_group || '').trim();
  const phone = String(body.phone || '').trim();
  if (!name || !bg || !phone) return c.json({ detail: 'name, blood_group, and phone are required.' }, 400);

  const res = await c.env.DB
    .prepare(
      `INSERT INTO donors (name, blood_group, phone, city, age, gender, address, last_donation_date, is_eligible, recorded_by_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      name,
      bg,
      phone,
      String(body.city || ''),
      Number(body.age ?? 28),
      String(body.gender || 'M'),
      String(body.address || ''),
      body.last_donation_date ? String(body.last_donation_date) : null,
      body.is_eligible === false ? 0 : 1,
      user.id,
      String(body.notes || '')
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM donors WHERE id = ?').bind(Number(res.meta.last_row_id)).first<Record<string, unknown>>();
  return c.json(serializeDonorRow(row!), 201);
});

bloodBankRoutes.get('/requests', requireAuth, async (c) => {
  const user = c.get('user')!;
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    clauses.push('br.patient_id = ?');
    binds.push(user.patient_profile_id);
  }
  const priority = c.req.query('priority');
  const statusParam = c.req.query('status');
  const bg = c.req.query('blood_group');
  if (priority) {
    clauses.push('br.priority = ?');
    binds.push(priority);
  }
  if (statusParam) {
    clauses.push('br.status = ?');
    binds.push(statusParam);
  }
  if (bg) {
    clauses.push('br.blood_group = ?');
    binds.push(bg);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return c.json(await fetchBloodRequestsDetailed(c.env.DB, where, binds));
});

bloodBankRoutes.post('/requests', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const bloodGroup = String(body.blood_group || '').trim();
  const unitsReq = Math.max(1, Number(body.units_required ?? 1));
  const priority = ['normal', 'urgent', 'emergency'].includes(String(body.priority || 'normal')) ? String(body.priority || 'normal') : 'normal';
  const purpose = String(body.purpose || 'other');
  let patientName = String(body.patient_name || '').trim();

  if (!ALL_BLOOD_GROUPS.includes(bloodGroup)) return c.json({ blood_group: ['Invalid blood group.'] }, 400);

  let patientId: number | null = parseIntId((body.patient_id ?? body.patient) as string);
  const staffCaller = isAnyStaffUser(user);

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json({ detail: 'Patient profile required.' }, 403);
    if (patientId && patientId !== user.patient_profile_id) {
      return c.json({ detail: 'Access denied. Patients can only request blood for their own profile.' }, 403);
    }
    patientId = user.patient_profile_id;
    if (!patientName) patientName = fullName(user.first_name, user.last_name, user.username);
  } else if (patientId) {
    const pat = await c.env.DB
      .prepare('SELECT p.id, u.first_name, u.last_name, u.username FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ?')
      .bind(patientId)
      .first<Record<string, unknown>>();
    if (pat && !patientName) {
      patientName = fullName(pat.first_name as string, pat.last_name as string, pat.username as string);
    } else if (!pat) {
      patientId = null;
    }
  } else if (user.patient_profile_id) {
    patientId = user.patient_profile_id;
    if (!patientName) patientName = fullName(user.first_name, user.last_name, user.username);
  }

  const ts = nowIso();
  const res = await c.env.DB
    .prepare(
      `INSERT INTO blood_requests
       (patient_id, patient_name, hospital_ward, requested_by_id, blood_group, units_required, units_provided, purpose, priority, status, required_by_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'pending', ?, ?, ?, ?)`
    )
    .bind(
      patientId,
      patientName || 'Patient',
      String(body.hospital_ward || ''),
      user.id,
      bloodGroup,
      unitsReq,
      purpose,
      priority,
      body.required_by_date ? String(body.required_by_date) : null,
      String(body.notes || ''),
      ts,
      ts
    )
    .run();

  const reqId = Number(res.meta.last_row_id);
  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'BloodRequest',
    resource_id: reqId,
    patient_id: patientId,
    details: `Requested ${unitsReq}u of ${bloodGroup} (${priority}).`,
  });

  const stockRow = await c.env.DB.prepare('SELECT units_available FROM blood_stock WHERE blood_group = ?').bind(bloodGroup).first<Record<string, unknown>>();
  const availUnits = Number(stockRow?.units_available || 0);
  const isStockLow = availUnits < 3 || availUnits < unitsReq;

  let matchingDonors: unknown[] = [];
  if (isStockLow && staffCaller) {
    const compat = COMPATIBLE_DONORS[bloodGroup] ?? [bloodGroup];
    const ph = compat.map(() => '?').join(', ');
    const dRows = (
      await c.env.DB
        .prepare(`SELECT * FROM donors WHERE blood_group IN (${ph}) AND is_eligible = 1 ORDER BY created_at DESC LIMIT 15`)
        .bind(...compat)
        .all<Record<string, unknown>>()
    ).results;
    matchingDonors = dRows.map((d) => serializeDonorRow(d));
  }

  const [createdReq] = await fetchBloodRequestsDetailed(c.env.DB, 'WHERE br.id = ?', [reqId]);
  return c.json(
    {
      message: `Blood request #${reqId} for ${unitsReq} unit(s) of ${bloodGroup} submitted with ${priority.toUpperCase()} priority.`,
      request: createdReq,
      stock_status: {
        blood_group: bloodGroup,
        units_available: availUnits,
        units_required: unitsReq,
        is_stock_low: isStockLow,
        alert_message: isStockLow
          ? `ATTENTION: ${bloodGroup} stock is critically low! (Available: ${availUnits} units, Required: ${unitsReq} units). Matching donors listed below for immediate outreach.`
          : `Stock sufficient (${availUnits} units available in blood bank).`,
      },
      matching_donors: matchingDonors,
    },
    201
  );
});

bloodBankRoutes.patch('/requests/:pk/status', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!canManageBloodBank(user)) return c.json({ detail: 'Blood bank staff or admin access required.' }, 403);

  const id = parseIntId(c.req.param('pk'));
  const br = id ? await c.env.DB.prepare('SELECT * FROM blood_requests WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!br) return c.json({ detail: 'Not found.' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const newStatus = String(body.status || '');
  const rejectionReason = String(body.rejection_reason || '');
  const valid = ['approved', 'rejected', 'fulfilled', 'cancelled'];
  if (!valid.includes(newStatus)) {
    return c.json({ error: `Invalid status '${newStatus}'. Allowed: ${valid.join(', ')}` }, 400);
  }
  if (['fulfilled', 'rejected', 'cancelled'].includes(String(br.status))) {
    return c.json({ error: `Request #${id} is already ${String(br.status)} and cannot be modified.` }, 400);
  }

  const reqUnits = Number(br.units_required || 1);
  const bg = String(br.blood_group);
  let provided = Number(br.units_provided || 0);
  const ts = nowIso();

  if (newStatus === 'fulfilled') {
    const stock = await c.env.DB.prepare('SELECT units_available FROM blood_stock WHERE blood_group = ?').bind(bg).first<Record<string, unknown>>();
    const avail = Number(stock?.units_available || 0);
    if (!stock || avail < reqUnits) {
      return c.json({ error: `Insufficient ${bg} blood units in stock to fulfill this request.` }, 400);
    }
    await c.env.DB.prepare('UPDATE blood_stock SET units_available = units_available - ?, last_updated = ? WHERE blood_group = ?').bind(reqUnits, ts, bg).run();
    provided = reqUnits;
  }

  await c.env.DB
    .prepare(
      `UPDATE blood_requests SET status = ?, units_provided = ?, reviewed_by_id = ?, rejection_reason = COALESCE(NULLIF(?, ''), rejection_reason), updated_at = ?
       WHERE id = ?`
    )
    .bind(newStatus, provided, user.id, rejectionReason, ts, id)
    .run();

  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'BloodRequestStatus',
    resource_id: id!,
    patient_id: br.patient_id ? Number(br.patient_id) : null,
    details: `BloodRequest #${id} updated to ${newStatus}.`,
  });

  const [updated] = await fetchBloodRequestsDetailed(c.env.DB, 'WHERE br.id = ?', [id]);
  return c.json({
    message: `Blood Request #${id} status updated to ${newStatus.toUpperCase()}.`,
    request: updated,
  });
});
