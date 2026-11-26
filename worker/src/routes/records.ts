import { Hono } from 'hono';
import { requireAuth } from '../auth';
import { fetchMedicalRecordsDetailed } from '../serializers';
import { AppEnv, AuthUser, isAdminUser, nowIso, parseIntId, recordAuditLog } from '../utils';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'];

function bytesToBase64Chunked(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function checkRecordAccess(user: AuthUser, patientId: number, write = false): boolean {
  if (user.role === 'doctor' || isAdminUser(user)) return true;
  if (!write && user.role === 'patient' && user.patient_profile_id) {
    return patientId === user.patient_profile_id;
  }
  return false;
}

function parsePrescriptionItems(raw: unknown): { items: unknown[]; error?: string } {
  if (raw === undefined || raw === null || raw === '') return { items: [] };
  if (Array.isArray(raw)) return { items: raw };
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { items: [] };
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return { items: [], error: 'prescription_items must be a list of medication entries.' };
      return { items: parsed };
    } catch {
      return { items: [], error: 'prescription_items must be valid JSON array.' };
    }
  }
  return { items: [], error: 'prescription_items must be a list of medication entries.' };
}

async function parseRecordPayload(c: { req: { header: (n: string) => string | undefined; json: <T>() => Promise<T>; parseBody: () => Promise<Record<string, unknown>> } }) {
  const ct = (c.req.header('content-type') || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const fileVal = body.attachment;
    let fileMeta: { name: string; contentType: string; size: number; base64: string } | null = null;
    if (fileVal && typeof fileVal === 'object' && 'arrayBuffer' in fileVal) {
      const f = fileVal as File;
      const lowerName = (f.name || 'report.pdf').toLowerCase();
      const dotIdx = lowerName.lastIndexOf('.');
      const ext = dotIdx >= 0 ? lowerName.slice(dotIdx) : '';
      if (!ALLOWED_EXTS.includes(ext)) {
        return { error: { attachment: ['Only .pdf, .png, .jpg, .jpeg, and .txt files are allowed.'] } };
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        return { error: { attachment: ['Uploaded lab report exceeds the 5 MB safety limit.'] } };
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      fileMeta = {
        name: f.name || 'lab_report.pdf',
        contentType: f.type || 'application/octet-stream',
        size: bytes.byteLength,
        base64: bytesToBase64Chunked(bytes),
      };
    }
    return { fields: body, fileMeta };
  }
  const fields = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  return { fields, fileMeta: null };
}

export const recordsRoutes = new Hono<AppEnv>({ strict: false });

recordsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  const clauses: string[] = [];
  const binds: unknown[] = [];

  if (user.role === 'patient' && !isAdminUser(user)) {
    if (!user.patient_profile_id) return c.json([]);
    clauses.push('mr.patient_id = ?');
    binds.push(user.patient_profile_id);
  } else if (user.role !== 'doctor' && !isAdminUser(user)) {
    return c.json({ detail: 'Not authorized to access clinical records.' }, 403);
  } else {
    const patFilter = parseIntId(c.req.query('patient'));
    if (patFilter) {
      clauses.push('mr.patient_id = ?');
      binds.push(patFilter);
    }
  }

  const recordType = c.req.query('record_type');
  if (recordType) {
    clauses.push('mr.record_type = ?');
    binds.push(recordType);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return c.json(await fetchMedicalRecordsDetailed(c.env.DB, where, binds));
});

recordsRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (user.role !== 'doctor' && !isAdminUser(user)) {
    return c.json({ detail: 'Only doctors or administrators can create medical records.' }, 403);
  }

  const parsed = await parseRecordPayload(c);
  if ('error' in parsed) return c.json(parsed.error, 400);

  const { fields, fileMeta } = parsed;
  const patientId = parseIntId(fields.patient as string);
  const title = String(fields.title || '').trim();
  const recordType = String(fields.record_type || 'visit_note').trim();
  if (!patientId) return c.json({ patient: ['Patient ID is required.'] }, 400);
  if (!title) return c.json({ title: ['Title is required.'] }, 400);

  const rxParsed = parsePrescriptionItems(fields.prescription_items);
  if (rxParsed.error) return c.json({ prescription_items: [rxParsed.error] }, 400);

  const ts = nowIso();
  const res = await c.env.DB
    .prepare(
      `INSERT INTO medical_records
       (patient_id, doctor_id, token_id, admission_id, record_type, title, diagnosis, visit_notes, prescription_items, attachment_name, created_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      patientId,
      user.doctor_profile_id,
      parseIntId(fields.token as string),
      parseIntId(fields.admission as string),
      recordType,
      title,
      String(fields.diagnosis || ''),
      String(fields.visit_notes || ''),
      JSON.stringify(rxParsed.items),
      fileMeta ? fileMeta.name : null,
      user.id,
      ts,
      ts
    )
    .run();

  const recordId = Number(res.meta.last_row_id);
  if (fileMeta) {
    await c.env.DB
      .prepare('INSERT INTO medical_record_files (record_id, filename, content_type, size_bytes, data_base64) VALUES (?, ?, ?, ?, ?)')
      .bind(recordId, fileMeta.name, fileMeta.contentType, fileMeta.size, fileMeta.base64)
      .run();
  }

  await recordAuditLog(c, {
    action: 'CREATE',
    resource_type: 'MedicalRecord',
    resource_id: recordId,
    patient_id: patientId,
    details: `Created ${recordType}: ${title}`,
  });

  const [created] = await fetchMedicalRecordsDetailed(c.env.DB, 'WHERE mr.id = ?', [recordId]);
  return c.json(created, 201);
});

recordsRoutes.get('/:pk/download', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const rec = id ? await c.env.DB.prepare('SELECT id, patient_id FROM medical_records WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!rec) return c.json({ detail: 'Not found.' }, 404);

  if (!checkRecordAccess(user, Number(rec.patient_id), false)) {
    return c.json({ detail: "Access denied. You cannot download another patient's lab report." }, 403);
  }

  const fileRow = await c.env.DB.prepare('SELECT filename, content_type, data_base64 FROM medical_record_files WHERE record_id = ?').bind(id).first<Record<string, unknown>>();
  if (!fileRow) return c.json({ detail: 'No attachment found for this medical record.' }, 404);

  await recordAuditLog(c, {
    action: 'EXPORT',
    resource_type: 'LabReportDownload',
    resource_id: id!,
    patient_id: Number(rec.patient_id),
    details: `Downloaded attachment ${String(fileRow.filename)}`,
  });

  const bytes = base64ToBytes(String(fileRow.data_base64));
  const safeName = String(fileRow.filename || 'lab_report.pdf').replace(/["\r\n]/g, '');
  return new Response(bytes, {
    headers: {
      'Content-Type': String(fileRow.content_type || 'application/octet-stream'),
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
});

recordsRoutes.get('/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  if (!id) return c.json({ detail: 'Not found.' }, 404);
  const [rec] = await fetchMedicalRecordsDetailed(c.env.DB, 'WHERE mr.id = ?', [id]);
  if (!rec) return c.json({ detail: 'Not found.' }, 404);

  if (!checkRecordAccess(user, rec.patient, false)) {
    await recordAuditLog(c, {
      action: 'VIEW',
      resource_type: 'MedicalRecordDenied',
      resource_id: id,
      details: 'Blocked unauthorized access to medical record.',
    });
    return c.json({ detail: 'You do not have permission to access this medical record.' }, 403);
  }

  await recordAuditLog(c, {
    action: 'VIEW',
    resource_type: 'MedicalRecord',
    resource_id: id,
    patient_id: rec.patient,
    details: `Viewed ${rec.record_type} #${id}.`,
  });
  return c.json(rec);
});

recordsRoutes.put('/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT * FROM medical_records WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  if (!checkRecordAccess(user, Number(existing.patient_id), true)) {
    return c.json({ detail: 'You do not have permission to modify this medical record.' }, 403);
  }

  const parsed = await parseRecordPayload(c);
  if ('error' in parsed) return c.json(parsed.error, 400);
  const { fields, fileMeta } = parsed;

  let rxJson = String(existing.prescription_items || '[]');
  if (fields.prescription_items !== undefined) {
    const rxParsed = parsePrescriptionItems(fields.prescription_items);
    if (rxParsed.error) return c.json({ prescription_items: [rxParsed.error] }, 400);
    rxJson = JSON.stringify(rxParsed.items);
  }

  await c.env.DB
    .prepare(
      `UPDATE medical_records
       SET record_type = ?, title = ?, diagnosis = ?, visit_notes = ?, prescription_items = ?, attachment_name = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      fields.record_type !== undefined ? String(fields.record_type) : String(existing.record_type),
      fields.title !== undefined ? String(fields.title) : String(existing.title),
      fields.diagnosis !== undefined ? String(fields.diagnosis) : String(existing.diagnosis),
      fields.visit_notes !== undefined ? String(fields.visit_notes) : String(existing.visit_notes),
      rxJson,
      fileMeta ? fileMeta.name : (existing.attachment_name as string | null),
      nowIso(),
      id
    )
    .run();

  if (fileMeta) {
    await c.env.DB
      .prepare('INSERT OR REPLACE INTO medical_record_files (record_id, filename, content_type, size_bytes, data_base64) VALUES (?, ?, ?, ?, ?)')
      .bind(id, fileMeta.name, fileMeta.contentType, fileMeta.size, fileMeta.base64)
      .run();
  }

  await recordAuditLog(c, {
    action: 'UPDATE',
    resource_type: 'MedicalRecord',
    resource_id: id!,
    patient_id: Number(existing.patient_id),
    details: `Updated ${String(existing.record_type)} #${id}.`,
  });

  const [updated] = await fetchMedicalRecordsDetailed(c.env.DB, 'WHERE mr.id = ?', [id]);
  return c.json(updated);
});

recordsRoutes.patch('/:pk', requireAuth, async (c) => recordsRoutes.fetch(new Request(c.req.url, { method: 'PUT', headers: c.req.raw.headers, body: await c.req.raw.clone().arrayBuffer() }), c.env, c.executionCtx));

recordsRoutes.delete('/:pk', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = parseIntId(c.req.param('pk'));
  const existing = id ? await c.env.DB.prepare('SELECT id, patient_id, record_type, title FROM medical_records WHERE id = ?').bind(id).first<Record<string, unknown>>() : null;
  if (!existing) return c.json({ detail: 'Not found.' }, 404);
  if (!checkRecordAccess(user, Number(existing.patient_id), true)) {
    return c.json({ detail: 'You do not have permission to delete this medical record.' }, 403);
  }

  await recordAuditLog(c, {
    action: 'DELETE',
    resource_type: 'MedicalRecord',
    resource_id: id!,
    patient_id: Number(existing.patient_id),
    details: `Deleted ${String(existing.record_type)}: ${String(existing.title)}`,
  });
  await c.env.DB.prepare('DELETE FROM medical_records WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});
