import { Hono } from 'hono';
import { requireAuth } from '../auth';
import { STANDARD_TIME_SLOTS, fetchTokensDetailed } from '../serializers';
import {
  AppEnv,
  addDaysDateStr,
  daysBetweenYmd,
  formatDisplayDate,
  formatIstTime,
  fullName,
  isAdminUser,
  isClinicalStaffUser,
  nowIso,
  parseIntId,
  recordAuditLog,
  todayIstDate,
} from '../utils';

const PRIORITY_SQL = "CASE priority WHEN 'emergency' THEN 1 WHEN 'senior_citizen' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END";
const PRIORITY_ALIAS_SQL = "CASE t.priority WHEN 'emergency' THEN 1 WHEN 'senior_citizen' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END";

export async function dispatchQueueProximityNotifications(db: D1Database, doctorId: number, appointmentDate: string): Promise<number> {
  const docRow = await db
    .prepare(
      `SELECT d.room_number, u.first_name, u.last_name, u.username
       FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
    )
    .bind(doctorId)
    .first<Record<string, unknown>>();
  if (!docRow) return 0;

  const docName = `Dr. ${fullName(docRow.first_name as string, docRow.last_name as string, docRow.username as string)}`;
  const room = String(docRow.room_number || 'OPD Room');

  const waiting = (
    await db
      .prepare(
        `SELECT t.id, t.token_code, t.patient_id, u.phone
         FROM opd_tokens t
         JOIN patients p ON p.id = t.patient_id
         JOIN users u ON u.id = p.user_id
         WHERE t.doctor_id = ? AND t.appointment_date = ? AND t.status = 'waiting'
         ORDER BY ${PRIORITY_ALIAS_SQL} ASC, t.token_number ASC
         LIMIT 3`
      )
      .bind(doctorId, appointmentDate)
      .all<Record<string, unknown>>()
  ).results;

  let dispatched = 0;
  for (let idx = 0; idx < waiting.length; idx++) {
    const tok = waiting[idx];
    const tokenId = Number(tok.id);
    const already = await db
      .prepare("SELECT id FROM opd_notifications WHERE token_id = ? AND trigger_event = 'queue_proximity' LIMIT 1")
      .bind(tokenId)
      .first();
    if (already) continue;

    const pos = idx + 1;
    const ahead = idx;
    const phone = String(tok.phone || '').trim();
    const title = `Queue Alert: Token ${String(tok.token_code)} is #${pos} in line`;
    const msg = `SmartCare HMS: Your OPD Token ${String(tok.token_code)} for ${docName} (${room}) is now ${pos} position(s) away (${ahead} patient(s) ahead). Please proceed to the waiting lounge.`;

    await db.batch([
      db
        .prepare("INSERT INTO opd_notifications (patient_id, token_id, channel, trigger_event, recipient_phone, title, message, status, is_read) VALUES (?, ?, 'sms', 'queue_proximity', ?, ?, ?, 'simulated', 0)")
        .bind(Number(tok.patient_id), tokenId, phone, title, msg),
      db
        .prepare("INSERT INTO opd_notifications (patient_id, token_id, channel, trigger_event, recipient_phone, title, message, status, is_read) VALUES (?, ?, 'whatsapp', 'queue_proximity', ?, ?, ?, 'simulated', 0)")
        .bind(Number(tok.patient_id), tokenId, phone, title, msg),
      db
        .prepare("INSERT INTO opd_notifications (patient_id, token_id, channel, trigger_event, recipient_phone, title, message, status, is_read) VALUES (?, ?, 'in_app', 'queue_proximity', ?, ?, ?, 'sent', 0)")
        .bind(Number(tok.patient_id), tokenId, phone, title, msg),
    ]);
    dispatched += 3;
  }

  return dispatched;
}

export const opdRoutes = new Hono<AppEnv>({ strict: false });

