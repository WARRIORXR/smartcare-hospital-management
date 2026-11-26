-- SmartCare HMS Synthetic Sandbox Seed Data (mirrors seed_demo_data.py)

INSERT OR IGNORE INTO users (id, username, email, password_hash, first_name, last_name, role, phone, is_staff, is_superuser, is_active) VALUES
  (1, 'reception.desk', 'reception@smartcare.hospital', 'pbkdf2_sha256$100000$Uqsy1zDKYqRG23r18DSEjQ==$IyyPIBMD3O4F5GTZkpV2lVksGQX6zNi/fA5Z/uGphBU=', 'Meera', 'Nair', 'reception', '+91-9811100010', 0, 0, 1),
  (2, 'bloodbank.staff', 'bloodbank@smartcare.hospital', 'pbkdf2_sha256$100000$82OZYCdPfUzxZKtOFbuLtg==$RI7unIRBS4ToMBHSaFeYRClr6r4/H0P6NNpdxvz+imI=', 'Rohan', 'Kulkarni', 'bloodbank_staff', '+91-9811100020', 0, 0, 1),
  (3, 'dr.sharma', 'dr.sharma@smartcare.hospital', 'pbkdf2_sha256$100000$BgncHMRjGHETMpyiCFtbrg==$KJFzUzi0nCVGRnKwRUq+R9mnxkAodHktlR/Ik6c5QKg=', 'Rajesh', 'Sharma', 'doctor', '+91-9811122201', 0, 0, 1),
  (4, 'dr.patel', 'dr.patel@smartcare.hospital', 'pbkdf2_sha256$100000$BgncHMRjGHETMpyiCFtbrg==$KJFzUzi0nCVGRnKwRUq+R9mnxkAodHktlR/Ik6c5QKg=', 'Priya', 'Patel', 'doctor', '+91-9811122202', 0, 0, 1),
  (5, 'dr.verma', 'dr.verma@smartcare.hospital', 'pbkdf2_sha256$100000$BgncHMRjGHETMpyiCFtbrg==$KJFzUzi0nCVGRnKwRUq+R9mnxkAodHktlR/Ik6c5QKg=', 'Vikram', 'Verma', 'doctor', '+91-9811122203', 0, 0, 1),
  (6, 'dr.gupta', 'dr.gupta@smartcare.hospital', 'pbkdf2_sha256$100000$BgncHMRjGHETMpyiCFtbrg==$KJFzUzi0nCVGRnKwRUq+R9mnxkAodHktlR/Ik6c5QKg=', 'Sneha', 'Gupta', 'doctor', '+91-9811122204', 0, 0, 1),
  (7, 'dr.iyer', 'dr.iyer@smartcare.hospital', 'pbkdf2_sha256$100000$BgncHMRjGHETMpyiCFtbrg==$KJFzUzi0nCVGRnKwRUq+R9mnxkAodHktlR/Ik6c5QKg=', 'Anand', 'Iyer', 'doctor', '+91-9811122205', 0, 0, 1),
  (8, 'rahul.kumar', 'rahul.kumar@example.com', 'pbkdf2_sha256$100000$thlbkzXRx8wCGVvYni8JwQ==$Zp0UiV6mvxyXbR+/T7Vou2ijzTTCCMM3+VPLlimBOiw=', 'Rahul', 'Kumar', 'patient', '+91-9822233301', 0, 0, 1),
  (9, 'patient1', 'patient1@smartcare.hospital', 'pbkdf2_sha256$100000$thlbkzXRx8wCGVvYni8JwQ==$Zp0UiV6mvxyXbR+/T7Vou2ijzTTCCMM3+VPLlimBOiw=', 'Rohan', 'Sharma', 'patient', '+91-9822233305', 0, 0, 1),
  (10, 'patient2', 'anjali.singh@example.com', 'pbkdf2_sha256$100000$thlbkzXRx8wCGVvYni8JwQ==$Zp0UiV6mvxyXbR+/T7Vou2ijzTTCCMM3+VPLlimBOiw=', 'Anjali', 'Singh', 'patient', '+91-9822233302', 0, 0, 1),
  (11, 'patient3', 'amit.joshi@example.com', 'pbkdf2_sha256$100000$thlbkzXRx8wCGVvYni8JwQ==$Zp0UiV6mvxyXbR+/T7Vou2ijzTTCCMM3+VPLlimBOiw=', 'Amit', 'Joshi', 'patient', '+91-9822233303', 0, 0, 1),
  (12, 'patient4', 'pooja.desai@example.com', 'pbkdf2_sha256$100000$thlbkzXRx8wCGVvYni8JwQ==$Zp0UiV6mvxyXbR+/T7Vou2ijzTTCCMM3+VPLlimBOiw=', 'Pooja', 'Desai', 'patient', '+91-9822233304', 0, 0, 1);

