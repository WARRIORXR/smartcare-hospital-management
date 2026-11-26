import { Hono } from 'hono';
import {
  blacklistToken,
  hashPassword,
  isTokenBlacklisted,
  issueTokenPair,
  requireAuth,
  validatePasswordComplexity,
  verifyJwt,
  verifyPassword,
} from '../auth';
import { buildAnalyticsCsv, buildAnalyticsPdfBytes, type AnalyticsReportPayload } from '../pdf';
import {
  ALL_BLOOD_GROUPS,
  ensureAndFetchBloodStock,
  fetchAdmissionsDetailed,
  fetchBloodRequestsDetailed,
  fetchDepartmentsList,
  fetchDoctorsList,
  fetchInvoicesDetailed,
  fetchMedicalRecordsDetailed,
  fetchTokensDetailed,
} from '../serializers';
import {
  AppEnv,
  AuthUser,
  addDaysDateStr,
  formatShortWeekday,
  fullName,
  isAdminUser,
  isAnyStaffUser,
  isClinicalStaffUser,
  loadAuthUserById,
  nowIso,
  parseIntId,
  recordAuditLog,
  round2,
  serializeUserSummary,
  todayIstDate,
  unixNow,
} from '../utils';

export async function computeAnalyticsData(db: D1Database): Promise<AnalyticsReportPayload> {
  const today = todayIstDate();
  const todayTokens = (
    await db.prepare('SELECT status, department_id, created_at, updated_at FROM opd_tokens WHERE appointment_date = ?').bind(today).all<Record<string, unknown>>()
  ).results;

  let waitingCount = 0;
  let calledCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;
  let admittedCount = 0;
  let skippedCount = 0;
  let cancelledCount = 0;
  const waitTimes: number[] = [];

  for (const t of todayTokens) {
    const st = String(t.status);
    if (st === 'waiting') waitingCount++;
    else if (st === 'called') calledCount++;
    else if (st === 'in_progress') inProgressCount++;
    else if (st === 'completed') completedCount++;
    else if (st === 'admitted') admittedCount++;
    else if (st === 'skipped') skippedCount++;
    else if (st === 'cancelled') cancelledCount++;

    if (st === 'called' || st === 'in_progress' || st === 'completed') {
      const diff = (Date.parse(String(t.updated_at)) - Date.parse(String(t.created_at))) / 60000;
      if (Number.isFinite(diff) && diff >= 0) waitTimes.push(diff);
    }
  }

  let avgWaitingTime = 15.0;
  if (waitTimes.length > 0) {
    avgWaitingTime = Math.round((waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) * 10) / 10;
  } else {
    const avgRow = await db.prepare('SELECT AVG(avg_consult_minutes) AS avg_m FROM doctors WHERE is_available = 1').first<Record<string, unknown>>();
    if (avgRow?.avg_m !== null && avgRow?.avg_m !== undefined) {
      avgWaitingTime = Math.round(Number(avgRow.avg_m) * 10) / 10;
    }
  }

  const allDepts = (await db.prepare('SELECT id, name FROM departments ORDER BY name ASC').all<Record<string, unknown>>()).results;
  const busiestToday = await db
    .prepare(
      `SELECT d.name, COUNT(t.id) AS cnt
       FROM opd_tokens t
       JOIN departments d ON d.id = t.department_id
       WHERE t.appointment_date = ?
       GROUP BY t.department_id
       ORDER BY cnt DESC
       LIMIT 1`
    )
    .bind(today)
    .first<Record<string, unknown>>();

  let busiestDeptName = 'General Medicine';
  let busiestDeptTokens = 0;
  if (busiestToday) {
    busiestDeptName = String(busiestToday.name);
    busiestDeptTokens = Number(busiestToday.cnt || 0);
  } else {
    const busiestAllTime = await db
      .prepare(
        `SELECT d.name, COUNT(t.id) AS cnt
         FROM opd_tokens t
         JOIN departments d ON d.id = t.department_id
         GROUP BY t.department_id
         ORDER BY cnt DESC
         LIMIT 1`
      )
      .first<Record<string, unknown>>();
    if (busiestAllTime) {
      busiestDeptName = String(busiestAllTime.name);
      busiestDeptTokens = Number(busiestAllTime.cnt || 0);
    } else if (allDepts.length > 0) {
      busiestDeptName = String(allDepts[0].name);
    }
  }

  const deptChartLabels: string[] = [];
  let deptChartData: number[] = [];
  for (const d of allDepts) {
    deptChartLabels.push(String(d.name));
    deptChartData.push(todayTokens.filter((t) => Number(t.department_id) === Number(d.id)).length);
  }
  if (deptChartData.reduce((a, b) => a + b, 0) === 0 && allDepts.length > 0) {
    const allCounts = (
      await db.prepare('SELECT department_id, COUNT(*) AS cnt FROM opd_tokens GROUP BY department_id').all<Record<string, unknown>>()
    ).results;
    const map = new Map(allCounts.map((r) => [Number(r.department_id), Number(r.cnt)]));
    deptChartData = allDepts.map((d) => map.get(Number(d.id)) ?? 0);
  }

  const bedRows = (await db.prepare('SELECT status, ward_id FROM beds').all<Record<string, unknown>>()).results;
  const totalBeds = bedRows.length;
  const occupiedBeds = bedRows.filter((b) => b.status === 'occupied').length;
  const availableBeds = bedRows.filter((b) => b.status === 'available').length;
  const cleaningBeds = bedRows.filter((b) => b.status === 'cleaning').length;
  const maintenanceBeds = bedRows.filter((b) => b.status === 'maintenance' || b.status === 'reserved').length;
  const bedOccPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0.0;

  const wards = (await db.prepare('SELECT id, name FROM wards WHERE is_active = 1 ORDER BY name ASC').all<Record<string, unknown>>()).results;
  const wardChartLabels: string[] = [];
  const wardChartOccupied: number[] = [];
  const wardChartAvailable: number[] = [];
  const wardChartPercentages: number[] = [];

  for (const w of wards) {
    const wb = bedRows.filter((b) => Number(b.ward_id) === Number(w.id));
    const wOcc = wb.filter((b) => b.status === 'occupied').length;
    const wAvail = wb.filter((b) => b.status === 'available').length;
    const wPct = wb.length > 0 ? Math.round((wOcc / wb.length) * 1000) / 10 : 0.0;
    wardChartLabels.push(String(w.name));
    wardChartOccupied.push(wOcc);
    wardChartAvailable.push(wAvail);
    wardChartPercentages.push(wPct);
  }

  const stocks = await ensureAndFetchBloodStock(db);
  const stockMap = new Map(stocks.map((s) => [s.blood_group, s]));
  const lowStockAlerts: Array<{ blood_group: string; units_available: number; minimum_threshold: number; shortage: number; expiry_date: string | null }> = [];
  const bloodChartLabels: string[] = [];
  const bloodChartUnits: number[] = [];
  const bloodChartColors: string[] = [];
  let totalBloodUnits = 0;

  for (const bg of ALL_BLOOD_GROUPS) {
    const s = stockMap.get(bg);
    const units = s ? s.units_available : 0;
    totalBloodUnits += units;
    const isLow = units < 3;
    if (isLow) {
      lowStockAlerts.push({
        blood_group: bg,
        units_available: units,
        minimum_threshold: 3,
        shortage: Math.max(0, 3 - units),
        expiry_date: s?.expiry_date ?? null,
      });
    }
    bloodChartLabels.push(bg);
    bloodChartUnits.push(units);
    bloodChartColors.push(isLow ? '#ef4444' : '#10b981');
  }

  const trendLabels: string[] = [];
  const trendData: number[] = [];
  const startDay = addDaysDateStr(today, -6);
  const trendRows = (
    await db
      .prepare('SELECT appointment_date, COUNT(*) AS cnt FROM opd_tokens WHERE appointment_date >= ? AND appointment_date <= ? GROUP BY appointment_date')
      .bind(startDay, today)
      .all<Record<string, unknown>>()
  ).results;
  const trendMap = new Map(trendRows.map((r) => [String(r.appointment_date), Number(r.cnt)]));
  for (let i = -6; i <= 0; i++) {
    const day = addDaysDateStr(today, i);
    trendLabels.push(formatShortWeekday(day));
    trendData.push(trendMap.get(day) ?? 0);
  }

  const countsRow = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM doctors) AS total_doctors,
        (SELECT COUNT(*) FROM doctors WHERE is_available = 1) AS available_doctors,
        (SELECT COUNT(*) FROM patients) AS total_patients,
        (SELECT COUNT(*) FROM admissions WHERE status = 'admitted') AS active_admissions,
        (SELECT COUNT(*) FROM blood_requests WHERE status = 'pending') AS pending_blood_requests`
    )
    .first<Record<string, unknown>>();

  return {
    generated_at: nowIso(),
    summary_kpis: {
      total_tokens_today: todayTokens.length,
      waiting_tokens: waitingCount,
      called_tokens: calledCount + inProgressCount,
      completed_tokens: completedCount,
      average_waiting_time_minutes: avgWaitingTime,
      average_waiting_time_display: `${avgWaitingTime} mins`,
      busiest_department: { name: busiestDeptName, tokens_count: busiestDeptTokens },
      bed_occupancy_percentage: bedOccPct,
      total_beds: totalBeds,
      occupied_beds: occupiedBeds,
      available_beds: availableBeds,
      cleaning_beds: cleaningBeds,
      blood_stock_low_alerts: {
        count: lowStockAlerts.length,
        has_alerts: lowStockAlerts.length > 0,
        critical_groups: lowStockAlerts.map((item) => item.blood_group),
        total_blood_units: totalBloodUnits,
      },
      total_doctors: Number(countsRow?.total_doctors || 0),
      available_doctors: Number(countsRow?.available_doctors || 0),
      total_patients: Number(countsRow?.total_patients || 0),
      active_admissions: Number(countsRow?.active_admissions || 0),
      pending_blood_requests: Number(countsRow?.pending_blood_requests || 0),
    },
    charts: {
      token_status_distribution: {
        labels: ['Waiting', 'Called / In Progress', 'Completed', 'Admitted to Ward', 'Skipped / Cancelled'],
        data: [waitingCount, calledCount + inProgressCount, completedCount, admittedCount, skippedCount + cancelledCount],
        colors: ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'],
      },
      daily_token_trend: { labels: trendLabels, data: trendData },
      department_tokens: { labels: deptChartLabels, data: deptChartData },
      bed_status: {
        labels: ['Available', 'Occupied', 'Cleaning', 'Maintenance'],
        data: [availableBeds, occupiedBeds, cleaningBeds, maintenanceBeds],
        colors: ['#10b981', '#ef4444', '#f59e0b', '#6b7280'],
      },
      ward_occupancy: {
        labels: wardChartLabels,
        occupied: wardChartOccupied,
        available: wardChartAvailable,
        percentages: wardChartPercentages,
      },
      blood_stock_levels: {
        labels: bloodChartLabels,
        data: bloodChartUnits,
        colors: bloodChartColors,
        threshold: 3,
      },
    },
    alerts: { low_blood_stock: lowStockAlerts },
  } as AnalyticsReportPayload & { alerts: unknown };
}

export const accountsRoutes = new Hono<AppEnv>({ strict: false });

accountsRoutes.post('/login', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!username || !password) {
    return c.json({ detail: 'Must include "username" and "password".' }, 400);
  }

  const userRow = await c.env.DB
    .prepare('SELECT id, password_hash, role, is_staff, is_active FROM users WHERE username = ?')
    .bind(username)
    .first<Record<string, unknown>>();

  const allowDemoAdmin = c.env.ALLOW_DEMO_ADMIN === 'true';
  if (userRow && !allowDemoAdmin && (userRow.role === 'admin' || userRow.is_staff) && password === 'admin123') {
    await recordAuditLog(c, {
      action: 'LOGIN_FAILED',
      resource_type: 'AuthSession',
      actor_username: username || 'unknown',
      actor_role: 'anonymous',
      details: 'Blocked disabled demo administrator login attempt.',
    });
    return c.json({ detail: 'Demo administrator credentials are disabled in this environment.' }, 401);
  }

  if (!userRow || !userRow.is_active || !(await verifyPassword(password, String(userRow.password_hash || '')))) {
    await recordAuditLog(c, {
      action: 'LOGIN_FAILED',
      resource_type: 'AuthSession',
      actor_username: username || 'unknown',
      actor_role: 'anonymous',
      details: 'Invalid login credentials.',
    });
    return c.json({ detail: 'No active account found with the given credentials' }, 401);
  }

  const user = await loadAuthUserById(c.env.DB, Number(userRow.id));
  if (!user) {
    return c.json({ detail: 'User account inactive.' }, 401);
  }

  const { access, refresh } = await issueTokenPair(user, c.env.JWT_SECRET);
  const summary = serializeUserSummary(user);

  await recordAuditLog(c, {
    action: 'LOGIN',
    resource_type: 'AuthSession',
    resource_id: user.id,
    actor: user,
    actor_username: user.username,
    actor_role: user.role,
    details: 'User authenticated via JWT.',
  });

  return c.json({ access, refresh, user: summary });
});

accountsRoutes.post('/refresh', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const refreshStr = String(body.refresh || '').trim();
  if (!refreshStr) {
    return c.json({ detail: 'Refresh token is required.' }, 400);
  }
  const claims = await verifyJwt(refreshStr, c.env.JWT_SECRET);
  if (!claims || claims.token_type !== 'refresh' || (await isTokenBlacklisted(c.env.DB, claims.jti))) {
    return c.json({ detail: 'Token is invalid or expired', code: 'token_not_valid' }, 401);
  }

  const user = await loadAuthUserById(c.env.DB, claims.user_id);
  if (!user) {
    return c.json({ detail: 'User account not active.' }, 401);
  }

  await blacklistToken(c.env.DB, claims.jti, claims.exp);
  const tokens = await issueTokenPair(user, c.env.JWT_SECRET);
  return c.json(tokens);
});

accountsRoutes.post('/logout', requireAuth, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const refreshStr = String(body.refresh || '').trim();
  if (refreshStr) {
    const claims = await verifyJwt(refreshStr, c.env.JWT_SECRET);
    if (!claims || claims.token_type !== 'refresh') {
      return c.json({ detail: 'Invalid refresh token.' }, 400);
    }
    await blacklistToken(c.env.DB, claims.jti, claims.exp);
  }
  return c.json({ message: 'Logged out cleanly.' });
});

accountsRoutes.post('/register', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const username = String(body.username || '').trim();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const passwordConfirm = String(body.password_confirm || '');
  const requestedRole = String(body.role || 'patient').trim();

  if (requestedRole && requestedRole !== 'patient') {
    return c.json({ role: 'Public registration is restricted to patients only. Staff accounts must be created by an administrator.' }, 400);
  }
  if (!username) return c.json({ username: 'Username is required.' }, 400);
  if (!email || !email.includes('@')) return c.json({ email: 'A valid email is required.' }, 400);
  if (password !== passwordConfirm) return c.json({ password: 'Passwords do not match.' }, 400);

  const firstName = String(body.first_name || '').trim();
  const lastName = String(body.last_name || '').trim();
  const pwErrors = validatePasswordComplexity(password, { username, email, first_name: firstName, last_name: lastName });
  if (pwErrors.length > 0) return c.json({ password: pwErrors }, 400);

  const dupUsername = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').bind(username).first();
  if (dupUsername) return c.json({ username: 'A user with that username already exists.' }, 400);
  const dupEmail = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').bind(email).first();
  if (dupEmail) return c.json({ email: 'A user with this email already exists.' }, 400);

  const pwHash = await hashPassword(password);
  const phone = String(body.phone || '').trim();
  const insertUser = await c.env.DB
    .prepare(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role, phone, is_staff, is_superuser, is_active)
       VALUES (?, ?, ?, ?, ?, 'patient', ?, 0, 0, 1)`
    )
    .bind(username, email, pwHash, firstName, lastName, phone)
    .run();

  const userId = Number(insertUser.meta.last_row_id);
  const patCode = `PAT-${String(userId).padStart(4, '0')}`;
  await c.env.DB
    .prepare(
      `INSERT INTO patients (user_id, patient_id, date_of_birth, gender, blood_group, address)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      patCode,
      body.date_of_birth ? String(body.date_of_birth) : null,
      String(body.gender || ''),
      String(body.blood_group || ''),
      String(body.address || '')
    )
    .run();

  const user = (await loadAuthUserById(c.env.DB, userId)) as AuthUser;
  const { access, refresh } = await issueTokenPair(user, c.env.JWT_SECRET);

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'PatientRegistration',
    resource_id: user.id,
    patient_id: user.patient_profile_id,
    actor: user,
    details: 'Patient self-registered.',
  });

  return c.json(
    {
      message: 'Patient registered successfully!',
      access,
      refresh,
      user: serializeUserSummary(user),
    },
    201
  );
});

accountsRoutes.post('/password-reset', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const email = String(body.email || '').trim();
  if (!email) return c.json({ email: ['This field is required.'] }, 400);

  const userRow = await c.env.DB
    .prepare('SELECT id, username, role FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1')
    .bind(email)
    .first<Record<string, unknown>>();

  let devPreview: { uid: string; token: string } | undefined;
  if (userRow) {
    const userId = Number(userRow.id);
    const uid = btoa(String(userId)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const token = crypto.randomUUID().replace(/-/g, '');
    await c.env.DB
      .prepare('INSERT INTO password_resets (user_id, uid, token, expires_at, used) VALUES (?, ?, ?, ?, 0)')
      .bind(userId, uid, token, unixNow() + 7200)
      .run();

    await recordAuditLog(c, {
      action: 'PASSWORD_RESET',
      resource_type: 'PasswordResetRequest',
      resource_id: userId,
      actor_username: String(userRow.username),
      actor_role: String(userRow.role),
      details: 'Password reset token generated.',
    });

    if (c.env.DEMO_MODE === 'true') {
      devPreview = { uid, token };
    }
  }

  const resp: Record<string, unknown> = {
    message: 'If an account matches that email, a password reset link has been sent.',
  };
  if (devPreview) resp.dev_preview = devPreview;
  return c.json(resp);
});

accountsRoutes.post('/password-reset/confirm', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const uid = String(body.uid || '').trim();
  const token = String(body.token || '').trim();
  const newPassword = String(body.new_password || '');
  const confirmPassword = String(body.confirm_password || '');

  if (!uid || !token || !newPassword) {
    return c.json({ detail: 'uid, token, and new_password are required.' }, 400);
  }
  if (newPassword !== confirmPassword) {
    return c.json({ new_password: 'Passwords do not match.' }, 400);
  }
  const pwErrors = validatePasswordComplexity(newPassword);
  if (pwErrors.length > 0) return c.json({ new_password: pwErrors }, 400);

  const resetRow = await c.env.DB
    .prepare(
      `SELECT pr.id AS reset_id, u.id AS user_id, u.username, u.role
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.uid = ? AND pr.token = ? AND pr.used = 0 AND pr.expires_at > ? AND u.is_active = 1
       ORDER BY pr.id DESC LIMIT 1`
    )
    .bind(uid, token, unixNow())
    .first<Record<string, unknown>>();

  if (!resetRow) {
    return c.json({ detail: 'Invalid or expired reset link.' }, 400);
  }

  const pwHash = await hashPassword(newPassword);
  const userId = Number(resetRow.user_id);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(pwHash, userId),
    c.env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(Number(resetRow.reset_id)),
  ]);

  await recordAuditLog(c, {
    action: 'PASSWORD_RESET',
    resource_type: 'PasswordResetConfirm',
    resource_id: userId,
    actor_username: String(resetRow.username),
    actor_role: String(resetRow.role),
    details: 'Password reset completed successfully.',
  });

  return c.json({ message: 'Password has been reset successfully. Please sign in.' });
});

accountsRoutes.get('/profile', requireAuth, async (c) => {
  const user = c.get('user')!;
  let profile: Record<string, unknown> | null = null;

  if (user.role === 'patient' && user.patient_profile_id) {
    const p = await c.env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(user.patient_profile_id).first<Record<string, unknown>>();
    if (p) {
      profile = {
        id: Number(p.id),
        user: serializeUserSummary(user),
        patient_id: p.patient_id ? String(p.patient_id) : null,
        date_of_birth: p.date_of_birth ? String(p.date_of_birth) : null,
        gender: String(p.gender || ''),
        blood_group: String(p.blood_group || ''),
        address: String(p.address || ''),
        emergency_contact_name: String(p.emergency_contact_name || ''),
        emergency_contact_phone: String(p.emergency_contact_phone || ''),
        created_at: String(p.created_at),
      };
    }
  } else if (user.role === 'doctor' && user.doctor_profile_id) {
    const d = await c.env.DB
      .prepare(
        `SELECT doc.*, dept.name AS department_name
         FROM doctors doc
         LEFT JOIN departments dept ON dept.id = doc.department_id
         WHERE doc.id = ?`
      )
      .bind(user.doctor_profile_id)
      .first<Record<string, unknown>>();
    if (d) {
      profile = {
        id: Number(d.id),
        user: serializeUserSummary(user),
        department: d.department_id ? Number(d.department_id) : null,
        department_name: d.department_name ? String(d.department_name) : null,
        specialization: String(d.specialization || ''),
        qualification: String(d.qualification || ''),
        experience_years: Number(d.experience_years || 5),
        consultation_fee: round2(Number(d.consultation_fee || 500)).toFixed(2),
        room_number: String(d.room_number || 'Room 101'),
        avg_consult_minutes: Number(d.avg_consult_minutes || 15),
        available_days: String(d.available_days || 'Mon-Sat'),
        is_available: Boolean(d.is_available),
      };
    }
  }

  return c.json({ user: serializeUserSummary(user), profile });
});

accountsRoutes.get('/staff', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isAdminUser(user)) return c.json({ detail: 'Only administrators can access staff accounts.' }, 403);
  const role = c.req.query('role');
  const rows = role
    ? await c.env.DB.prepare('SELECT * FROM users WHERE role = ? ORDER BY date_joined DESC').bind(role).all<Record<string, unknown>>()
    : await c.env.DB.prepare('SELECT * FROM users ORDER BY date_joined DESC').all<Record<string, unknown>>();

  return c.json(
    rows.results.map((r) => ({
      id: Number(r.id),
      username: String(r.username),
      email: String(r.email || ''),
      first_name: String(r.first_name || ''),
      last_name: String(r.last_name || ''),
      full_name: fullName(r.first_name as string, r.last_name as string, r.username as string),
      role: String(r.role),
      phone: String(r.phone || ''),
      is_active: Boolean(r.is_active),
      date_joined: String(r.date_joined),
    }))
  );
});

accountsRoutes.post('/staff', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isAdminUser(user)) return c.json({ detail: 'Only administrators can provision staff accounts.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const username = String(body.username || '').trim();
  const email = String(body.email || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || '').trim();
  if (!username || !password || !role) return c.json({ detail: 'username, password, and role are required.' }, 400);

  const pwErrors = validatePasswordComplexity(password, { username, email });
  if (pwErrors.length > 0) return c.json({ password: pwErrors }, 400);

  const dup = await c.env.DB.prepare('SELECT id FROM users WHERE username = ? OR LOWER(email) = LOWER(?)').bind(username, email).first();
  if (dup) return c.json({ detail: 'Username or email already exists.' }, 400);

  const pwHash = await hashPassword(password);
  const isStaff = role === 'admin' ? 1 : 0;
  const res = await c.env.DB
    .prepare(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role, is_staff, is_superuser, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`
    )
    .bind(
      username,
      email || `${username}@smartcare.hospital`,
      pwHash,
      String(body.first_name || ''),
      String(body.last_name || ''),
      String(body.phone || ''),
      role,
      isStaff
    )
    .run();

  const newId = Number(res.meta.last_row_id);
  if (role === 'doctor') {
    await c.env.DB
      .prepare('INSERT INTO doctors (user_id, department_id, specialization, room_number) VALUES (?, ?, ?, ?)')
      .bind(newId, parseIntId(body.department as string), String(body.specialization || ''), String(body.room_number || 'Room 101'))
      .run();
  } else if (role === 'patient') {
    await c.env.DB
      .prepare('INSERT INTO patients (user_id, patient_id) VALUES (?, ?)')
      .bind(newId, `PAT-${String(newId).padStart(4, '0')}`)
      .run();
  }

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'StaffAccount',
    resource_id: newId,
    details: `Provisioned ${role} user @${username}.`,
  });

  const created = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(newId).first<Record<string, unknown>>();
  return c.json(
    {
      id: newId,
      username: String(created?.username),
      email: String(created?.email || ''),
      first_name: String(created?.first_name || ''),
      last_name: String(created?.last_name || ''),
      full_name: fullName(created?.first_name as string, created?.last_name as string, created?.username as string),
      role: String(created?.role),
      phone: String(created?.phone || ''),
      is_active: Boolean(created?.is_active),
      date_joined: String(created?.date_joined),
    },
    201
  );
});

