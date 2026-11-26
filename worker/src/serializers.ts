import { addDaysDateStr, daysBetweenYmd, fullName, moneyStr, round2, todayIstDate } from './utils';

export const STANDARD_TIME_SLOTS = [
  '09:00 AM - 09:30 AM',
  '09:30 AM - 10:00 AM',
  '10:00 AM - 10:30 AM',
  '10:30 AM - 11:00 AM',
  '11:00 AM - 11:30 AM',
  '11:30 AM - 12:00 PM',
  '02:00 PM - 02:30 PM',
  '02:30 PM - 03:00 PM',
  '03:00 PM - 03:30 PM',
  '03:30 PM - 04:00 PM',
];

export const ALL_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export const COMPATIBLE_DONORS: Record<string, string[]> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

const DISPLAY_MAPS = {
  tokenStatus: {
    waiting: 'Waiting',
    called: 'Called to Chamber',
    in_progress: 'In Consultation',
    completed: 'Completed',
    admitted: 'Admitted to Ward',
    cancelled: 'Cancelled',
    skipped: 'Skipped',
  } as Record<string, string>,
  wardType: {
    general: 'General Ward',
    icu: 'ICU / Critical Care',
    private: 'Private Room',
    semi: 'Semi-Private Ward',
    emergency: 'Emergency / Casualty',
    pediatric: 'Pediatric Ward',
    maternity: 'Maternity Ward',
  } as Record<string, string>,
  bedStatus: {
    available: 'Available',
    occupied: 'Occupied',
    cleaning: 'Cleaning / Sanitizing',
    maintenance: 'Under Maintenance',
    reserved: 'Reserved',
  } as Record<string, string>,
  reqPriority: {
    normal: 'Normal',
    urgent: 'Urgent',
    emergency: 'Emergency',
  } as Record<string, string>,
  reqStatus: {
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    fulfilled: 'Fulfilled / Issued',
    cancelled: 'Cancelled',
  } as Record<string, string>,
  recordType: {
    visit_note: 'Clinical Visit Note',
    prescription: 'Digital Prescription',
    lab_report: 'Lab Diagnostic Report',
  } as Record<string, string>,
  invoiceStatus: {
    unpaid: 'Pending Payment',
    paid: 'Paid',
    cancelled: 'Cancelled',
  } as Record<string, string>,
  invoiceCategory: {
    opd_fee: 'OPD Consultation',
    ward_charge: 'Ward / Bed Stay',
    blood_bank: 'Blood Bank Unit',
    lab_test: 'Lab / Diagnostic',
    medication: 'Pharmacy / Medication',
    other: 'Other Charge',
  } as Record<string, string>,
};

export function displayLabel(map: keyof typeof DISPLAY_MAPS, key: string): string {
  return DISPLAY_MAPS[map][key] ?? key;
}

export async function fetchDepartmentsList(db: D1Database, showAll: boolean) {
  const where = showAll ? '' : 'WHERE d.is_active = 1';
  const rows = await db
    .prepare(
      `SELECT d.id, d.name, d.description, d.is_active, d.created_at,
              COUNT(doc.id) AS doctor_count
       FROM departments d
       LEFT JOIN doctors doc ON doc.department_id = d.id
       ${where}
       GROUP BY d.id
       ORDER BY d.name ASC`
    )
    .all<Record<string, unknown>>();

  return rows.results.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    description: String(r.description || ''),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at),
    doctor_count: Number(r.doctor_count || 0),
  }));
}