INSERT OR IGNORE INTO departments (id, name, description, is_active) VALUES
  (1, 'Cardiology', 'Heart health, ECG, Angiography and cardiovascular care', 1),
  (2, 'Orthopedics', 'Bone, joint, spine and sports injury treatment', 1),
  (3, 'Pediatrics', 'Infant, child and adolescent health and vaccination', 1),
  (4, 'Neurology', 'Brain, nerve, stroke and spine neurological disorder care', 1),
  (5, 'General Medicine', 'Comprehensive adult primary healthcare and outpatient consultations', 1);

INSERT OR IGNORE INTO doctors (id, user_id, department_id, specialization, qualification, experience_years, consultation_fee, room_number, avg_consult_minutes, available_days, is_available) VALUES
  (1, 3, 1, 'Senior Interventional Cardiologist', 'MBBS, MD, DM (Cardiology)', 14, 800.00, 'Room 101', 15, 'Mon-Sat', 1),
  (2, 4, 5, 'Consultant Physician & Diabetologist', 'MBBS, MD (Medicine)', 9, 500.00, 'Room 102', 10, 'Mon-Sat', 1),
  (3, 5, 2, 'Orthopedic & Joint Replacement Surgeon', 'MBBS, MS (Ortho)', 12, 700.00, 'Room 201', 20, 'Mon-Sat', 1),
  (4, 6, 3, 'Child Specialist & Pediatric Intensivist', 'MBBS, MD (Pediatrics)', 8, 600.00, 'Room 202', 12, 'Mon-Sat', 1),
  (5, 7, 4, 'Consultant Neurologist & Stroke Specialist', 'MBBS, DM (Neurology)', 11, 900.00, 'Room 301', 25, 'Mon-Sat', 1);

INSERT OR IGNORE INTO doctor_leaves (id, doctor_id, start_date, end_date, reason, is_approved) VALUES
  (1, 5, date('now', '+330 minutes', '+5 days'), date('now', '+330 minutes', '+6 days'), 'National Neurology Conference (CME)', 1);

INSERT OR IGNORE INTO patients (id, user_id, patient_id, gender, blood_group, address, emergency_contact_name, emergency_contact_phone) VALUES
  (1, 8, 'PAT-0001', 'M', 'B+', 'Synthetic Demo Colony, Sector 4 (Fake Test Record)', 'Demo Contact', '+91-9999888877'),
  (2, 9, 'PAT-0005', 'M', 'B+', 'Synthetic Demo Colony, Sector 4 (Fake Test Record)', 'Demo Contact', '+91-9999888877'),
  (3, 10, 'PAT-0002', 'F', 'O+', 'Synthetic Demo Colony, Sector 4 (Fake Test Record)', 'Demo Contact', '+91-9999888877'),
  (4, 11, 'PAT-0003', 'M', 'A+', 'Synthetic Demo Colony, Sector 4 (Fake Test Record)', 'Demo Contact', '+91-9999888877'),
  (5, 12, 'PAT-0004', 'F', 'AB-', 'Synthetic Demo Colony, Sector 4 (Fake Test Record)', 'Demo Contact', '+91-9999888877');

INSERT OR IGNORE INTO wards (id, name, ward_type, department_id, total_beds, floor_number, is_active) VALUES
  (1, 'General Ward A', 'general', 5, 8, 1, 1),
  (2, 'Intensive Care Unit (ICU)', 'icu', 1, 4, 2, 1),
  (3, 'Private Deluxe Wing', 'private', 1, 5, 3, 1),
  (4, 'Emergency Casualty Ward', 'emergency', 5, 3, 1, 1);

INSERT OR IGNORE INTO beds (id, ward_id, bed_number, status, has_oxygen, has_ventilator, has_monitor) VALUES
  (1, 1, 'GEN-01', 'available', 0, 0, 0),
  (2, 1, 'GEN-02', 'available', 0, 0, 0),
  (3, 1, 'GEN-03', 'occupied', 0, 0, 0),
  (4, 1, 'GEN-04', 'occupied', 0, 0, 0),
  (5, 1, 'GEN-05', 'available', 0, 0, 0),
  (6, 1, 'GEN-06', 'cleaning', 0, 0, 0),
  (7, 1, 'GEN-07', 'occupied', 0, 0, 0),
  (8, 1, 'GEN-08', 'available', 0, 0, 0),
  (9, 2, 'ICU-01', 'occupied', 1, 1, 1),
  (10, 2, 'ICU-02', 'available', 1, 1, 1),
  (11, 2, 'ICU-03', 'occupied', 1, 1, 1),
  (12, 2, 'ICU-04', 'cleaning', 1, 1, 1),
  (13, 3, 'PVT-01', 'available', 1, 0, 0),
  (14, 3, 'PVT-02', 'occupied', 1, 0, 0),
  (15, 3, 'PVT-03', 'available', 1, 0, 0),
  (16, 3, 'PVT-04', 'occupied', 1, 0, 0),
  (17, 3, 'PVT-05', 'available', 1, 0, 0),
  (18, 4, 'EMG-01', 'available', 1, 0, 1),
  (19, 4, 'EMG-02', 'occupied', 1, 0, 1),
  (20, 4, 'EMG-03', 'available', 1, 0, 1);