opdRoutes.get('/public/display/:doctor_id', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isClinicalStaffUser(user)) return c.json({ detail: 'Clinical staff authorization required.' }, 403);

  const doctorId = parseIntId(c.req.param('doctor_id'));
  if (!doctorId) return c.json({ detail: 'Doctor not found.' }, 404);

  const doc = await c.env.DB
    .prepare(
      `SELECT d.*, u.first_name, u.last_name, u.username, dept.name AS dept_name
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = ?`
    )
    .bind(doctorId)
    .first<Record<string, unknown>>();
  if (!doc) return c.json({ detail: 'Doctor not found.' }, 404);

  const today = todayIstDate();
  await c.env.DB
    .prepare('INSERT OR IGNORE INTO opd_queues (doctor_id, queue_date, current_token, total_tokens, avg_consult_minutes, is_active) VALUES (?, ?, 0, 0, ?, 1)')
    .bind(doctorId, today, Number(doc.avg_consult_minutes || 15))
    .run();

  const queue = await c.env.DB
    .prepare('SELECT current_token, total_tokens FROM opd_queues WHERE doctor_id = ? AND queue_date = ?')
    .bind(doctorId, today)
    .first<Record<string, unknown>>();

  const todayTokens = (
    await c.env.DB
      .prepare(`SELECT id, token_code, token_number, priority, status, time_slot, appointment_date FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? ORDER BY ${PRIORITY_SQL} ASC, token_number ASC`)
      .bind(doctorId, today)
      .all<Record<string, unknown>>()
  ).results;

  const docDisplayName = `Dr. ${fullName(doc.first_name as string, doc.last_name as string, doc.username as string)}`;
  const room = String(doc.room_number || 'Room 101');
  const sanitizeDisplay = (t: Record<string, unknown>) => ({
    id: Number(t.id),
    token_code: String(t.token_code),
    token_number: Number(t.token_number),
    doctor_name: docDisplayName,
    room_number: room,
    priority: String(t.priority),
    status: String(t.status),
    time_slot: String(t.time_slot || ''),
    appointment_date: String(t.appointment_date),
  });

  const nowServingRow = todayTokens.find((t) => t.status === 'called' || t.status === 'in_progress') ?? null;
  const next5 = todayTokens.filter((t) => t.status === 'waiting').slice(0, 5);

  return c.json({
    doctor: {
      id: doctorId,
      name: docDisplayName,
      department: String(doc.dept_name || 'General OPD'),
      room_number: room,
      avg_consult_minutes: Number(doc.avg_consult_minutes || 15),
      is_available: Boolean(doc.is_available),
    },
    now_serving: nowServingRow ? sanitizeDisplay(nowServingRow) : null,
    next_tokens: next5.map(sanitizeDisplay),
    stats: {
      current_token_number: Number(queue?.current_token || 0),
      waiting_count: todayTokens.filter((t) => t.status === 'waiting').length,
      completed_count: todayTokens.filter((t) => t.status === 'completed').length,
      total_today: todayTokens.length,
    },
    server_time: formatIstTime(),
    server_date: formatDisplayDate(today),
  });
});

opdRoutes.get('/doctors/:doctor_id/slots', requireAuth, async (c) => {
  const doctorId = parseIntId(c.req.param('doctor_id'));
  if (!doctorId) return c.json({ detail: 'Doctor not found.' }, 404);
  const doc = await c.env.DB.prepare('SELECT id FROM doctors WHERE id = ?').bind(doctorId).first();
  if (!doc) return c.json({ detail: 'Doctor not found.' }, 404);

  const dateStr = c.req.query('date');
  const today = todayIstDate();
  let targetDate = today;
  if (dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return c.json({ detail: 'Invalid date format. Use YYYY-MM-DD.' }, 400);
    }
    targetDate = dateStr;
  }

  const leave = await c.env.DB
    .prepare('SELECT reason FROM doctor_leaves WHERE doctor_id = ? AND is_approved = 1 AND start_date <= ? AND end_date >= ? LIMIT 1')
    .bind(doctorId, targetDate, targetDate)
    .first<Record<string, unknown>>();

  const counts = (
    await c.env.DB
      .prepare("SELECT time_slot, COUNT(*) AS cnt FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelled', 'skipped') GROUP BY time_slot")
      .bind(doctorId, targetDate)
      .all<Record<string, unknown>>()
  ).results;
  const countMap = new Map(counts.map((r) => [String(r.time_slot), Number(r.cnt)]));

  const slots = STANDARD_TIME_SLOTS.map((slot) => {
    const booked = countMap.get(slot) ?? 0;
    return {
      time_slot: slot,
      booked_count: booked,
      capacity: 4,
      available: !leave && booked < 4,
    };
  });

  return c.json({
    doctor_id: doctorId,
    date: targetDate,
    is_on_leave: Boolean(leave),
    leave_reason: leave ? String(leave.reason || '') : null,
    slots,
  });
});