accountsRoutes.get('/audit-logs', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (!isAdminUser(user)) return c.json({ detail: 'Admin access required.' }, 403);

  const action = c.req.query('action');
  const resourceType = c.req.query('resource_type');
  const search = c.req.query('search');
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (action) {
    clauses.push('al.action = ?');
    binds.push(action);
  }
  if (resourceType) {
    clauses.push('al.resource_type LIKE ?');
    binds.push(`%${resourceType}%`);
  }
  if (search) {
    const q = `%${search}%`;
    clauses.push('(al.actor_username LIKE ? OR al.resource_type LIKE ? OR al.details LIKE ? OR al.ip_address LIKE ?)');
    binds.push(q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await c.env.DB
    .prepare(
      `SELECT al.*, p.patient_id AS patient_code
       FROM audit_logs al
       LEFT JOIN patients p ON p.id = al.patient_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT 200`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return c.json(
    rows.results.map((r) => ({
      id: Number(r.id),
      actor: r.actor_id ? Number(r.actor_id) : null,
      actor_username: String(r.actor_username),
      actor_role: String(r.actor_role || ''),
      action: String(r.action),
      resource_type: String(r.resource_type),
      resource_id: String(r.resource_id || ''),
      patient: r.patient_id ? Number(r.patient_id) : null,
      patient_code: r.patient_code ? String(r.patient_code) : null,
      ip_address: String(r.ip_address || ''),
      user_agent: String(r.user_agent || ''),
      details: String(r.details || ''),
      created_at: String(r.created_at),
    }))
  );
});

accountsRoutes.get('/admin/analytics', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  return c.json(await computeAnalyticsData(c.env.DB));
});

accountsRoutes.get('/admin/analytics/export/:export_format', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const fmt = (c.req.param('export_format') || c.req.query('export_format') || 'csv').toLowerCase();
  const data = await computeAnalyticsData(c.env.DB);
  const ymd = todayIstDate().replace(/-/g, '');

  if (fmt === 'pdf') {
    await recordAuditLog(c, { action: 'EXPORT', resource_type: 'AnalyticsPDF', details: 'Exported executive PDF analytics report.' });
    const bytes = await buildAnalyticsPdfBytes(data);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="smartcare_analytics_${ymd}.pdf"`,
      },
    });
  }
  if (fmt === 'csv') {
    await recordAuditLog(c, { action: 'EXPORT', resource_type: 'AnalyticsCSV', details: 'Exported executive CSV analytics report.' });
    const csv = buildAnalyticsCsv(data);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="smartcare_analytics_${ymd}.csv"`,
      },
    });
  }
  return c.json({ error: "Unsupported format. Use 'csv' or 'pdf'." }, 400);
});