INSERT OR IGNORE INTO blood_stock (id, blood_group, units_available, units_reserved, minimum_threshold, expiry_date) VALUES
  (1, 'A+', 8, 0, 3, date('now', '+330 minutes', '+35 days')),
  (2, 'A-', 2, 0, 3, date('now', '+330 minutes', '+12 days')),
  (3, 'B+', 12, 0, 3, date('now', '+330 minutes', '+35 days')),
  (4, 'B-', 1, 0, 3, date('now', '+330 minutes', '+12 days')),
  (5, 'O+', 15, 0, 3, date('now', '+330 minutes', '+35 days')),
  (6, 'O-', 2, 0, 3, date('now', '+330 minutes', '+12 days')),
  (7, 'AB+', 6, 0, 3, date('now', '+330 minutes', '+35 days')),
  (8, 'AB-', 1, 0, 3, date('now', '+330 minutes', '+12 days'));

INSERT OR IGNORE INTO blood_batches (id, blood_group, units, batch_number, donor_name, collection_date, expiry_date, recorded_by_id, is_disposed, notes) VALUES
  (1, 'O+', 5, 'BB-OP-SEED-01', 'Sunita Rao', date('now', '+330 minutes', '-5 days'), date('now', '+330 minutes', '+35 days'), 2, 0, 'Standard screened batch'),
  (2, 'B+', 4, 'BB-BP-SEED-02', 'Ramesh Nair', date('now', '+330 minutes', '-4 days'), date('now', '+330 minutes', '+35 days'), 2, 0, 'Verified ELISA negative'),
  (3, 'O-', 2, 'BB-ON-SEED-03', 'Deepa Menon', date('now', '+330 minutes', '-20 days'), date('now', '+330 minutes', '+12 days'), 2, 0, 'Critical universal donor stock');

INSERT OR IGNORE INTO donors (id, name, blood_group, phone, city, age, gender, address, last_donation_date, is_eligible) VALUES
  (1, 'Ramesh Nair', 'B+', '+91-9876543210', 'Mumbai', 28, 'M', 'Mumbai Synthetic District', date('now', '+330 minutes', '-45 days'), 1),
  (2, 'Sunita Rao', 'O+', '+91-9876543211', 'Delhi', 28, 'F', 'Delhi Synthetic District', date('now', '+330 minutes', '-90 days'), 1),
  (3, 'Karan Mehta', 'A+', '+91-9876543212', 'Pune', 28, 'M', 'Pune Synthetic District', date('now', '+330 minutes', '-30 days'), 1),
  (4, 'Deepa Menon', 'O-', '+91-9876543213', 'Bangalore', 28, 'F', 'Bangalore Synthetic District', date('now', '+330 minutes', '-120 days'), 1),
  (5, 'Suresh Reddy', 'AB+', '+91-9876543214', 'Hyderabad', 28, 'M', 'Hyderabad Synthetic District', date('now', '+330 minutes', '-60 days'), 1),
  (6, 'Neha Kapoor', 'B-', '+91-9876543215', 'Jaipur', 28, 'F', 'Jaipur Synthetic District', date('now', '+330 minutes', '-15 days'), 1),
  (7, 'Manoj Tiwari', 'A-', '+91-9876543216', 'Ahmedabad', 28, 'M', 'Ahmedabad Synthetic District', date('now', '+330 minutes', '-110 days'), 1),
  (8, 'Kavita Das', 'AB-', '+91-9876543217', 'Kolkata', 28, 'F', 'Kolkata Synthetic District', date('now', '+330 minutes', '-80 days'), 1),
  (9, 'Alok Saxena', 'O+', '+91-9876543218', 'Lucknow', 28, 'M', 'Lucknow Synthetic District', date('now', '+330 minutes', '-50 days'), 1),
  (10, 'Divya Pillai', 'B+', '+91-9876543219', 'Chennai', 28, 'F', 'Chennai Synthetic District', date('now', '+330 minutes', '-70 days'), 1);