opdRoutes.post('/tokens/generate', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!['patient', 'reception', 'admin', 'doctor'].includes(user.role) && !isAdminUser(user)) {
    return c.json({ detail: 'Not authorized to generate OPD tokens.' }, 403);
  }

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const doctorId = parseIntId(body.doctor as string);
  if (!doctorId) return c.json({ doctor: ['Please select a valid doctor.'] }, 400);

  const doc = await c.env.DB
    .prepare(
      `SELECT d.*, u.last_name, dept.id AS dept_id, dept.name AS dept_name
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       WHERE d.id = ?`
    )
    .bind(doctorId)
    .first<Record<string, unknown>>();
  if (!doc) return c.json({ doctor: ['Doctor not found.'] }, 400);

  const today = todayIstDate();
  const appointmentDate = body.appointment_date ? String(body.appointment_date).trim() : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    return c.json({ appointment_date: ['Invalid date format.'] }, 400);
  }
  const dayDiff = daysBetweenYmd(appointmentDate, today);
  if (dayDiff < 0) return c.json({ appointment_date: 'Cannot book appointments in the past.' }, 400);
  if (dayDiff > 30) return c.json({ appointment_date: 'Advance bookings can be made up to 30 days ahead.' }, 400);

  const leave = await c.env.DB
    .prepare('SELECT id FROM doctor_leaves WHERE doctor_id = ? AND is_approved = 1 AND start_date <= ? AND end_date >= ? LIMIT 1')
    .bind(doctorId, appointmentDate, appointmentDate)
    .first();
  if (leave) {
    return c.json({ appointment_date: `Dr. ${String(doc.last_name || '')} is on scheduled leave on ${appointmentDate}.` }, 400);
  }

  if (appointmentDate === today && !doc.is_available) {
    return c.json({ doctor: `Dr. ${String(doc.last_name || '')} is currently off duty.` }, 400);
  }

  let patientId = parseIntId(body.patient as string);
  if (user.role === 'patient') {
    if (!user.patient_profile_id) return c.json({ patient: 'Patient profile not found.' }, 400);
    if (patientId && patientId !== user.patient_profile_id) {
      return c.json({ patient: 'You may only book tokens for your own patient profile.' }, 400);
    }
    patientId = user.patient_profile_id;
  } else if (!patientId && user.patient_profile_id) {
    patientId = user.patient_profile_id;
  }
  if (!patientId) return c.json({ patient: 'Patient profile is required.' }, 400);

  const dupToken = await c.env.DB
    .prepare(
      `SELECT token_code FROM opd_tokens
       WHERE patient_id = ? AND doctor_id = ? AND appointment_date = ? AND status IN ('waiting', 'called', 'in_progress')
       LIMIT 1`
    )
    .bind(patientId, doctorId, appointmentDate)
    .first<Record<string, unknown>>();
  if (dupToken) {
    return c.json(
      {
        non_field_errors: [
          `An active appointment (${String(dupToken.token_code)}) already exists with Dr. ${String(doc.last_name || '')} on ${appointmentDate}.`,
        ],
      },
      400
    );
  }

  const timeSlot = String(body.time_slot || '').trim();
  if (timeSlot) {
    const slotCountRow = await c.env.DB
      .prepare("SELECT COUNT(*) AS cnt FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND status NOT IN ('cancelled', 'skipped')")
      .bind(doctorId, appointmentDate, timeSlot)
      .first<Record<string, unknown>>();
    if (Number(slotCountRow?.cnt || 0) >= 4) {
      return c.json({ time_slot: `Time slot ${timeSlot} is fully booked.` }, 400);
    }
  }

  const priority = ['normal', 'senior_citizen', 'emergency'].includes(String(body.priority || 'normal'))
    ? String(body.priority || 'normal')
    : 'normal';
  const symptoms = String(body.symptoms || '');
  const deptName = String(doc.dept_name || 'OPD');
  const prefix = deptName.length >= 3 ? deptName.slice(0, 3).toUpperCase() : 'MED';

  const maxRow = await c.env.DB
    .prepare('SELECT COALESCE(MAX(token_number), 0) AS max_num FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ?')
    .bind(doctorId, appointmentDate)
    .first<Record<string, unknown>>();
  const nextNum = Number(maxRow?.max_num || 0) + 1;
  const tokenCode = `${prefix}-${String(nextNum).padStart(3, '0')}`;
  const isAdvance = appointmentDate > today || Boolean(timeSlot) ? 1 : 0;

  const res = await c.env.DB
    .prepare(
      `INSERT INTO opd_tokens
       (patient_id, doctor_id, department_id, token_number, token_code, appointment_date, time_slot, is_advance_booking, status, priority, symptoms, is_emergency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?)`
    )
    .bind(
      patientId,
      doctorId,
      doc.dept_id ? Number(doc.dept_id) : null,
      nextNum,
      tokenCode,
      appointmentDate,
      timeSlot,
      isAdvance,
      priority,
      symptoms,
      priority === 'emergency' ? 1 : 0
    )
    .run();

  const tokenId = Number(res.meta.last_row_id);
  await c.env.DB
    .prepare(
      `INSERT INTO opd_queues (doctor_id, queue_date, current_token, total_tokens, avg_consult_minutes, is_active)
       VALUES (?, ?, 0, ?, ?, 1)
       ON CONFLICT(doctor_id, queue_date) DO UPDATE SET total_tokens = excluded.total_tokens`
    )
    .bind(doctorId, appointmentDate, nextNum, Number(doc.avg_consult_minutes || 15))
    .run();

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'OPDToken',
    resource_id: tokenId,
    patient_id: patientId,
    details: `Generated ${tokenCode} for ${appointmentDate} ${timeSlot || 'Walk-In'}.`,
  });

  if (appointmentDate === today) {
    await dispatchQueueProximityNotifications(c.env.DB, doctorId, appointmentDate);
  }

  const [created] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [tokenId]);
  return c.json(created, 201);
});