accountsRoutes.get('/patients', requireAuth, async (c) => {
  const user = c.get('user')!;
  let rows: Record<string, unknown>[];

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    rows = (
      await c.env.DB
        .prepare(
          `SELECT p.*, u.username, u.email, u.first_name, u.last_name, u.role, u.phone, u.is_active, u.date_joined
           FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
        )
        .bind(user.patient_profile_id)
        .all<Record<string, unknown>>()
    ).results;
  } else if (!isAnyStaffUser(user)) {
    return c.json([]);
  } else {
    const search = c.req.query('search');
    if (search) {
      const q = `%${search}%`;
      rows = (
        await c.env.DB
          .prepare(
            `SELECT p.*, u.username, u.email, u.first_name, u.last_name, u.role, u.phone, u.is_active, u.date_joined
             FROM patients p JOIN users u ON u.id = p.user_id
             WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ? OR p.patient_id LIKE ? OR u.phone LIKE ?
             ORDER BY p.created_at DESC`
          )
          .bind(q, q, q, q, q)
          .all<Record<string, unknown>>()
      ).results;
      await recordAuditLog(c, {
        action: 'VIEW',
        resource_type: 'PatientDirectorySearch',
        details: `Searched patient directory with query='${search.slice(0, 80)}'.`,
      });
    } else {
      rows = (
        await c.env.DB
          .prepare(
            `SELECT p.*, u.username, u.email, u.first_name, u.last_name, u.role, u.phone, u.is_active, u.date_joined
             FROM patients p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC`
          )
          .all<Record<string, unknown>>()
      ).results;
    }
  }

  return c.json(
    rows.map((r) => ({
      id: Number(r.id),
      user: {
        id: Number(r.user_id),
        username: String(r.username),
        email: String(r.email || ''),
        first_name: String(r.first_name || ''),
        last_name: String(r.last_name || ''),
        full_name: fullName(r.first_name as string, r.last_name as string, r.username as string),
        role: String(r.role),
        phone: String(r.phone || ''),
        is_active: Boolean(r.is_active),
        date_joined: String(r.date_joined),
      },
      patient_id: r.patient_id ? String(r.patient_id) : null,
      date_of_birth: r.date_of_birth ? String(r.date_of_birth) : null,
      gender: String(r.gender || ''),
      blood_group: String(r.blood_group || ''),
      address: String(r.address || ''),
      emergency_contact_name: String(r.emergency_contact_name || ''),
      emergency_contact_phone: String(r.emergency_contact_phone || ''),
      created_at: String(r.created_at),
    }))
  );
});

accountsRoutes.get('/patients/:pk/journey', requireAuth, async (c) => {
  const user = c.get('user')!;
  const pk = c.req.param('pk');
  let targetPatId: number | null = null;

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) {
      return c.json({ detail: 'Logged in user does not have an active patient profile.' }, 403);
    }
    if (pk.toLowerCase() !== 'me' && pk !== String(user.patient_profile_id) && pk !== String(user.id)) {
      await recordAuditLog(c, {
        action: 'VIEW',
        resource_type: 'PatientJourneyDenied',
        resource_id: pk,
        details: 'Blocked unauthorized patient journey access attempt (IDOR prevention).',
      });
      return c.json({ detail: "Access denied. You are not authorized to view another patient's medical journey." }, 403);
    }
    targetPatId = user.patient_profile_id;
  } else {
    if (!isAnyStaffUser(user)) {
      return c.json({ detail: 'Role not authorized to inspect patient records.' }, 403);
    }
    const numPk = parseIntId(pk);
    if (numPk) {
      const pat = await c.env.DB.prepare('SELECT id FROM patients WHERE id = ? OR user_id = ? LIMIT 1').bind(numPk, numPk).first<Record<string, unknown>>();
      targetPatId = pat ? Number(pat.id) : null;
    }
    if (!targetPatId) return c.json({ detail: 'Patient profile not found.' }, 404);
  }

  const patRow = await c.env.DB
    .prepare(
      `SELECT p.*, u.username, u.email, u.first_name, u.last_name, u.phone
       FROM patients p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .bind(targetPatId)
    .first<Record<string, unknown>>();
  if (!patRow) return c.json({ detail: 'Patient profile not found.' }, 404);

  const patCode = String(patRow.patient_id || `PAT-${String(targetPatId).padStart(4, '0')}`);
  await recordAuditLog(c, {
    action: 'VIEW',
    resource_type: 'PatientJourney',
    resource_id: targetPatId,
    patient_id: targetPatId,
    details: `Accessed complete medical journey for ${patCode}.`,
  });

  const [tokens, admissions, bloodRequests, records, invoices] = await Promise.all([
    fetchTokensDetailed(c.env.DB, 'WHERE t.patient_id = ?', [targetPatId], 't.appointment_date DESC, t.created_at DESC'),
    fetchAdmissionsDetailed(c.env.DB, 'WHERE a.patient_id = ?', [targetPatId]),
    fetchBloodRequestsDetailed(c.env.DB, 'WHERE br.patient_id = ?', [targetPatId]),
    fetchMedicalRecordsDetailed(c.env.DB, 'WHERE mr.patient_id = ?', [targetPatId]),
    fetchInvoicesDetailed(c.env.DB, 'WHERE inv.patient_id = ?', [targetPatId]),
  ]);

  const activeAdm = admissions.find((a) => a.status === 'admitted') ?? null;
  const activeAdmData = activeAdm
    ? {
        id: activeAdm.id,
        bed_id: activeAdm.bed,
        bed_number: activeAdm.bed_number,
        ward_name: activeAdm.ward_name,
        ward_type: activeAdm.ward_type,
        attending_doctor_name: activeAdm.attending_doctor_name,
        diagnosis: activeAdm.diagnosis,
        admission_date: activeAdm.admission_date,
        token_code: activeAdm.token_code,
      }
    : null;

  return c.json({
    patient: {
      id: targetPatId,
      patient_code: patCode,
      name: fullName(patRow.first_name as string, patRow.last_name as string, patRow.username as string),
      username: String(patRow.username),
      email: String(patRow.email || ''),
      phone: String(patRow.phone || 'N/A'),
      blood_group: String(patRow.blood_group || 'Not Specified'),
      gender: String(patRow.gender || 'Not Specified'),
      address: String(patRow.address || 'N/A'),
      emergency_contact: patRow.emergency_contact_name
        ? `${String(patRow.emergency_contact_name)} (${String(patRow.emergency_contact_phone || '')})`
        : 'N/A',
    },
    journey_summary: {
      total_opd_visits: tokens.length,
      is_currently_admitted: activeAdm !== null,
      current_bed: activeAdm ? activeAdm.bed_number : null,
      current_ward: activeAdm ? activeAdm.ward_name : null,
      total_blood_requests: bloodRequests.length,
      pending_blood_requests: bloodRequests.filter((b) => b.status === 'pending').length,
      total_medical_records: records.length,
      total_invoices: invoices.length,
    },
    module_1_opd: tokens,
    module_2_beds: {
      active_admission: activeAdmData,
      admissions_history: admissions,
    },
    module_3_bloodbank: bloodRequests,
    module_4_records: records,
    module_5_billing: invoices,
  });
});

accountsRoutes.get('/departments', requireAuth, async (c) => {
  const showAll = c.req.query('all')?.toLowerCase() === 'true' && isAdminUser(c.get('user')!);
  return c.json(await fetchDepartmentsList(c.env.DB, showAll));
});

accountsRoutes.post('/departments', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const name = String(body.name || '').trim();
  if (!name) return c.json({ name: ['Department name is required.'] }, 400);

  const dup = await c.env.DB.prepare('SELECT id FROM departments WHERE name = ?').bind(name).first();
  if (dup) return c.json({ name: ['Department with this name already exists.'] }, 400);

  const res = await c.env.DB
    .prepare('INSERT INTO departments (name, description, is_active) VALUES (?, ?, ?)')
    .bind(name, String(body.description || ''), body.is_active === false ? 0 : 1)
    .run();
  const [created] = await fetchDepartmentsList(c.env.DB, true).then((list) => list.filter((d) => d.id === Number(res.meta.last_row_id)));
  return c.json(created, 201);
});

accountsRoutes.get('/departments/:pk', requireAuth, async (c) => {
  const id = parseIntId(c.req.param('pk'));
  const list = await fetchDepartmentsList(c.env.DB, true);
  const dept = list.find((d) => d.id === id);
  if (!dept) return c.json({ detail: 'Not found.' }, 404);
  return c.json(dept);
});

accountsRoutes.put('/departments/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const existing = await c.env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!existing) return c.json({ detail: 'Not found.' }, 404);

  await c.env.DB
    .prepare('UPDATE departments SET name = ?, description = ?, is_active = ? WHERE id = ?')
    .bind(
      body.name !== undefined ? String(body.name).trim() : String(existing.name),
      body.description !== undefined ? String(body.description) : String(existing.description),
      body.is_active !== undefined ? (body.is_active ? 1 : 0) : Number(existing.is_active),
      id
    )
    .run();

  const updated = (await fetchDepartmentsList(c.env.DB, true)).find((d) => d.id === id);
  return c.json(updated);
});

