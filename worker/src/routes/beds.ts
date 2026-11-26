import { Hono } from 'hono';
import { requireAuth } from '../auth';
import { fetchAdmissionsDetailed, fetchBedsDetailed, fetchWardsWithBeds } from '../serializers';
import { AppEnv, fullName, isAdminUser, isClinicalStaffUser, nowIso, parseIntId, recordAuditLog } from '../utils';

export const bedsRoutes = new Hono<AppEnv>({ strict: false });

bedsRoutes.get('/overview', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Clinical staff authorization required.' }, 403);

  const wards = await fetchWardsWithBeds(c.env.DB, true);
  const allBeds = wards.flatMap((w) => w.beds);

  const totalBeds = allBeds.length;
  const availableBeds = allBeds.filter((b) => b.status === 'available').length;
  const occupiedBeds = allBeds.filter((b) => b.status === 'occupied').length;
  const cleaningBeds = allBeds.filter((b) => b.status === 'cleaning').length;
  const maintenanceBeds = allBeds.filter((b) => b.status === 'maintenance' || b.status === 'reserved').length;

  const wardTypesSummary: Record<string, { total: number; available: number; occupied: number; cleaning: number }> = {
    general: { total: 0, available: 0, occupied: 0, cleaning: 0 },
    icu: { total: 0, available: 0, occupied: 0, cleaning: 0 },
    private: { total: 0, available: 0, occupied: 0, cleaning: 0 },
    other: { total: 0, available: 0, occupied: 0, cleaning: 0 },
  };

  for (const w of wards) {
    const cat = ['general', 'icu', 'private'].includes(w.ward_type) ? w.ward_type : 'other';
    wardTypesSummary[cat].total += w.total_beds_count;
    wardTypesSummary[cat].available += w.available_beds_count;
    wardTypesSummary[cat].occupied += w.occupied_beds_count;
    wardTypesSummary[cat].cleaning += w.cleaning_beds_count;
  }

  return c.json({
    summary: {
      total_beds: totalBeds,
      available_beds: availableBeds,
      occupied_beds: occupiedBeds,
      cleaning_beds: cleaningBeds,
      maintenance_beds: maintenanceBeds,
      occupancy_rate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0.0,
    },
    ward_types: wardTypesSummary,
    wards,
    timestamp: nowIso(),
  });
});

bedsRoutes.get('/wards', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Not authorized.' }, 403);
  const wardType = c.req.query('ward_type') || undefined;
  return c.json(await fetchWardsWithBeds(c.env.DB, true, { wardType }));
});

bedsRoutes.post('/wards', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const name = String(body.name || '').trim();
  const wardType = String(body.ward_type || 'general').trim();
  if (!name) return c.json({ name: ['Ward name is required.'] }, 400);

  const dup = await c.env.DB.prepare('SELECT id FROM wards WHERE name = ?').bind(name).first();
  if (dup) return c.json({ name: ['Ward with this name already exists.'] }, 400);

  const res = await c.env.DB
    .prepare('INSERT INTO wards (name, ward_type, department_id, total_beds, floor_number, is_active) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      name,
      wardType,
      parseIntId(body.department as string),
      Number(body.total_beds ?? 0),
      Number(body.floor_number ?? 1),
      body.is_active === false ? 0 : 1
    )
    .run();

  const [created] = await fetchWardsWithBeds(c.env.DB, true, { id: Number(res.meta.last_row_id) });
  return c.json(created, 201);
});

bedsRoutes.get('/wards/:pk', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const [ward] = id ? await fetchWardsWithBeds(c.env.DB, true, { id }) : [];
  if (!ward) return c.json({ detail: 'Not found.' }, 404);
  return c.json(ward);
});

bedsRoutes.put('/wards/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT * FROM wards WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));

  await c.env.DB
    .prepare('UPDATE wards SET name = ?, ward_type = ?, department_id = ?, total_beds = ?, floor_number = ?, is_active = ? WHERE id = ?')
    .bind(
      body.name !== undefined ? String(body.name).trim() : String(existing.name),
      body.ward_type !== undefined ? String(body.ward_type) : String(existing.ward_type),
      body.department !== undefined ? parseIntId(body.department as string) : (existing.department_id as number | null),
      body.total_beds !== undefined ? Number(body.total_beds) : Number(existing.total_beds),
      body.floor_number !== undefined ? Number(body.floor_number) : Number(existing.floor_number),
      body.is_active !== undefined ? (body.is_active ? 1 : 0) : Number(existing.is_active),
      id
    )
    .run();

  const [updated] = await fetchWardsWithBeds(c.env.DB, true, { id: id! });
  return c.json(updated);
});