opdRoutes.get('/tokens/my-tokens', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.patient_profile_id) {
    return c.json({ detail: 'Logged in user does not have a patient profile.' }, 400);
  }
  const activeOnly = c.req.query('active')?.toLowerCase() === 'true';
  const where = activeOnly
    ? "WHERE t.patient_id = ? AND t.status IN ('waiting', 'called', 'in_progress')"
    : 'WHERE t.patient_id = ?';
  return c.json(await fetchTokensDetailed(c.env.DB, where, [user.patient_profile_id]));
});

opdRoutes.get('/tokens', requireAuth, async (c) => {
  const user = c.get('user')!;
  const dateStr = c.req.query('date');
  const today = todayIstDate();
  const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : today;

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    return c.json(
      await fetchTokensDetailed(c.env.DB, 'WHERE t.appointment_date = ? AND t.patient_id = ?', [targetDate, user.patient_profile_id], 't.token_number ASC')
    );
  }
  if (!isClinicalStaffUser(user)) return c.json([]);

  const clauses = ['t.appointment_date = ?'];
  const binds: unknown[] = [targetDate];
  const st = c.req.query('status');
  const docId = parseIntId(c.req.query('doctor'));
  if (st) {
    clauses.push('t.status = ?');
    binds.push(st);
  }
  if (docId) {
    clauses.push('t.doctor_id = ?');
    binds.push(docId);
  }
  return c.json(await fetchTokensDetailed(c.env.DB, `WHERE ${clauses.join(' AND ')}`, binds, 't.token_number ASC'));
});

