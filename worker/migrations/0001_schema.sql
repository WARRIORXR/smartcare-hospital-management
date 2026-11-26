-- SmartCare HMS D1 Schema Migration (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'patient',
  phone TEXT NOT NULL DEFAULT '',
  is_staff INTEGER NOT NULL DEFAULT 0,
  is_superuser INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  date_joined TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS token_blacklist (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  specialization TEXT NOT NULL DEFAULT '',
  qualification TEXT NOT NULL DEFAULT 'MBBS, MD',
  experience_years INTEGER NOT NULL DEFAULT 5,
  consultation_fee REAL NOT NULL DEFAULT 500.0,
  room_number TEXT NOT NULL DEFAULT 'Room 101',
  avg_consult_minutes INTEGER NOT NULL DEFAULT 15,
  available_days TEXT NOT NULL DEFAULT 'Mon-Sat',
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS doctor_leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  is_approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT UNIQUE,
  date_of_birth TEXT,
  gender TEXT NOT NULL DEFAULT '',
  blood_group TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS opd_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  token_number INTEGER NOT NULL,
  token_code TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  time_slot TEXT NOT NULL DEFAULT '',
  is_advance_booking INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  priority TEXT NOT NULL DEFAULT 'normal',
  symptoms TEXT NOT NULL DEFAULT '',
  is_emergency INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(doctor_id, appointment_date, token_number)
);
CREATE INDEX IF NOT EXISTS idx_opd_tokens_doc_date_status ON opd_tokens(doctor_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_opd_tokens_patient ON opd_tokens(patient_id);

CREATE TABLE IF NOT EXISTS doctor_feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_id INTEGER UNIQUE REFERENCES opd_tokens(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS opd_queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  queue_date TEXT NOT NULL,
  current_token INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  avg_consult_minutes INTEGER NOT NULL DEFAULT 15,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(doctor_id, queue_date)
);

CREATE TABLE IF NOT EXISTS opd_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_id INTEGER REFERENCES opd_tokens(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'in_app',
  trigger_event TEXT NOT NULL DEFAULT 'queue_proximity',
  recipient_phone TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_opd_notif_patient ON opd_notifications(patient_id, is_read);

CREATE TABLE IF NOT EXISTS wards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  ward_type TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  total_beds INTEGER NOT NULL DEFAULT 0,
  floor_number INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_id INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  has_oxygen INTEGER NOT NULL DEFAULT 1,
  has_ventilator INTEGER NOT NULL DEFAULT 0,
  has_monitor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(ward_id, bed_number)
);
CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);

CREATE TABLE IF NOT EXISTS admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
  attending_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  token_id INTEGER REFERENCES opd_tokens(id) ON DELETE SET NULL,
  diagnosis TEXT NOT NULL DEFAULT '',
  admission_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  discharge_date TEXT,
  status TEXT NOT NULL DEFAULT 'admitted',
  discharge_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status, bed_id);

CREATE TABLE IF NOT EXISTS blood_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blood_group TEXT NOT NULL UNIQUE,
  units_available INTEGER NOT NULL DEFAULT 0,
  units_reserved INTEGER NOT NULL DEFAULT 0,
  minimum_threshold INTEGER NOT NULL DEFAULT 3,
  expiry_date TEXT,
  last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS blood_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blood_group TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  batch_number TEXT NOT NULL UNIQUE,
  donor_name TEXT NOT NULL DEFAULT '',
  collection_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  recorded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_disposed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 28,
  gender TEXT NOT NULL DEFAULT 'M',
  address TEXT NOT NULL DEFAULT '',
  last_donation_date TEXT,
  is_eligible INTEGER NOT NULL DEFAULT 1,
  recorded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_donors_bg ON donors(blood_group, is_eligible);

CREATE TABLE IF NOT EXISTS blood_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL DEFAULT '',
  hospital_ward TEXT NOT NULL DEFAULT '',
  requested_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  blood_group TEXT NOT NULL,
  units_required INTEGER NOT NULL DEFAULT 1,
  units_provided INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  required_by_date TEXT,
  reviewed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS medical_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  token_id INTEGER REFERENCES opd_tokens(id) ON DELETE SET NULL,
  admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
  record_type TEXT NOT NULL DEFAULT 'visit_note',
  title TEXT NOT NULL,
  diagnosis TEXT NOT NULL DEFAULT '',
  visit_notes TEXT NOT NULL DEFAULT '',
  prescription_items TEXT NOT NULL DEFAULT '[]',
  attachment_name TEXT,
  created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS medical_record_files (
  record_id INTEGER PRIMARY KEY REFERENCES medical_records(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_base64 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token_id INTEGER REFERENCES opd_tokens(id) ON DELETE SET NULL,
  admission_id INTEGER REFERENCES admissions(id) ON DELETE SET NULL,
  created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  subtotal REAL NOT NULL DEFAULT 0.0,
  tax_amount REAL NOT NULL DEFAULT 0.0,
  discount_amount REAL NOT NULL DEFAULT 0.0,
  total_amount REAL NOT NULL DEFAULT 0.0,
  notes TEXT NOT NULL DEFAULT '',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS billing_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0.0,
  line_total REAL NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT NOT NULL DEFAULT 'anonymous',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'VIEW',
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  ip_address TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