export async function fetchDoctorsList(
  db: D1Database,
  filters: { id?: number; departmentId?: number; availableOnly?: boolean; search?: string } = {}
) {
  const today = todayIstDate();
  const clauses: string[] = [];
  const binds: unknown[] = [today, today, today];

  if (filters.id) {
    clauses.push('d.id = ?');
    binds.push(filters.id);
  }
  if (filters.departmentId) {
    clauses.push('d.department_id = ?');
    binds.push(filters.departmentId);
  }
  if (filters.availableOnly) {
    clauses.push('d.is_available = 1');
  }
  if (filters.search) {
    const q = `%${filters.search}%`;
    clauses.push(
      '(u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ? OR d.specialization LIKE ? OR dept.name LIKE ?)'
    );
    binds.push(q, q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db
    .prepare(
      `SELECT d.*, u.id AS u_id, u.username, u.first_name, u.last_name,
              dept.name AS department_name,
              (SELECT COUNT(*) FROM opd_tokens t WHERE t.doctor_id = d.id AND t.appointment_date = ? AND t.status = 'waiting') AS waiting_patients_count,
              COALESCE((SELECT q.total_tokens FROM opd_queues q WHERE q.doctor_id = d.id AND q.queue_date = ? LIMIT 1), 0) AS today_total_tokens,
              COALESCE((SELECT q.current_token FROM opd_queues q WHERE q.doctor_id = d.id AND q.queue_date = ? LIMIT 1), 0) AS current_serving_token,
              (SELECT ROUND(AVG(f.rating), 1) FROM doctor_feedbacks f WHERE f.doctor_id = d.id) AS average_rating,
              (SELECT COUNT(*) FROM doctor_feedbacks f WHERE f.doctor_id = d.id) AS feedback_count
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN departments dept ON dept.id = d.department_id
       ${where}
       ORDER BY u.first_name ASC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  const leavesRows = await db
    .prepare('SELECT id, doctor_id, start_date, end_date, reason FROM doctor_leaves WHERE end_date >= ? AND is_approved = 1 ORDER BY start_date ASC')
    .bind(today)
    .all<Record<string, unknown>>();

  const leavesByDoctor = new Map<number, Array<{ id: number; start_date: string; end_date: string; reason: string }>>();
  for (const lr of leavesRows.results) {
    const docId = Number(lr.doctor_id);
    const list = leavesByDoctor.get(docId) ?? [];
    if (list.length < 5) {
      list.push({
        id: Number(lr.id),
        start_date: String(lr.start_date),
        end_date: String(lr.end_date),
        reason: String(lr.reason || ''),
      });
      leavesByDoctor.set(docId, list);
    }
  }

  return rows.results.map((r) => {
    const docId = Number(r.id);
    const waitingCount = Number(r.waiting_patients_count || 0);
    const avgMins = Number(r.avg_consult_minutes || 15);
    return {
      id: docId,
      user_id: Number(r.u_id),
      username: String(r.username),
      first_name: String(r.first_name || ''),
      last_name: String(r.last_name || ''),
      doctor_name: `Dr. ${fullName(r.first_name as string, r.last_name as string, r.username as string)}`,
      department: r.department_id ? Number(r.department_id) : null,
      department_name: r.department_name ? String(r.department_name) : null,
      specialization: String(r.specialization || ''),
      qualification: String(r.qualification || 'MBBS, MD'),
      experience_years: Number(r.experience_years || 5),
      consultation_fee: moneyStr(r.consultation_fee as number),
      room_number: String(r.room_number || 'Room 101'),
      avg_consult_minutes: avgMins,
      available_days: String(r.available_days || 'Mon-Sat'),
      is_available: Boolean(r.is_available),
      waiting_patients_count: waitingCount,
      estimated_wait_time: waitingCount * avgMins,
      today_total_tokens: Number(r.today_total_tokens || 0),
      current_serving_token: Number(r.current_serving_token || 0),
      average_rating: r.average_rating !== null && r.average_rating !== undefined ? Number(r.average_rating) : null,
      feedback_count: Number(r.feedback_count || 0),
      upcoming_leaves: leavesByDoctor.get(docId) ?? [],
      created_at: String(r.created_at),
    };
  });
}

export async function fetchTokensDetailed(
  db: D1Database,
  whereSql: string,
  binds: unknown[],
  orderSql = 't.appointment_date DESC, t.token_number DESC',
  limit?: number
) {
  const limitSql = limit ? `LIMIT ${limit}` : '';
  const rows = await db
    .prepare(
      `SELECT t.*,
              p.patient_id AS patient_code, p.blood_group AS patient_blood_group, p.gender AS patient_gender,
              pu.first_name AS p_first, pu.last_name AS p_last, pu.username AS p_user, pu.phone AS patient_phone,
              du.first_name AS d_first, du.last_name AS d_last, du.username AS d_user,
              doc.room_number, doc.avg_consult_minutes,
              COALESCE(dept.name, doc_dept.name, 'General') AS department_name,
              (SELECT COUNT(*) FROM opd_tokens t2
               WHERE t2.doctor_id = t.doctor_id AND t2.appointment_date = t.appointment_date
                 AND t2.status = 'waiting' AND t2.token_number < t.token_number) AS tokens_ahead_calc,
              COALESCE((SELECT q.current_token FROM opd_queues q
               WHERE q.doctor_id = t.doctor_id AND q.queue_date = t.appointment_date LIMIT 1), 0) AS current_serving_token,
              EXISTS(SELECT 1 FROM doctor_feedbacks df WHERE df.token_id = t.id) AS has_feedback
       FROM opd_tokens t
       JOIN patients p ON p.id = t.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctors doc ON doc.id = t.doctor_id
       JOIN users du ON du.id = doc.user_id
       LEFT JOIN departments dept ON dept.id = t.department_id
       LEFT JOIN departments doc_dept ON doc_dept.id = doc.department_id
       ${whereSql}
       ORDER BY ${orderSql}
       ${limitSql}`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  const admRows = await db
    .prepare(
      `SELECT a.id AS admission_id, a.patient_id, a.admission_date, b.bed_number, w.name AS ward_name
       FROM admissions a
       JOIN beds b ON b.id = a.bed_id
       JOIN wards w ON w.id = b.ward_id
       WHERE a.status = 'admitted'
       ORDER BY a.admission_date DESC`
    )
    .all<Record<string, unknown>>();

  const activeAdmByPatient = new Map<number, Record<string, unknown>>();
  for (const ar of admRows.results) {
    const pid = Number(ar.patient_id);
    if (!activeAdmByPatient.has(pid)) {
      activeAdmByPatient.set(pid, {
        admission_id: Number(ar.admission_id),
        ward_name: String(ar.ward_name || ''),
        bed_number: String(ar.bed_number || ''),
        admission_date: ar.admission_date ? String(ar.admission_date) : null,
      });
    }
  }

  return rows.results.map((r) => {
    const status = String(r.status);
    const ahead = status === 'waiting' ? Number(r.tokens_ahead_calc || 0) : 0;
    const avgMins = Number(r.avg_consult_minutes || 15);
    const waitMins = status === 'waiting' ? ahead * avgMins : 0;
    const patId = Number(r.patient_id);
    const patName = fullName(r.p_first as string, r.p_last as string, r.p_user as string);
    const docName = `Dr. ${fullName(r.d_first as string, r.d_last as string, r.d_user as string)}`;
    const patCode = String(r.patient_code || `PAT-${String(patId).padStart(4, '0')}`);
    const slot = String(r.time_slot || '');
    const prio = String(r.priority || 'normal');
    const room = String(r.room_number || 'Room 101');
    const apptDate = String(r.appointment_date);
    const tokenCode = String(r.token_code);

    return {
      id: Number(r.id),
      token_code: tokenCode,
      token_number: Number(r.token_number),
      patient: patId,
      patient_name: patName,
      patient_code: patCode,
      patient_blood_group: String(r.patient_blood_group || ''),
      patient_gender: String(r.patient_gender || ''),
      patient_phone: String(r.patient_phone || ''),
      doctor: Number(r.doctor_id),
      doctor_name: docName,
      department: r.department_id ? Number(r.department_id) : null,
      department_name: String(r.department_name || 'General'),
      room_number: room,
      avg_consult_minutes: avgMins,
      appointment_date: apptDate,
      time_slot: slot,
      is_advance_booking: Boolean(r.is_advance_booking),
      status,
      priority: prio,
      symptoms: String(r.symptoms || ''),
      is_emergency: Boolean(r.is_emergency),
      queue_position: status === 'waiting' ? ahead + 1 : 0,
      tokens_ahead: ahead,
      estimated_wait_minutes: waitMins,
      approx_waiting_time: waitMins,
      current_serving_token: Number(r.current_serving_token || 0),
      qr_data: `SMARTCARE-TOKEN:${tokenCode}|PATIENT:${patCode}|DOCTOR:Dr.${String(r.d_last || r.d_user)}|ROOM:${room}|DATE:${apptDate}|SLOT:${slot || 'WALKIN'}|PRIORITY:${prio.toUpperCase()}`,
      active_admission: activeAdmByPatient.get(patId) ?? null,
      has_feedback: Boolean(r.has_feedback),
      created_at: String(r.created_at),
    };
  });
}

export async function fetchBedsDetailed(
  db: D1Database,
  includePii: boolean,
  filters: { id?: number; wardId?: number; status?: string; wardType?: string } = {}
) {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filters.id) {
    clauses.push('b.id = ?');
    binds.push(filters.id);
  }
  if (filters.wardId) {
    clauses.push('b.ward_id = ?');
    binds.push(filters.wardId);
  }
  if (filters.status) {
    clauses.push('b.status = ?');
    binds.push(filters.status);
  }
  if (filters.wardType) {
    clauses.push('w.ward_type = ?');
    binds.push(filters.wardType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await db
    .prepare(
      `SELECT b.*, w.name AS ward_name, w.ward_type,
              a.id AS adm_id, a.patient_id AS adm_patient_id,
              p.blood_group AS pat_blood_group,
              u.first_name AS p_first, u.last_name AS p_last, u.username AS p_user
       FROM beds b
       JOIN wards w ON w.id = b.ward_id
       LEFT JOIN admissions a ON a.bed_id = b.id AND a.status = 'admitted'
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY b.ward_id ASC, b.bed_number ASC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return rows.results.map((r) => {
    const status = String(r.status);
    const showPat = status === 'occupied' && includePii && r.adm_id;
    return {
      id: Number(r.id),
      ward: Number(r.ward_id),
      ward_name: String(r.ward_name),
      ward_type: String(r.ward_type),
      bed_number: String(r.bed_number),
      status,
      status_display: displayLabel('bedStatus', status),
      has_oxygen: Boolean(r.has_oxygen),
      has_ventilator: Boolean(r.has_ventilator),
      has_monitor: Boolean(r.has_monitor),
      current_patient_name: showPat ? fullName(r.p_first as string, r.p_last as string, r.p_user as string) : null,
      current_patient_id: showPat && r.adm_patient_id ? Number(r.adm_patient_id) : null,
      current_patient_blood_group: showPat ? String(r.pat_blood_group || '') : null,
      current_admission_id: showPat ? Number(r.adm_id) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  });
}

export async function fetchWardsWithBeds(
  db: D1Database,
  includePii: boolean,
  filters: { id?: number; wardType?: string } = {}
) {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (filters.id) {
    clauses.push('w.id = ?');
    binds.push(filters.id);
  }
  if (filters.wardType) {
    clauses.push('w.ward_type = ?');
    binds.push(filters.wardType);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const wardRows = await db
    .prepare(
      `SELECT w.*, d.name AS department_name
       FROM wards w
       LEFT JOIN departments d ON d.id = w.department_id
       ${where}
       ORDER BY w.floor_number ASC, w.name ASC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  const allBeds = await fetchBedsDetailed(db, includePii, filters.id ? { wardId: filters.id } : {});
  const bedsByWard = new Map<number, typeof allBeds>();
  for (const b of allBeds) {
    const arr = bedsByWard.get(b.ward) ?? [];
    arr.push(b);
    bedsByWard.set(b.ward, arr);
  }

  return wardRows.results.map((w) => {
    const wId = Number(w.id);
    const wBeds = bedsByWard.get(wId) ?? [];
    return {
      id: wId,
      name: String(w.name),
      ward_type: String(w.ward_type),
      ward_type_display: displayLabel('wardType', String(w.ward_type)),
      department: w.department_id ? Number(w.department_id) : null,
      department_name: w.department_name ? String(w.department_name) : null,
      total_beds: Number(w.total_beds || 0),
      floor_number: Number(w.floor_number || 1),
      is_active: Boolean(w.is_active),
      total_beds_count: wBeds.length,
      available_beds_count: wBeds.filter((b) => b.status === 'available').length,
      occupied_beds_count: wBeds.filter((b) => b.status === 'occupied').length,
      cleaning_beds_count: wBeds.filter((b) => b.status === 'cleaning').length,
      beds: wBeds,
      created_at: String(w.created_at),
    };
  });
}

export async function fetchAdmissionsDetailed(db: D1Database, whereSql: string, binds: unknown[]) {
  const rows = await db
    .prepare(
      `SELECT a.*,
              p.patient_id AS patient_code, p.gender AS patient_gender, p.blood_group AS patient_blood_group,
              pu.first_name AS p_first, pu.last_name AS p_last, pu.username AS p_user, pu.phone AS patient_phone,
              b.bed_number, w.name AS ward_name, w.ward_type,
              du.first_name AS d_first, du.last_name AS d_last, du.username AS d_user,
              t.token_code
       FROM admissions a
       JOIN patients p ON p.id = a.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN beds b ON b.id = a.bed_id
       JOIN wards w ON w.id = b.ward_id
       LEFT JOIN doctors doc ON doc.id = a.attending_doctor_id
       LEFT JOIN users du ON du.id = doc.user_id
       LEFT JOIN opd_tokens t ON t.id = a.token_id
       ${whereSql}
       ORDER BY a.admission_date DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return rows.results.map((r) => ({
    id: Number(r.id),
    patient: Number(r.patient_id),
    patient_id: Number(r.patient_id),
    patient_name: fullName(r.p_first as string, r.p_last as string, r.p_user as string),
    patient_code: String(r.patient_code || `PAT-${String(r.patient_id).padStart(4, '0')}`),
    patient_phone: String(r.patient_phone || 'N/A'),
    patient_gender: String(r.patient_gender || 'N/A'),
    patient_blood_group: String(r.patient_blood_group || 'N/A'),
    bed: Number(r.bed_id),
    bed_number: String(r.bed_number),
    ward_name: String(r.ward_name),
    ward_type: String(r.ward_type),
    attending_doctor: r.attending_doctor_id ? Number(r.attending_doctor_id) : null,
    attending_doctor_name: r.attending_doctor_id
      ? `Dr. ${fullName(r.d_first as string, r.d_last as string, r.d_user as string)}`
      : 'Not Assigned',
    token: r.token_id ? Number(r.token_id) : null,
    token_code: r.token_code ? String(r.token_code) : null,
    diagnosis: String(r.diagnosis || ''),
    admission_date: String(r.admission_date),
    discharge_date: r.discharge_date ? String(r.discharge_date) : null,
    status: String(r.status),
    discharge_notes: String(r.discharge_notes || ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function ensureAndFetchBloodStock(db: D1Database) {
  const today = todayIstDate();
  const defaultExp = addDaysDateStr(today, 35);
  const existing = await db.prepare('SELECT * FROM blood_stock ORDER BY blood_group ASC').all<Record<string, unknown>>();
  const seen = new Set(existing.results.map((r) => String(r.blood_group)));

  for (const bg of ALL_BLOOD_GROUPS) {
    if (!seen.has(bg)) {
      await db
        .prepare('INSERT OR IGNORE INTO blood_stock (blood_group, units_available, units_reserved, minimum_threshold, expiry_date) VALUES (?, 0, 0, 3, ?)')
        .bind(bg, defaultExp)
        .run();
    }
  }

  const rows = await db.prepare('SELECT * FROM blood_stock ORDER BY blood_group ASC').all<Record<string, unknown>>();
  return rows.results.map((r) => serializeBloodStockRow(r, today));
}

export function serializeBloodStockRow(r: Record<string, unknown>, today = todayIstDate()) {
  const units = Number(r.units_available || 0);
  const reserved = Number(r.units_reserved || 0);
  const threshold = Number(r.minimum_threshold || 3);
  const exp = r.expiry_date ? String(r.expiry_date) : null;
  return {
    id: Number(r.id),
    blood_group: String(r.blood_group),
    blood_group_display: String(r.blood_group),
    units_available: units,
    units_reserved: reserved,
    total_usable: Math.max(0, units - reserved),
    minimum_threshold: threshold,
    expiry_date: exp,
    is_critical: units < threshold,
    is_low: units < threshold,
    days_until_expiry: exp ? daysBetweenYmd(exp, today) : null,
    is_expired: exp ? exp < today : false,
    last_updated: String(r.last_updated),
  };
}

export function serializeDonorRow(r: Record<string, unknown>, today = todayIstDate()) {
  const lastDate = r.last_donation_date ? String(r.last_donation_date) : null;
  const daysSince = lastDate ? Math.max(0, daysBetweenYmd(today, lastDate)) : null;
  const eligibleFlag = Boolean(r.is_eligible);
  const canDonate = eligibleFlag && (daysSince === null || daysSince >= 90);
  return {
    id: Number(r.id),
    name: String(r.name),
    blood_group: String(r.blood_group),
    blood_group_display: String(r.blood_group),
    phone: String(r.phone),
    city: String(r.city || ''),
    age: Number(r.age || 28),
    gender: String(r.gender || 'M'),
    address: String(r.address || ''),
    last_donation_date: lastDate,
    is_eligible: eligibleFlag,
    can_donate_now: canDonate,
    days_since_last_donation: daysSince,
    notes: String(r.notes || ''),
    created_at: String(r.created_at),
  };
}

export async function fetchBloodRequestsDetailed(db: D1Database, whereSql: string, binds: unknown[]) {
  const rows = await db
    .prepare(
      `SELECT br.*,
              p.patient_id AS patient_code,
              pu.first_name AS p_first, pu.last_name AS p_last, pu.username AS p_user,
              ru.first_name AS r_first, ru.last_name AS r_last, ru.username AS r_user,
              bs.units_available AS stock_units, bs.minimum_threshold AS stock_threshold
       FROM blood_requests br
       LEFT JOIN patients p ON p.id = br.patient_id
       LEFT JOIN users pu ON pu.id = p.user_id
       LEFT JOIN users ru ON ru.id = br.requested_by_id
       LEFT JOIN blood_stock bs ON bs.blood_group = br.blood_group
       ${whereSql}
       ORDER BY br.created_at DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return rows.results.map((r) => {
    const avail = Number(r.stock_units || 0);
    const reqUnits = Number(r.units_required || 1);
    const explicitName = String(r.patient_name || '').trim();
    const joinedPatName = r.patient_id ? fullName(r.p_first as string, r.p_last as string, r.p_user as string) : 'Patient';
    return {
      id: Number(r.id),
      patient: r.patient_id ? Number(r.patient_id) : null,
      patient_id: r.patient_id ? Number(r.patient_id) : null,
      patient_code: r.patient_code ? String(r.patient_code) : null,
      patient_name: explicitName || joinedPatName,
      hospital_ward: String(r.hospital_ward || ''),
      requested_by: r.requested_by_id ? Number(r.requested_by_id) : null,
      requested_by_name: r.requested_by_id
        ? fullName(r.r_first as string, r.r_last as string, r.r_user as string)
        : 'Medical Staff',
      blood_group: String(r.blood_group),
      units_required: reqUnits,
      units_provided: Number(r.units_provided || 0),
      purpose: String(r.purpose || 'other'),
      priority: String(r.priority || 'normal'),
      priority_display: displayLabel('reqPriority', String(r.priority || 'normal')),
      status: String(r.status || 'pending'),
      status_display: displayLabel('reqStatus', String(r.status || 'pending')),
      required_by_date: r.required_by_date ? String(r.required_by_date) : null,
      notes: String(r.notes || ''),
      available_units_now: avail,
      is_stock_low: avail < 3 || avail < reqUnits,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  });
}

export async function fetchMedicalRecordsDetailed(db: D1Database, whereSql: string, binds: unknown[]) {
  const rows = await db
    .prepare(
      `SELECT mr.*,
              p.patient_id AS patient_code,
              pu.first_name AS p_first, pu.last_name AS p_last, pu.username AS p_user,
              du.first_name AS d_first, du.last_name AS d_last, du.username AS d_user
       FROM medical_records mr
       JOIN patients p ON p.id = mr.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN doctors doc ON doc.id = mr.doctor_id
       LEFT JOIN users du ON du.id = doc.user_id
       ${whereSql}
       ORDER BY mr.created_at DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return rows.results.map((r) => {
    let parsedItems: unknown[] = [];
    try {
      const p = JSON.parse(String(r.prescription_items || '[]'));
      if (Array.isArray(p)) parsedItems = p;
    } catch {
      parsedItems = [];
    }
    const attachName = r.attachment_name ? String(r.attachment_name) : null;
    return {
      id: Number(r.id),
      patient: Number(r.patient_id),
      patient_name: fullName(r.p_first as string, r.p_last as string, r.p_user as string),
      patient_code: String(r.patient_code || ''),
      doctor: r.doctor_id ? Number(r.doctor_id) : null,
      doctor_name: r.doctor_id
        ? `Dr. ${fullName(r.d_first as string, r.d_last as string, r.d_user as string)}`
        : 'Hospital Clinician',
      token: r.token_id ? Number(r.token_id) : null,
      admission: r.admission_id ? Number(r.admission_id) : null,
      record_type: String(r.record_type),
      record_type_display: displayLabel('recordType', String(r.record_type)),
      title: String(r.title),
      diagnosis: String(r.diagnosis || ''),
      visit_notes: String(r.visit_notes || ''),
      prescription_items: parsedItems,
      attachment: attachName,
      has_attachment: Boolean(attachName),
      attachment_name: attachName,
      created_by: r.created_by_id ? Number(r.created_by_id) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  });
}

export async function fetchInvoicesDetailed(db: D1Database, whereSql: string, binds: unknown[]) {
  const rows = await db
    .prepare(
      `SELECT inv.*,
              p.patient_id AS patient_code,
              pu.first_name AS p_first, pu.last_name AS p_last, pu.username AS p_user, pu.phone AS patient_phone,
              t.token_code,
              b.bed_number, w.name AS ward_name
       FROM billing_invoices inv
       JOIN patients p ON p.id = inv.patient_id
       JOIN users pu ON pu.id = p.user_id
       LEFT JOIN opd_tokens t ON t.id = inv.token_id
       LEFT JOIN admissions adm ON adm.id = inv.admission_id
       LEFT JOIN beds b ON b.id = adm.bed_id
       LEFT JOIN wards w ON w.id = b.ward_id
       ${whereSql}
       ORDER BY inv.created_at DESC`
    )
    .bind(...binds)
    .all<Record<string, unknown>>();

  const itemRows = await db.prepare('SELECT * FROM billing_invoice_items ORDER BY id ASC').all<Record<string, unknown>>();
  const itemsByInv = new Map<number, Array<{
    id: number;
    description: string;
    category: string;
    category_display: string;
    quantity: number;
    unit_price: string;
    line_total: string;
  }>>();

  for (const ir of itemRows.results) {
    const invId = Number(ir.invoice_id);
    const list = itemsByInv.get(invId) ?? [];
    const cat = String(ir.category || 'other');
    list.push({
      id: Number(ir.id),
      description: String(ir.description),
      category: cat,
      category_display: displayLabel('invoiceCategory', cat),
      quantity: Number(ir.quantity || 1),
      unit_price: moneyStr(ir.unit_price as number),
      line_total: moneyStr(ir.line_total as number),
    });
    itemsByInv.set(invId, list);
  }

  return rows.results.map((r) => {
    const id = Number(r.id);
    const st = String(r.status || 'unpaid');
    return {
      id,
      invoice_number: String(r.invoice_number),
      patient: Number(r.patient_id),
      patient_name: fullName(r.p_first as string, r.p_last as string, r.p_user as string),
      patient_code: String(r.patient_code || `PAT-${String(r.patient_id).padStart(4, '0')}`),
      patient_phone: String(r.patient_phone || 'N/A'),
      token: r.token_id ? Number(r.token_id) : null,
      token_code: r.token_code ? String(r.token_code) : null,
      admission: r.admission_id ? Number(r.admission_id) : null,
      ward_info: r.ward_name && r.bed_number ? `${String(r.ward_name)} - Bed ${String(r.bed_number)}` : null,
      status: st,
      status_display: displayLabel('invoiceStatus', st),
      payment_method: r.payment_method ? String(r.payment_method) : null,
      subtotal: moneyStr(round2(Number(r.subtotal || 0))),
      tax_amount: moneyStr(round2(Number(r.tax_amount || 0))),
      discount_amount: moneyStr(round2(Number(r.discount_amount || 0))),
      total_amount: moneyStr(round2(Number(r.total_amount || 0))),
      notes: String(r.notes || ''),
      paid_at: r.paid_at ? String(r.paid_at) : null,
      items: itemsByInv.get(id) ?? [],
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
    };
  });
}