opdRoutes.get('/tokens/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const [tok] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [id]);
  if (!tok) return c.json({ detail: 'Not found.' }, 404);

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id || tok.patient !== user.patient_profile_id) {
      return c.json({ detail: "You do not have permission to view another patient's token." }, 403);
    }
  } else if (!isClinicalStaffUser(user)) {
    return c.json({ detail: 'Not authorized to access OPD token details.' }, 403);
  }
  return c.json(tok);
});

opdRoutes.post('/tokens/:pk/cancel', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const tok = id ? await c.env.DB.prepare('SELECT id, patient_id, doctor_id, appointment_date, status, token_code FROM opd_tokens WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!tok) return c.json({ detail: 'Not found.' }, 404);

  if (user.role === 'patient') {
    if (!user.patient_profile_id || Number(tok.patient_id) !== user.patient_profile_id) {
      return c.json({ detail: 'You do not have permission to cancel this token.' }, 403);
    }
  } else if (!isClinicalStaffUser(user)) {
    return c.json({ detail: 'Not authorized to cancel tokens.' }, 403);
  }

  if (tok.status !== 'waiting') {
    return c.json({ detail: `Cannot cancel token with status '${String(tok.status)}'.` }, 400);
  }

  await c.env.DB.prepare("UPDATE opd_tokens SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  await dispatchQueueProximityNotifications(c.env.DB, Number(tok.doctor_id), String(tok.appointment_date));
  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'OPDTokenCancelled',
    resource_id: id!,
    patient_id: Number(tok.patient_id),
    details: `Token ${String(tok.token_code)} cancelled.`,
  });

  const [updated] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [id]);
  return c.json({ message: `Token ${String(tok.token_code)} has been cancelled.`, token: updated });
});

opdRoutes.get('/doctor/queue', requireAuth, async (c) => {
  const user = c.get('user')!;
  let doctorId = user.doctor_profile_id;
  const reqDocId = parseIntId(c.req.query('doctor_id'));
  if (!doctorId) {
    if (isAdminUser(user) && reqDocId) doctorId = reqDocId;
    else return c.json({ detail: 'Logged in user does not have a doctor profile.' }, 403);
  }

  const doc = await c.env.DB
    .prepare('SELECT d.*, u.first_name, u.last_name, u.username, dept.name AS dept_name FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN departments dept ON dept.id = d.department_id WHERE d.id = ?')
    .bind(doctorId)
    .first<Record<string, unknown>>();
  if (!doc) return c.json({ detail: 'Doctor not found.' }, 404);

  const today = todayIstDate();
  await c.env.DB
    .prepare('INSERT OR IGNORE INTO opd_queues (doctor_id, queue_date, current_token, total_tokens, avg_consult_minutes, is_active) VALUES (?, ?, 0, 0, ?, 1)')
    .bind(doctorId, today, Number(doc.avg_consult_minutes || 15))
    .run();
  const queue = await c.env.DB.prepare('SELECT current_token FROM opd_queues WHERE doctor_id = ? AND queue_date = ?').bind(doctorId, today).first<Record<string, unknown>>();

  const todayTokens = await fetchTokensDetailed(
    c.env.DB,
    'WHERE t.doctor_id = ? AND t.appointment_date = ?',
    [doctorId, today],
    `${PRIORITY_ALIAS_SQL} ASC, t.token_number ASC`
  );

  const currentCalled = todayTokens.find((t) => t.status === 'called' || t.status === 'in_progress') ?? null;
  const waitingList = todayTokens.filter((t) => t.status === 'waiting');
  const completedList = todayTokens.filter((t) => t.status === 'completed');
  const skippedList = todayTokens.filter((t) => t.status === 'skipped');

  return c.json({
    doctor: {
      id: doctorId,
      doctor_name: `Dr. ${fullName(doc.first_name as string, doc.last_name as string, doc.username as string)}`,
      department_name: String(doc.dept_name || 'General'),
      room_number: String(doc.room_number || 'Room 101'),
      avg_consult_minutes: Number(doc.avg_consult_minutes || 15),
      is_available: Boolean(doc.is_available),
    },
    current_called_token: currentCalled,
    waiting_list: waitingList,
    completed_list: completedList,
    skipped_list: skippedList,
    stats: {
      total_today: todayTokens.length,
      waiting_count: waitingList.length,
      completed_count: completedList.length,
      skipped_count: skippedList.length,
      current_serving_token_number: Number(queue?.current_token || 0),
    },
  });
});