accountsRoutes.patch('/departments/:pk', requireAuth, async (c) => accountsRoutes.fetch(new Request(c.req.url, { method: 'PUT', headers: c.req.raw.headers, body: await c.req.raw.clone().text() }), c.env, c.executionCtx));

accountsRoutes.delete('/departments/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const existing = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  await c.env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

accountsRoutes.patch('/doctors/toggle-availability', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  let docId: number | null = null;

  if (isAdminUser(user)) {
    docId = parseIntId(body.doctor_id as string);
    if (!docId) return c.json({ detail: 'doctor_id is required.' }, 400);
  } else if (user.doctor_profile_id) {
    docId = user.doctor_profile_id;
  } else {
    return c.json({ detail: 'Not authorized to toggle doctor availability.' }, 403);
  }

  const doc = await c.env.DB.prepare('SELECT id, is_available FROM doctors WHERE id = ?').bind(docId).first<Record<string, unknown>>();
  if (!doc) return c.json({ detail: 'Doctor not found.' }, 404);

  const nextVal = body.is_available === undefined || body.is_available === null ? !Boolean(doc.is_available) : Boolean(body.is_available);
  await c.env.DB.prepare('UPDATE doctors SET is_available = ? WHERE id = ?').bind(nextVal ? 1 : 0, docId).run();

  return c.json({
    doctor_id: docId,
    is_available: nextVal,
    message: `Availability set to ${nextVal ? 'On Duty' : 'Off Duty'}.`,
  });
});