bedsRoutes.patch('/wards/:pk', requireAuth, async (c) => bedsRoutes.fetch(new Request(c.req.url, { method: 'PUT', headers: c.req.raw.headers, body: await c.req.raw.clone().text() }), c.env, c.executionCtx));

bedsRoutes.delete('/wards/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT id FROM wards WHERE id = ?').bind(id).first() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  await c.env.DB.prepare('DELETE FROM wards WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

bedsRoutes.get('/admissions/active', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    return c.json(await fetchAdmissionsDetailed(c.env.DB, "WHERE a.status = 'admitted' AND a.patient_id = ?", [user.patient_profile_id]));
  }
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Not authorized.' }, 403);

  const clauses = ["a.status = 'admitted'"];
  const binds: unknown[] = [];
  if (c.req.query('my_patients') && user.doctor_profile_id) {
    clauses.push('a.attending_doctor_id = ?');
    binds.push(user.doctor_profile_id);
  }
  const docId = parseIntId(c.req.query('doctor'));
  if (docId) {
    clauses.push('a.attending_doctor_id = ?');
    binds.push(docId);
  }
  const wt = c.req.query('ward_type');
  if (wt) {
    clauses.push('w.ward_type = ?');
    binds.push(wt);
  }
  const search = c.req.query('search');
  if (search) {
    const q = `%${search}%`;
    clauses.push('(pu.first_name LIKE ? OR pu.last_name LIKE ? OR b.bed_number LIKE ? OR w.name LIKE ?)');
    binds.push(q, q, q, q);
  }
  return c.json(await fetchAdmissionsDetailed(c.env.DB, `WHERE ${clauses.join(' AND ')}`, binds));
});

bedsRoutes.post('/admissions/auto-admit', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Clinical staff authorization required.' }, 403);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const tokenId = parseIntId(body.token_id as string);
  let patientId = parseIntId(body.patient_id as string);
  const wardType = String(body.ward_type || 'general').trim();
  const diagnosis = String(body.diagnosis || '').trim();
  let docId = parseIntId(body.attending_doctor_id as string);
  const preferredWardId = parseIntId(body.preferred_ward_id as string);

  if (!diagnosis) return c.json({ diagnosis: ['Diagnosis is required.'] }, 400);

  if (tokenId) {
    const tok = await c.env.DB.prepare('SELECT id, patient_id, doctor_id FROM opd_tokens WHERE id = ?').bind(tokenId).first<Record<string, unknown>>();
    if (!tok) return c.json({ error: 'Token not found.' }, 404);
    patientId = Number(tok.patient_id);
    if (!docId && tok.doctor_id) docId = Number(tok.doctor_id);
  } else if (!patientId) {
    return c.json({ error: 'Either token_id or patient_id must be provided.' }, 400);
  }

  const pat = await c.env.DB
    .prepare('SELECT p.id, u.first_name, u.last_name, u.username FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ?')
    .bind(patientId)
    .first<Record<string, unknown>>();
  if (!pat) return c.json({ error: 'Patient not found.' }, 404);
  const patName = fullName(pat.first_name as string, pat.last_name as string, pat.username as string);

  const existingAdm = await c.env.DB
    .prepare(
      `SELECT b.bed_number, w.name AS ward_name FROM admissions a
       JOIN beds b ON b.id = a.bed_id JOIN wards w ON w.id = b.ward_id
       WHERE a.patient_id = ? AND a.status = 'admitted' LIMIT 1`
    )
    .bind(patientId)
    .first<Record<string, unknown>>();
  if (existingAdm) {
    return c.json({ error: `Patient ${patName} is already admitted to Bed ${String(existingAdm.bed_number)} in ${String(existingAdm.ward_name)}.` }, 400);
  }

  if (!docId && user.doctor_profile_id) docId = user.doctor_profile_id;

  const availBeds = (
    await c.env.DB
      .prepare(
        `SELECT b.id, b.bed_number, w.id AS ward_id, w.name AS ward_name, w.ward_type, w.floor_number
         FROM beds b JOIN wards w ON w.id = b.ward_id
         WHERE w.ward_type = ? AND w.is_active = 1 AND b.status = 'available'
         ORDER BY w.floor_number ASC, b.bed_number ASC`
      )
      .bind(wardType)
      .all<Record<string, unknown>>()
  ).results;

  const assigned = (preferredWardId ? availBeds.find((b) => Number(b.ward_id) === preferredWardId) : undefined) ?? availBeds[0];
  if (!assigned) {
    const counts = await c.env.DB
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) AS occupied
         FROM beds b JOIN wards w ON w.id = b.ward_id WHERE w.ward_type = ?`
      )
      .bind(wardType)
      .first<Record<string, unknown>>();
    const total = Number(counts?.total || 0);
    return c.json(
      {
        error: `No available beds in ${wardType.toUpperCase()} wards. All ${total} beds are currently occupied or being cleaned.`,
        ward_type: wardType,
        total_beds: total,
        occupied_beds: Number(counts?.occupied || 0),
      },
      400
    );
  }

  const bedId = Number(assigned.id);
  const ts = nowIso();
  const admRes = await c.env.DB
    .prepare(
      `INSERT INTO admissions (patient_id, bed_id, attending_doctor_id, token_id, diagnosis, status, admission_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admitted', ?, ?, ?)`
    )
    .bind(patientId, bedId, docId, tokenId, diagnosis, ts, ts, ts)
    .run();

  const admId = Number(admRes.meta.last_row_id);
  const batchOps = [c.env.DB.prepare("UPDATE beds SET status = 'occupied', updated_at = ? WHERE id = ?").bind(ts, bedId)];
  if (tokenId) {
    batchOps.push(c.env.DB.prepare("UPDATE opd_tokens SET status = 'admitted', updated_at = ? WHERE id = ?").bind(ts, tokenId));
  }
  await c.env.DB.batch(batchOps);

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'BedAdmission',
    resource_id: admId,
    patient_id: patientId,
    details: `Admitted to ${String(assigned.ward_name)} Bed ${String(assigned.bed_number)}.`,
  });

  const [admissionData] = await fetchAdmissionsDetailed(c.env.DB, 'WHERE a.id = ?', [admId]);
  return c.json(
    {
      message: `Patient ${patName} admitted successfully! Auto-assigned Bed ${String(assigned.bed_number)} in ${String(assigned.ward_name)}.`,
      admission: admissionData,
      assigned_bed: {
        id: bedId,
        bed_number: String(assigned.bed_number),
        ward_name: String(assigned.ward_name),
        ward_type: String(assigned.ward_type),
        floor_number: Number(assigned.floor_number || 1),
      },
    },
    201
  );
});