opdRoutes.post('/doctor/call-next', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.doctor_profile_id) return c.json({ detail: 'Only doctors can call queue tokens.' }, 403);
  const doctorId = user.doctor_profile_id;
  const today = todayIstDate();
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const targetId = parseIntId(body.token_id as string);

  let nextToken: Record<string, unknown> | null = null;
  if (targetId) {
    nextToken = await c.env.DB
      .prepare("SELECT * FROM opd_tokens WHERE id = ? AND doctor_id = ? AND appointment_date = ? AND status IN ('waiting', 'skipped')")
      .bind(targetId, doctorId, today)
      .first<Record<string, unknown>>();
    if (!nextToken) return c.json({ detail: 'Selected token is not available in waiting or skipped queue.' }, 400);
  } else {
    nextToken = await c.env.DB
      .prepare(`SELECT * FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? AND status = 'waiting' ORDER BY ${PRIORITY_SQL} ASC, token_number ASC LIMIT 1`)
      .bind(doctorId, today)
      .first<Record<string, unknown>>();
    if (!nextToken) return c.json({ detail: 'No patients currently waiting in queue.' }, 404);
  }

  const nextId = Number(nextToken.id);
  const nextNum = Number(nextToken.token_number);
  const ts = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE opd_tokens SET status = 'completed', updated_at = ? WHERE doctor_id = ? AND appointment_date = ? AND status = 'called' AND id != ?").bind(ts, doctorId, today, nextId),
    c.env.DB.prepare("UPDATE opd_tokens SET status = 'called', updated_at = ? WHERE id = ?").bind(ts, nextId),
    c.env.DB.prepare(
      `INSERT INTO opd_queues (doctor_id, queue_date, current_token, total_tokens, avg_consult_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(doctor_id, queue_date) DO UPDATE SET current_token = excluded.current_token`
    ).bind(doctorId, today, nextNum, nextNum, user.avg_consult_minutes || 15),
  ]);

  const sentAlerts = await dispatchQueueProximityNotifications(c.env.DB, doctorId, today);
  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'OPDCallNext',
    resource_id: nextId,
    patient_id: Number(nextToken.patient_id),
    details: `Called token ${String(nextToken.token_code)}; dispatched ${sentAlerts} proximity alert entries.`,
  });

  const [called] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [nextId]);
  return c.json({
    message: `Token ${String(nextToken.token_code)} has been called into ${user.room_number || 'the clinic'}!`,
    called_token: called,
    current_token_number: nextNum,
    notifications_triggered: Math.ceil(sentAlerts / 3),
  });
});

opdRoutes.post('/doctor/complete', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.doctor_profile_id) return c.json({ detail: 'Only doctors can complete consultations.' }, 403);
  const doctorId = user.doctor_profile_id;
  const today = todayIstDate();
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const tokenId = parseIntId(body.token_id as string);

  const tok = tokenId
    ? await c.env.DB.prepare('SELECT id, token_code, status FROM opd_tokens WHERE id = ? AND doctor_id = ?').bind(tokenId, doctorId).first<Record<string, unknown>>()
    : await c.env.DB.prepare("SELECT id, token_code, status FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? AND status = 'called' LIMIT 1").bind(doctorId, today).first<Record<string, unknown>>();

  if (!tok || tok.status === 'completed') {
    return c.json({ detail: 'No active called patient to complete.' }, 400);
  }

  await c.env.DB.prepare("UPDATE opd_tokens SET status = 'completed', updated_at = ? WHERE id = ?").bind(nowIso(), Number(tok.id)).run();
  await dispatchQueueProximityNotifications(c.env.DB, doctorId, today);
  const [updated] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [Number(tok.id)]);
  return c.json({
    message: `Consultation for Token ${String(tok.token_code)} marked as completed.`,
    token: updated,
  });
});