accountsRoutes.get('/doctors', requireAuth, async (c) => {
  const deptId = parseIntId(c.req.query('department'));
  const availableOnly = c.req.query('available')?.toLowerCase() === 'true';
  const search = c.req.query('search') || undefined;
  return c.json(await fetchDoctorsList(c.env.DB, { departmentId: deptId ?? undefined, availableOnly, search }));
});

accountsRoutes.post('/doctors', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username) return c.json({ username: 'Username is required to create a doctor.' }, 400);
  if (!password) return c.json({ password: 'A strong password is required to create a doctor.' }, 400);

  const pwErrors = validatePasswordComplexity(password, { username });
  if (pwErrors.length > 0) return c.json({ password: pwErrors }, 400);

  const dup = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (dup) return c.json({ username: 'This username already exists.' }, 400);

  const pwHash = await hashPassword(password);
  const uRes = await c.env.DB
    .prepare(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, phone, role, is_staff, is_superuser, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'doctor', 0, 0, 1)`
    )
    .bind(
      username,
      String(body.email || `${username}@hospital.local`),
      pwHash,
      String(body.first_name || ''),
      String(body.last_name || ''),
      String(body.phone || '')
    )
    .run();

  const userId = Number(uRes.meta.last_row_id);
  const dRes = await c.env.DB
    .prepare(
      `INSERT INTO doctors (user_id, department_id, specialization, qualification, experience_years, consultation_fee, room_number, avg_consult_minutes, available_days, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      parseIntId(body.department as string),
      String(body.specialization || ''),
      String(body.qualification || 'MBBS, MD'),
      Number(body.experience_years ?? 5),
      Number(body.consultation_fee ?? 500),
      String(body.room_number || 'Room 101'),
      Number(body.avg_consult_minutes ?? 15),
      String(body.available_days || 'Mon-Sat'),
      body.is_available === false ? 0 : 1
    )
    .run();

  const [created] = await fetchDoctorsList(c.env.DB, { id: Number(dRes.meta.last_row_id) });
  return c.json(created, 201);
});

