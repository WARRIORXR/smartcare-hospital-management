import type { Context } from 'hono';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string;
  patient_profile_id: number | null;
  patient_code: string | null;
  patient_blood_group: string | null;
  doctor_profile_id: number | null;
  specialization: string | null;
  room_number: string | null;
  avg_consult_minutes: number | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user?: AuthUser;
    jti?: string;
  };
};

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function todayIstDate(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysDateStr(baseYmd: string, days: number): string {
  const [y, m, d] = baseYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenYmd(laterYmd: string, earlierYmd: string): number {
  const t1 = Date.parse(`${laterYmd}T00:00:00Z`);
  const t2 = Date.parse(`${earlierYmd}T00:00:00Z`);
  return Math.round((t1 - t2) / 86400000);
}

export function formatIstTime(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(11, 19);
}

export function formatDisplayDate(ymd?: string | null): string {
  if (!ymd) return '';
  const dt = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${day} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

export function formatShortWeekday(ymd: string): string {
  const dt = new Date(`${ymd}T00:00:00Z`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[dt.getUTCDay()]} (${String(dt.getUTCDate()).padStart(2, '0')} ${months[dt.getUTCMonth()]})`;
}

export function fullName(firstName?: string | null, lastName?: string | null, username?: string | null): string {
  const combined = `${firstName || ''} ${lastName || ''}`.trim();
  return combined || username || 'User';
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function moneyStr(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

export function parseIntId(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function isAdminUser(user: AuthUser): boolean {
  return user.role === 'admin' || user.is_staff || user.is_superuser;
}

export function isClinicalStaffUser(user: AuthUser): boolean {
  return ['admin', 'doctor', 'reception'].includes(user.role) || user.is_staff || user.is_superuser;
}

export function isAnyStaffUser(user: AuthUser): boolean {
  return ['admin', 'doctor', 'reception', 'bloodbank_staff'].includes(user.role) || user.is_staff || user.is_superuser;
}

export function getClientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  );
}

export async function recordAuditLog(
  c: Context<AppEnv>,
  params: {
    action: string;
    resource_type: string;
    resource_id?: string | number | null;
    patient_id?: number | null;
    actor?: AuthUser | null;
    actor_username?: string;
    actor_role?: string;
    details?: string;
  }
): Promise<void> {
  try {
    const user = params.actor ?? c.get('user') ?? null;
    const username = params.actor_username ?? user?.username ?? 'anonymous';
    const role = params.actor_role ?? user?.role ?? 'anonymous';
    const ip = getClientIp(c).slice(0, 64);
    const ua = (c.req.header('user-agent') || '').slice(0, 255);
    await c.env.DB.prepare(
      `INSERT INTO audit_logs
       (actor_id, actor_username, actor_role, action, resource_type, resource_id, patient_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user?.id ?? null,
        username.slice(0, 150),
        role.slice(0, 30),
        params.action,
        params.resource_type,
        params.resource_id !== undefined && params.resource_id !== null ? String(params.resource_id) : '',
        params.patient_id ?? null,
        ip,
        ua,
        params.details ?? ''
      )
      .run();
  } catch (err) {
    console.error(JSON.stringify({ message: 'audit log write failed', error: err instanceof Error ? err.message : String(err) }));
  }
}

export function serializeUserSummary(user: AuthUser) {
  const data: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: fullName(user.first_name, user.last_name, user.username),
    role: user.role,
    phone: user.phone,
    is_active: user.is_active,
    is_staff: user.is_staff,
    date_joined: user.date_joined,
  };
  if (user.role === 'patient' && user.patient_profile_id) {
    data.patient_id = user.patient_code;
    data.patient_profile_id = user.patient_profile_id;
    data.blood_group = user.patient_blood_group;
  }
  if (user.role === 'doctor' && user.doctor_profile_id) {
    data.doctor_profile_id = user.doctor_profile_id;
    data.specialization = user.specialization;
    data.room_number = user.room_number;
    data.avg_consult_minutes = user.avg_consult_minutes;
  }
  return data;
}

export async function loadAuthUserById(db: D1Database, userId: number): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role, u.phone,
              u.is_staff, u.is_superuser, u.is_active, u.date_joined,
              p.id AS patient_profile_id, p.patient_id AS patient_code, p.blood_group AS patient_blood_group,
              d.id AS doctor_profile_id, d.specialization AS specialization, d.room_number AS room_number,
              d.avg_consult_minutes AS avg_consult_minutes
       FROM users u
       LEFT JOIN patients p ON p.user_id = u.id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.id = ?`
    )
    .bind(userId)
    .first<Record<string, unknown>>();

  if (!row || !row.is_active) return null;

  return {
    id: Number(row.id),
    username: String(row.username),
    email: String(row.email || ''),
    first_name: String(row.first_name || ''),
    last_name: String(row.last_name || ''),
    role: String(row.role || 'patient'),
    phone: String(row.phone || ''),
    is_staff: Boolean(row.is_staff),
    is_superuser: Boolean(row.is_superuser),
    is_active: Boolean(row.is_active),
    date_joined: String(row.date_joined || ''),
    patient_profile_id: row.patient_profile_id ? Number(row.patient_profile_id) : null,
    patient_code: row.patient_code ? String(row.patient_code) : null,
    patient_blood_group: row.patient_blood_group ? String(row.patient_blood_group) : null,
    doctor_profile_id: row.doctor_profile_id ? Number(row.doctor_profile_id) : null,
    specialization: row.specialization ? String(row.specialization) : null,
    room_number: row.room_number ? String(row.room_number) : null,
    avg_consult_minutes: row.avg_consult_minutes !== null && row.avg_consult_minutes !== undefined ? Number(row.avg_consult_minutes) : null,
  };
}