bedsRoutes.post('/admissions/:pk/discharge', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const adm = id
    ? await c.env.DB
        .prepare(
          `SELECT a.*, b.bed_number, u.first_name, u.last_name, u.username
           FROM admissions a JOIN beds b ON b.id = a.bed_id
           JOIN patients p ON p.id = a.patient_id JOIN users u ON u.id = p.user_id
           WHERE a.id = ?`
        )
        .bind(id)
        .first<Record<string, unknown>>()
    : null;
  if (!adm) return c.json({ detail: 'Not found.' }, 404);
  if (adm.status === 'discharged') return c.json({ error: 'Patient has already been discharged.' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const notes = String(body.discharge_notes || '');
  const ts = nowIso();
  const bedId = Number(adm.bed_id);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admissions SET status = 'discharged', discharge_date = ?, discharge_notes = ?, updated_at = ? WHERE id = ?").bind(ts, notes, ts, id),
    c.env.DB.prepare("UPDATE beds SET status = 'available', updated_at = ? WHERE id = ?").bind(ts, bedId),
  ]);

  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'BedDischarge',
    resource_id: id!,
    patient_id: Number(adm.patient_id),
    details: `Discharged from Bed ${String(adm.bed_number)}. Notes: ${notes.slice(0, 120)}`,
  });

  const [admData] = await fetchAdmissionsDetailed(c.env.DB, 'WHERE a.id = ?', [id]);
  const [bedData] = await fetchBedsDetailed(c.env.DB, true, { id: bedId });
  const patName = fullName(adm.first_name as string, adm.last_name as string, adm.username as string);

  return c.json({
    message: `Patient ${patName} discharged successfully. Bed ${String(adm.bed_number)} is now Available again.`,
    admission: admData,
    bed: bedData,
  });
});

bedsRoutes.get('/admissions', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    return c.json(await fetchAdmissionsDetailed(c.env.DB, 'WHERE a.patient_id = ?', [user.patient_profile_id]));
  }
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Not authorized.' }, 403);
  return c.json(await fetchAdmissionsDetailed(c.env.DB, '', []));
});