opdRoutes.post('/doctor/skip', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.doctor_profile_id) return c.json({ detail: 'Only doctors can skip consultations.' }, 403);
  const doctorId = user.doctor_profile_id;
  const today = todayIstDate();
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const tokenId = parseIntId(body.token_id as string);

  const tok = tokenId
    ? await c.env.DB.prepare('SELECT id, token_code FROM opd_tokens WHERE id = ? AND doctor_id = ?').bind(tokenId, doctorId).first<Record<string, unknown>>()
    : await c.env.DB.prepare("SELECT id, token_code FROM opd_tokens WHERE doctor_id = ? AND appointment_date = ? AND status IN ('called', 'waiting') LIMIT 1").bind(doctorId, today).first<Record<string, unknown>>();

  if (!tok) return c.json({ detail: 'No patient found to skip.' }, 400);

  await c.env.DB.prepare("UPDATE opd_tokens SET status = 'skipped', updated_at = ? WHERE id = ?").bind(nowIso(), Number(tok.id)).run();
  await dispatchQueueProximityNotifications(c.env.DB, doctorId, today);
  const [updated] = await fetchTokensDetailed(c.env.DB, 'WHERE t.id = ?', [Number(tok.id)]);
  return c.json({
    message: `Token ${String(tok.token_code)} marked as skipped.`,
    token: updated,
  });
});

opdRoutes.get('/notifications', requireAuth, async (c) => {
  const user = c.get('user')!;
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'patient') {
    if (!user.patient_profile_id) return c.json([]);
    clauses.push('n.patient_id = ?');
    binds.push(user.patient_profile_id);
  } else if (!isClinicalStaffUser(user)) {
    return c.json([]);
  }

  const channel = c.req.query('channel');
  if (channel) {
    clauses.push('n.channel = ?');
    binds.push(channel);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await c.env.DB
    .prepare(
      `SELECT n.*, t.token_code
       FROM opd_notifications n
       LEFT JOIN opd_tokens t ON t.id = n.token_id
       ${where}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 50`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return c.json(
    rows.results.map((r) => ({
      id: Number(r.id),
      token: r.token_id ? Number(r.token_id) : null,
      token_code: r.token_code ? String(r.token_code) : null,
      channel: String(r.channel),
      trigger_event: String(r.trigger_event),
      recipient_phone: String(r.recipient_phone || ''),
      title: String(r.title),
      message: String(r.message),
      status: String(r.status),
      is_read: Boolean(r.is_read),
      created_at: String(r.created_at),
    }))
  );
});

opdRoutes.post('/notifications/read-all', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.patient_profile_id) return c.json({ detail: 'No notifications for non-patient account.' }, 400);
  await c.env.DB.prepare('UPDATE opd_notifications SET is_read = 1 WHERE patient_id = ? AND is_read = 0').bind(user.patient_profile_id).run();
  return c.json({ message: 'Marked as read.' });
});

opdRoutes.post('/notifications/:pk/read', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!user.patient_profile_id) return c.json({ detail: 'No notifications for non-patient account.' }, 400);
  const id = parseIntId(c.req.param('pk'));
  const notif = id ? await c.env.DB.prepare('SELECT id, patient_id FROM opd_notifications WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!notif) return c.json({ detail: 'Not found.' }, 404);
  if (Number(notif.patient_id) !== user.patient_profile_id) return c.json({ detail: 'Forbidden.' }, 403);
  await c.env.DB.prepare('UPDATE opd_notifications SET is_read = 1 WHERE id = ?').bind(id).run();
  return c.json({ message: 'Marked as read.' });
});