INSERT OR IGNORE INTO opd_tokens (id, patient_id, doctor_id, department_id, token_number, token_code, appointment_date, time_slot, is_advance_booking, status, priority, symptoms, is_emergency) VALUES
  (1, 1, 1, 1, 1, 'CAR-001', date('now', '+330 minutes'), '', 0, 'completed', 'normal', 'Routine cardiac wellness follow-up', 0),
  (2, 2, 1, 1, 2, 'CAR-002', date('now', '+330 minutes'), '', 0, 'called', 'emergency', 'Acute chest pain radiating to left arm', 1),
  (3, 3, 1, 1, 3, 'CAR-003', date('now', '+330 minutes'), '', 0, 'waiting', 'normal', 'Post-checkup review', 0),
  (4, 4, 1, 1, 4, 'CAR-004', date('now', '+330 minutes'), '', 0, 'waiting', 'senior_citizen', 'High blood pressure checkup', 0),
  (5, 3, 2, 5, 1, 'GEN-001', date('now', '+330 minutes'), '', 0, 'called', 'normal', 'Seasonal viral fever', 0),
  (6, 4, 2, 5, 2, 'GEN-002', date('now', '+330 minutes'), '', 0, 'waiting', 'normal', 'Digestive acidity checkup', 0);

INSERT OR IGNORE INTO opd_queues (id, doctor_id, queue_date, current_token, total_tokens, avg_consult_minutes, is_active) VALUES
  (1, 1, date('now', '+330 minutes'), 2, 4, 15, 1),
  (2, 2, date('now', '+330 minutes'), 1, 2, 10, 1);

INSERT OR IGNORE INTO admissions (id, patient_id, bed_id, attending_doctor_id, token_id, diagnosis, status) VALUES
  (1, 1, 3, 1, NULL, 'Synthetic Demo Observation', 'admitted'),
  (2, 2, 9, 1, NULL, 'Synthetic ICU Cardiac Monitoring', 'admitted');

INSERT OR IGNORE INTO blood_requests (id, patient_id, patient_name, hospital_ward, requested_by_id, blood_group, units_required, units_provided, purpose, priority, status, required_by_date) VALUES
  (1, 1, 'Rahul Kumar', 'General Ward A (Bed GEN-03)', 3, 'B+', 2, 0, 'surgery', 'urgent', 'pending', date('now', '+330 minutes', '+2 days'));

INSERT OR IGNORE INTO medical_records (id, patient_id, doctor_id, token_id, record_type, title, diagnosis, visit_notes, prescription_items, created_by_id) VALUES
  (1, 1, 1, 1, 'prescription', 'Cardiology Consultation Prescription', 'Mild Essential Hypertension (Synthetic Sample)', 'Blood pressure 138/86 mmHg. Advised low-sodium diet and morning walk.', '[{"medicine":"Amlodipine 5mg","dosage":"1 Tablet","frequency":"Once daily (Morning)","duration":"30 days"},{"medicine":"Atorvastatin 10mg","dosage":"1 Tablet","frequency":"Once daily (Night)","duration":"30 days"}]', 3);

INSERT OR IGNORE INTO billing_invoices (id, invoice_number, patient_id, token_id, admission_id, created_by_id, status, subtotal, tax_amount, discount_amount, total_amount, notes) VALUES
  (1, 'INV-20261127-0001', 1, 1, 1, 1, 'unpaid', 2300.00, 0.00, 0.00, 2300.00, 'Sample OPD + General Ward Bill');

INSERT OR IGNORE INTO billing_invoice_items (id, invoice_id, description, category, quantity, unit_price, line_total) VALUES
  (1, 1, 'OPD Consultation — Dr. Rajesh Sharma', 'opd_fee', 1, 800.00, 800.00),
  (2, 1, 'General Ward Bed Charge (1 Day)', 'ward_charge', 1, 1500.00, 1500.00);

INSERT OR IGNORE INTO doctor_feedbacks (id, doctor_id, patient_id, token_id, rating, comment) VALUES
  (1, 1, 1, 1, 5, 'Very attentive consultation and zero wait confusion.');

INSERT OR IGNORE INTO opd_notifications (id, patient_id, token_id, channel, trigger_event, recipient_phone, title, message, status, is_read) VALUES
  (1, 3, 3, 'in_app', 'queue_proximity', '+91-9822233302', 'Queue Alert: Token CAR-003 is #1 in line', 'You are next in line for Dr. Rajesh Sharma (Room 101).', 'sent', 0);