bedsRoutes.post('/admissions', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const patientId = parseIntId(body.patient as string);
  const bedId = parseIntId(body.bed as string);
  if (!patientId || !bedId) return c.json({ detail: 'patient and bed are required.' }, 400);

  const ts = nowIso();
  const res = await c.env.DB
    .prepare(
      `INSERT INTO admissions (patient_id, bed_id, attending_doctor_id, token_id, diagnosis, status, admission_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admitted', ?, ?, ?)`
    )
    .bind(patientId, bedId, parseIntId(body.attending_doctor as string), parseIntId(body.token as string), String(body.diagnosis || ''), ts, ts, ts)
    .run();
  await c.env.DB.prepare("UPDATE beds SET status = 'occupied', updated_at = ? WHERE id = ?").bind(ts, bedId).run();
  const [created] = await fetchAdmissionsDetailed(c.env.DB, 'WHERE a.id = ?', [Number(res.meta.last_row_id)]);
  return c.json(created, 201);
});

bedsRoutes.patch('/:pk/status', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const bed = id ? await c.env.DB.prepare('SELECT id, bed_number FROM beds WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!bed) return c.json({ detail: 'Not found.' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const newStatus = String(body.status || '');
  const valid = ['available', 'occupied', 'cleaning', 'maintenance', 'reserved'];
  if (!valid.includes(newStatus)) return c.json({ error: `Invalid status '${newStatus}'. Allowed: ${valid.join(', ')}` }, 400);

  await c.env.DB.prepare('UPDATE beds SET status = ?, updated_at = ? WHERE id = ?').bind(newStatus, nowIso(), id).run();
  const [updated] = await fetchBedsDetailed(c.env.DB, true, { id: id! });
  return c.json({ message: `Bed ${String(bed.bed_number)} status updated to ${updated.status_display}.`, bed: updated });
});

bedsRoutes.get('/', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  return c.json(
    await fetchBedsDetailed(c.env.DB, true, {
      wardId: parseIntId(c.req.query('ward')) ?? undefined,
      status: c.req.query('status') || undefined,
      wardType: c.req.query('ward_type') || undefined,
    })
  );
});

bedsRoutes.post('/', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const body = await c.req.json<unknown>().catch((): Record<string, unknown> => ({}));
  const items = Array.isArray(body) ? body : [body];
  const createdIds: number[] = [];

  for (const item of items) {
    const obj = item as Record<string, unknown>;
    const wardId = parseIntId(obj.ward as string);
    const bedNumber = String(obj.bed_number || '').trim().toUpperCase();
    if (!wardId || !bedNumber) return c.json({ detail: 'ward and bed_number are required.' }, 400);
    const res = await c.env.DB
      .prepare('INSERT INTO beds (ward_id, bed_number, status, has_oxygen, has_ventilator, has_monitor) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(wardId, bedNumber, String(obj.status || 'available'), obj.has_oxygen === false ? 0 : 1, obj.has_ventilator ? 1 : 0, obj.has_monitor ? 1 : 0)
      .run();
    createdIds.push(Number(res.meta.last_row_id));
  }

  const all = await fetchBedsDetailed(c.env.DB, true);
  const created = all.filter((b) => createdIds.includes(b.id));
  return c.json(Array.isArray(body) ? created : created[0], 201);
});

bedsRoutes.get('/:pk', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const [bed] = id ? await fetchBedsDetailed(c.env.DB, true, { id }) : [];
  if (!bed) return c.json({ detail: 'Not found.' }, 404);
  return c.json(bed);
});

bedsRoutes.put('/:pk', requireAuth, async (c) => {
  if (!isClinicalStaffUser(c.get('user')!)) return c.json({ detail: 'Not authorized.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT * FROM beds WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));

  await c.env.DB
    .prepare('UPDATE beds SET bed_number = ?, status = ?, has_oxygen = ?, has_ventilator = ?, has_monitor = ?, updated_at = ? WHERE id = ?')
    .bind(
      body.bed_number !== undefined ? String(body.bed_number).trim().toUpperCase() : String(existing.bed_number),
      body.status !== undefined ? String(body.status) : String(existing.status),
      body.has_oxygen !== undefined ? (body.has_oxygen ? 1 : 0) : Number(existing.has_oxygen),
      body.has_ventilator !== undefined ? (body.has_ventilator ? 1 : 0) : Number(existing.has_ventilator),
      body.has_monitor !== undefined ? (body.has_monitor ? 1 : 0) : Number(existing.has_monitor),
      nowIso(),
      id
    )
    .run();
  const [updated] = await fetchBedsDetailed(c.env.DB, true, { id: id! });
  return c.json(updated);
});

bedsRoutes.patch('/:pk', requireAuth, async (c) => bedsRoutes.fetch(new Request(c.req.url, { method: 'PUT', headers: c.req.raw.headers, body: await c.req.raw.clone().text() }), c.env, c.executionCtx));

bedsRoutes.delete('/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT id FROM beds WHERE id = ?').bind(id).first() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  await c.env.DB.prepare('DELETE FROM beds WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});