accountsRoutes.get('/doctors/:pk', requireAuth, async (c) => {
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const [doc] = await fetchDoctorsList(c.env.DB, { id });
  if (!doc) return c.json({ detail: 'Not found.' }, 404);
  return c.json(doc);
});

async function updateDoctorHandler(c: { req: { param: (k: string) => string; json: <T>() => Promise<T> }; env: AppEnv['Bindings']; get: (k: 'user') => AuthUser | undefined; json: (d: unknown, s?: number) => Response }) {
  const user = c.get('user')!;
  if (!isAdminUser(user)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const existing = await c.env.DB.prepare('SELECT d.*, u.first_name, u.last_name, u.email, u.phone FROM doctors d JOIN users u ON u.id = d.user_id WHERE d.id = ?').bind(id).first<Record<string, unknown>>();
  if (!existing) return c.json({ detail: 'Not found.' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const userId = Number(existing.user_id);

  if (body.password) {
    const pwErr = validatePasswordComplexity(String(body.password));
    if (pwErr.length > 0) return c.json({ password: pwErr }, 400);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(String(body.password)), userId).run();
  }

  await c.env.DB
    .prepare('UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?')
    .bind(
      body.first_name !== undefined ? String(body.first_name) : String(existing.first_name),
      body.last_name !== undefined ? String(body.last_name) : String(existing.last_name),
      body.email !== undefined ? String(body.email) : String(existing.email),
      body.phone !== undefined ? String(body.phone) : String(existing.phone),
      userId
    )
    .run();

  await c.env.DB
    .prepare(
      `UPDATE doctors SET department_id = ?, specialization = ?, qualification = ?, experience_years = ?,
       consultation_fee = ?, room_number = ?, avg_consult_minutes = ?, available_days = ?, is_available = ?
       WHERE id = ?`
    )
    .bind(
      body.department !== undefined ? parseIntId(body.department as string) : (existing.department_id as number | null),
      body.specialization !== undefined ? String(body.specialization) : String(existing.specialization),
      body.qualification !== undefined ? String(body.qualification) : String(existing.qualification),
      body.experience_years !== undefined ? Number(body.experience_years) : Number(existing.experience_years),
      body.consultation_fee !== undefined ? Number(body.consultation_fee) : Number(existing.consultation_fee),
      body.room_number !== undefined ? String(body.room_number) : String(existing.room_number),
      body.avg_consult_minutes !== undefined ? Number(body.avg_consult_minutes) : Number(existing.avg_consult_minutes),
      body.available_days !== undefined ? String(body.available_days) : String(existing.available_days),
      body.is_available !== undefined ? (body.is_available ? 1 : 0) : Number(existing.is_available),
      id
    )
    .run();

  const [updated] = await fetchDoctorsList(c.env.DB, { id });
  return c.json(updated);
}

accountsRoutes.put('/doctors/:pk', requireAuth, async (c) => updateDoctorHandler(c as never));
accountsRoutes.patch('/doctors/:pk', requireAuth, async (c) => updateDoctorHandler(c as never));

accountsRoutes.delete('/doctors/:pk', requireAuth, async (c) => {
  if (!isAdminUser(c.get('user')!)) return c.json({ detail: 'Admin access required.' }, 403);
  const id = parseIntId(c.req.param('pk'));
  const doc = id ? await c.env.DB.prepare('SELECT user_id FROM doctors WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!doc) return c.json({ detail: 'Not found.' }, 404);
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(Number(doc.user_id)).run();
  return c.body(null, 204);
});

accountsRoutes.get('/leaves', requireAuth, async (c) => {
  const user = c.get('user')!;
  const docParam = parseIntId(c.req.query('doctor'));
  let where = '';
  const binds: unknown[] = [];
  if (docParam) {
    where = 'WHERE dl.doctor_id = ?';
    binds.push(docParam);
  } else if (user.role === 'doctor' && user.doctor_profile_id) {
    where = 'WHERE dl.doctor_id = ?';
    binds.push(user.doctor_profile_id);
  }

  const rows = await c.env.DB
    .prepare(
      `SELECT dl.*, u.first_name, u.last_name, u.username
       FROM doctor_leaves dl
       JOIN doctors d ON d.id = dl.doctor_id
       JOIN users u ON u.id = d.user_id
       ${where}
       ORDER BY dl.start_date ASC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return c.json(
    rows.results.map((r) => ({
      id: Number(r.id),
      doctor: Number(r.doctor_id),
      doctor_name: `Dr. ${fullName(r.first_name as string, r.last_name as string, r.username as string)}`,
      start_date: String(r.start_date),
      end_date: String(r.end_date),
      reason: String(r.reason || ''),
      is_approved: Boolean(r.is_approved),
      created_at: String(r.created_at),
    }))
  );
});

accountsRoutes.post('/leaves', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  let docId: number | null = null;
  if (user.role === 'doctor' && user.doctor_profile_id) {
    docId = user.doctor_profile_id;
  } else if (isAdminUser(user)) {
    docId = parseIntId(body.doctor as string);
    if (!docId) return c.json({ doctor: 'Admin must specify a doctor ID.' }, 400);
  } else {
    return c.json({ detail: 'Only doctors or administrators can schedule leave.' }, 403);
  }

  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  if (!startDate || !endDate) return c.json({ detail: 'start_date and end_date are required.' }, 400);
  if (endDate < startDate) return c.json({ end_date: 'End date cannot be earlier than start date.' }, 400);

  const res = await c.env.DB
    .prepare('INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason, is_approved) VALUES (?, ?, ?, ?, 1)')
    .bind(docId, startDate, endDate, String(body.reason || ''))
    .run();

  const row = await c.env.DB
    .prepare(
      `SELECT dl.*, u.first_name, u.last_name, u.username
       FROM doctor_leaves dl JOIN doctors d ON d.id = dl.doctor_id JOIN users u ON u.id = d.user_id WHERE dl.id = ?`
    )
    .bind(Number(res.meta.last_row_id))
    .first<Record<string, unknown>>();

  return c.json(
    {
      id: Number(row?.id),
      doctor: Number(row?.doctor_id),
      doctor_name: `Dr. ${fullName(row?.first_name as string, row?.last_name as string, row?.username as string)}`,
      start_date: String(row?.start_date),
      end_date: String(row?.end_date),
      reason: String(row?.reason || ''),
      is_approved: Boolean(row?.is_approved),
      created_at: String(row?.created_at),
    },
    201
  );
});

accountsRoutes.delete('/leaves/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const leave = id ? await c.env.DB.prepare('SELECT id, doctor_id FROM doctor_leaves WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!leave) return c.json({ detail: 'Not found.' }, 404);
  if (!isAdminUser(user) && Number(leave.doctor_id) !== user.doctor_profile_id) {
    return c.json({ detail: 'Not authorized.' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM doctor_leaves WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

accountsRoutes.get('/feedback', requireAuth, async (c) => {
  const user = c.get('user')!;
  const docParam = parseIntId(c.req.query('doctor'));
  let where = '';
  const binds: unknown[] = [];

  if (docParam) {
    where = 'WHERE f.doctor_id = ?';
    binds.push(docParam);
  } else if (user.role === 'doctor' && user.doctor_profile_id) {
    where = 'WHERE f.doctor_id = ?';
    binds.push(user.doctor_profile_id);
  } else if (user.role === 'patient' && user.patient_profile_id) {
    where = 'WHERE f.patient_id = ?';
    binds.push(user.patient_profile_id);
  }

  const rows = await c.env.DB
    .prepare(
      `SELECT f.*, p.patient_id AS p_code, pu.first_name AS p_first,
              du.first_name AS d_first, du.last_name AS d_last, du.username AS d_user,
              t.token_code
       FROM doctor_feedbacks f
       JOIN patients p ON p.id = f.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctors doc ON doc.id = f.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN opd_tokens t ON t.id = f.token_id
       ${where}
       ORDER BY f.created_at DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return c.json(
    rows.results.map((r) => ({
      id: Number(r.id),
      doctor: Number(r.doctor_id),
      doctor_name: `Dr. ${fullName(r.d_first as string, r.d_last as string, r.d_user as string)}`,
      patient: Number(r.patient_id),
      patient_display: `${String(r.p_first || 'Patient')} (${String(r.p_code || 'Verified')})`,
      token: r.token_id ? Number(r.token_id) : null,
      token_code: r.token_code ? String(r.token_code) : null,
      rating: Number(r.rating),
      comment: String(r.comment || ''),
      created_at: String(r.created_at),
    }))
  );
});

accountsRoutes.post('/feedback', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (user.role !== 'patient' || !user.patient_profile_id) {
    return c.json({ detail: 'Only registered patients can submit doctor ratings.' }, 403);
  }
  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const docId = parseIntId(body.doctor as string);
  const tokenId = parseIntId(body.token as string);
  const rating = Number(body.rating ?? 5);
  const comment = String(body.comment || '');

  if (!docId) return c.json({ doctor: ['This field is required.'] }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return c.json({ rating: ['Rating must be between 1 and 5.'] }, 400);

  if (tokenId) {
    const tok = await c.env.DB.prepare('SELECT id, patient_id, doctor_id, status FROM opd_tokens WHERE id = ?').bind(tokenId).first<Record<string, unknown>>();
    if (!tok) return c.json({ token: ['Token not found.'] }, 400);
    if (Number(tok.patient_id) !== user.patient_profile_id) {
      return c.json({ detail: 'You can only rate consultations linked to your own OPD token.' }, 403);
    }
    if (Number(tok.doctor_id) !== docId) {
      return c.json({ detail: 'Selected token does not belong to the chosen doctor.' }, 400);
    }
    if (!['completed', 'admitted'].includes(String(tok.status))) {
      return c.json({ detail: 'Feedback can only be submitted after consultation is completed.' }, 400);
    }
    const existingFb = await c.env.DB.prepare('SELECT id FROM doctor_feedbacks WHERE token_id = ?').bind(tokenId).first();
    if (existingFb) {
      return c.json({ detail: 'Feedback has already been submitted for this consultation.' }, 400);
    }
  }

  const res = await c.env.DB
    .prepare('INSERT INTO doctor_feedbacks (doctor_id, patient_id, token_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
    .bind(docId, user.patient_profile_id, tokenId, rating, comment)
    .run();
  const fbId = Number(res.meta.last_row_id);

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'DoctorFeedback',
    resource_id: fbId,
    patient_id: user.patient_profile_id,
    details: `Rated Doctor #${docId} ${rating}/5.`,
  });

  const row = await c.env.DB
    .prepare(
      `SELECT f.*, p.patient_id AS p_code, pu.first_name AS p_first,
              du.first_name AS d_first, du.last_name AS d_last, du.username AS d_user,
              t.token_code
       FROM doctor_feedbacks f
       JOIN patients p ON p.id = f.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctors doc ON doc.id = f.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN opd_tokens t ON t.id = f.token_id
       WHERE f.id = ?`
    )
    .bind(fbId)
    .first<Record<string, unknown>>();

  return c.json(
    {
      id: fbId,
      doctor: docId,
      doctor_name: `Dr. ${fullName(row?.d_first as string, row?.d_last as string, row?.d_user as string)}`,
      patient: user.patient_profile_id,
      patient_display: `${String(row?.p_first || 'Patient')} (${String(row?.p_code || 'Verified')})`,
      token: tokenId,
      token_code: row?.token_code ? String(row.token_code) : null,
      rating,
      comment,
      created_at: String(row?.created_at || nowIso()),
    },
    201
  );
});
