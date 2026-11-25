"""
seed_demo_data.py
=================
SmartCare HMS - Synthetic Sandbox Demo Database Seeder.

SAFETY:
  - Refuses to seed in real non-demo production (DEMO_MODE=False) unless --force-demo is passed.
  - NEVER creates weak `admin / admin123` credentials on live deployments (ALLOW_DEMO_ADMIN=False).
  - Seeds all 4 non-admin demo roles cleanly: Patient, Doctor, Receptionist, Blood Bank Staff.
  - All records are 100% synthetic fake data for demonstration only.
"""

import os
from datetime import timedelta
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartcare.settings')
import django
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import Department, Doctor, DoctorFeedback, DoctorLeave, Patient
from apps.beds.models import Admission, Bed, Ward
from apps.billing.models import Invoice, InvoiceItem
from apps.bloodbank.models import BloodRequest, BloodStock, Donor
from apps.opd.models import Notification, Queue, Token
from apps.records.models import MedicalRecord

User = get_user_model()


def seed(force_demo=False, with_admin=False):
    if not getattr(settings, 'DEMO_MODE', False) and not force_demo:
        print("[ABORTED] DEMO_MODE is False. Refusing to seed synthetic demo accounts into a production database.")
        return

    print("=" * 60)
    print("SmartCare HMS Synthetic Sandbox Data Seeder")
    print("=" * 60)

    allow_admin = with_admin or getattr(settings, 'ALLOW_DEMO_ADMIN', False)
    superuser_pw = os.environ.get('DJANGO_SUPERUSER_PASSWORD', '').strip()

    # 1. Admin Safety Guard
    existing_admin = User.objects.filter(username='admin').first()
    if allow_admin:
        pw_to_set = superuser_pw or 'Admin@LocalDemo26'
        admin_user, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@smartcare.hospital',
                'first_name': 'Hospital',
                'last_name': 'Administrator',
                'role': 'admin',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password(pw_to_set)
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
        print(f"[{'CREATED' if created else 'UPDATED'}] Local Admin User: admin (local dev only)")
    else:
        if existing_admin and existing_admin.check_password('admin123'):
            existing_admin.set_unusable_password()
            existing_admin.is_active = False
            existing_admin.save()
            print("[SECURED] Disabled legacy default admin account in live/non-local mode.")
        elif superuser_pw:
            admin_user, _ = User.objects.get_or_create(
                username='admin',
                defaults={
                    'email': 'admin@smartcare.hospital',
                    'first_name': 'Hospital',
                    'last_name': 'Administrator',
                    'role': 'admin',
                    'is_staff': True,
                    'is_superuser': True,
                }
            )
            admin_user.set_password(superuser_pw)
            admin_user.is_active = True
            admin_user.save()
            print("[OK] Admin configured from DJANGO_SUPERUSER_PASSWORD env var.")
        else:
            print("[SAFE] Skipped creating public demo Admin login (ALLOW_DEMO_ADMIN=False).")

    # 2. Receptionist & Blood Bank Staff Sandbox Accounts
    reception_user, _ = User.objects.get_or_create(
        username='reception.desk',
        defaults={
            'email': 'reception@smartcare.hospital',
            'first_name': 'Meera',
            'last_name': 'Nair',
            'role': 'reception',
            'phone': '+91-9811100010',
        }
    )
    reception_user.role = 'reception'
    reception_user.set_password('Reception@Demo26')
    reception_user.save()

    bloodbank_user, _ = User.objects.get_or_create(
        username='bloodbank.staff',
        defaults={
            'email': 'bloodbank@smartcare.hospital',
            'first_name': 'Rohan',
            'last_name': 'Kulkarni',
            'role': 'bloodbank_staff',
            'phone': '+91-9811100020',
        }
    )
    bloodbank_user.role = 'bloodbank_staff'
    bloodbank_user.set_password('BloodBank@Demo26')
    bloodbank_user.save()
    print("[OK] Seeded Receptionist (reception.desk) & Blood Bank Officer (bloodbank.staff).")

    # 3. Departments
    departments_info = [
        ("Cardiology", "Heart health, ECG, Angiography and cardiovascular care"),
        ("Orthopedics", "Bone, joint, spine and sports injury treatment"),
        ("Pediatrics", "Infant, child and adolescent health and vaccination"),
        ("Neurology", "Brain, nerve, stroke and spine neurological disorder care"),
        ("General Medicine", "Comprehensive adult primary healthcare and outpatient consultations"),
    ]
    dept_objs = {}
    for name, desc in departments_info:
        dept, _ = Department.objects.get_or_create(
            name=name,
            defaults={'description': desc, 'is_active': True}
        )
        dept_objs[name] = dept

    # 4. 5 Doctors
    doctors_info = [
        ("dr.sharma", "Doctor@Demo26", "Rajesh", "Sharma", "dr.sharma@smartcare.hospital", "+91-9811122201", "Cardiology", "Senior Interventional Cardiologist", "Room 101", 15, Decimal('800.00')),
        ("dr.patel", "Doctor@Demo26", "Priya", "Patel", "dr.patel@smartcare.hospital", "+91-9811122202", "General Medicine", "Consultant Physician & Diabetologist", "Room 102", 10, Decimal('500.00')),
        ("dr.verma", "Doctor@Demo26", "Vikram", "Verma", "dr.verma@smartcare.hospital", "+91-9811122203", "Orthopedics", "Orthopedic & Joint Replacement Surgeon", "Room 201", 20, Decimal('700.00')),
        ("dr.gupta", "Doctor@Demo26", "Sneha", "Gupta", "dr.gupta@smartcare.hospital", "+91-9811122204", "Pediatrics", "Child Specialist & Pediatric Intensivist", "Room 202", 12, Decimal('600.00')),
        ("dr.iyer", "Doctor@Demo26", "Anand", "Iyer", "dr.iyer@smartcare.hospital", "+91-9811122205", "Neurology", "Consultant Neurologist & Stroke Specialist", "Room 301", 25, Decimal('900.00')),
    ]

    doctor_objs = []
    for uname, pw, fn, ln, email, phone, dept_name, spec, room, avg_m, fee in doctors_info:
        user, _ = User.objects.get_or_create(
            username=uname,
            defaults={'email': email, 'first_name': fn, 'last_name': ln, 'role': 'doctor', 'phone': phone}
        )
        user.set_password(pw)
        user.save()

        doc_profile, _ = Doctor.objects.get_or_create(
            user=user,
            defaults={
                'department': dept_objs[dept_name],
                'specialization': spec,
                'room_number': room,
                'avg_consult_minutes': avg_m,
                'consultation_fee': fee,
                'is_available': True,
            }
        )
        doctor_objs.append(doc_profile)

    # Upcoming leave sample on Dr. Iyer (+5 days from today)
    today = timezone.now().date()
    DoctorLeave.objects.get_or_create(
        doctor=doctor_objs[4],
        start_date=today + timedelta(days=5),
        end_date=today + timedelta(days=6),
        defaults={'reason': 'National Neurology Conference (CME)', 'is_approved': True}
    )

    # 5. Registered Synthetic Patients
    patients_info = [
        ("rahul.kumar", "Patient@Demo26", "Rahul", "Kumar", "rahul.kumar@example.com", "+91-9822233301", "PAT-0001", "M", "B+"),
        ("patient1", "Patient@Demo26", "Rohan", "Sharma", "patient1@smartcare.hospital", "+91-9822233305", "PAT-0005", "M", "B+"),
        ("patient2", "Patient@Demo26", "Anjali", "Singh", "anjali.singh@example.com", "+91-9822233302", "PAT-0002", "F", "O+"),
        ("patient3", "Patient@Demo26", "Amit", "Joshi", "amit.joshi@example.com", "+91-9822233303", "PAT-0003", "M", "A+"),
        ("patient4", "Patient@Demo26", "Pooja", "Desai", "pooja.desai@example.com", "+91-9822233304", "PAT-0004", "F", "AB-"),
    ]

    patient_objs = []
    for uname, pw, fn, ln, email, phone, pid, gender, bg in patients_info:
        user, _ = User.objects.get_or_create(
            username=uname,
            defaults={'email': email, 'first_name': fn, 'last_name': ln, 'role': 'patient', 'phone': phone}
        )
        user.set_password(pw)
        user.save()

        pat_profile = Patient.objects.filter(user=user).first()
        if not pat_profile:
            use_pid = pid if not Patient.objects.filter(patient_id=pid).exists() else f"PAT-{user.id:04d}"
            pat_profile = Patient.objects.create(
                user=user,
                patient_id=use_pid,
                gender=gender,
                blood_group=bg,
                address='Synthetic Demo Colony, Sector 4 (Fake Test Record)',
                emergency_contact_name='Demo Contact',
                emergency_contact_phone='+91-9999888877',
            )
        patient_objs.append(pat_profile)

    # 6. 20 Beds Across 4 Wards
    wards_setup = [
        ("General Ward A", "general", 1, "GEN", dept_objs["General Medicine"], ['available', 'available', 'occupied', 'occupied', 'available', 'cleaning', 'occupied', 'available']),
        ("Intensive Care Unit (ICU)", "icu", 2, "ICU", dept_objs["Cardiology"], ['occupied', 'available', 'occupied', 'cleaning']),
        ("Private Deluxe Wing", "private", 3, "PVT", dept_objs["Cardiology"], ['available', 'occupied', 'available', 'occupied', 'available']),
        ("Emergency Casualty Ward", "emergency", 1, "EMG", dept_objs["General Medicine"], ['available', 'occupied', 'available']),
    ]

    for w_name, w_type, floor, prefix, dept, statuses in wards_setup:
        ward_obj, _ = Ward.objects.get_or_create(
            name=w_name,
            defaults={'ward_type': w_type, 'floor_number': floor, 'total_beds': len(statuses), 'department': dept, 'is_active': True}
        )
        for idx, st in enumerate(statuses, start=1):
            bed_num = f"{prefix}-{idx:02d}"
            bed, _ = Bed.objects.get_or_create(
                ward=ward_obj,
                bed_number=bed_num,
                defaults={
                    'status': st,
                    'has_oxygen': w_type in ['icu', 'emergency', 'private'],
                    'has_ventilator': w_type == 'icu',
                    'has_monitor': w_type in ['icu', 'emergency'],
                }
            )
            bed.status = st
            bed.save()

    # 7. Blood Stock for All 8 Blood Groups
    expiry_default = today + timedelta(days=35)
    expiry_soon = today + timedelta(days=12)
    blood_stock_distribution = [
        ("A+", 8, expiry_default), ("A-", 2, expiry_soon),
        ("B+", 12, expiry_default), ("B-", 1, expiry_soon),
        ("O+", 15, expiry_default), ("O-", 2, expiry_soon),
        ("AB+", 6, expiry_default), ("AB-", 1, expiry_soon),
    ]
    for grp, units, exp in blood_stock_distribution:
        stock, _ = BloodStock.objects.get_or_create(
            blood_group=grp,
            defaults={'units_available': units, 'minimum_threshold': 3, 'expiry_date': exp}
        )
        stock.units_available = units
        stock.expiry_date = exp
        stock.save()

    # 8. 10 Registered Synthetic Blood Donors
    donors_info = [
        ("Ramesh Nair", "B+", "+91-9876543210", "Mumbai", 45),
        ("Sunita Rao", "O+", "+91-9876543211", "Delhi", 90),
        ("Karan Mehta", "A+", "+91-9876543212", "Pune", 30),
        ("Deepa Menon", "O-", "+91-9876543213", "Bangalore", 120),
        ("Suresh Reddy", "AB+", "+91-9876543214", "Hyderabad", 60),
        ("Neha Kapoor", "B-", "+91-9876543215", "Jaipur", 15),
        ("Manoj Tiwari", "A-", "+91-9876543216", "Ahmedabad", 110),
        ("Kavita Das", "AB-", "+91-9876543217", "Kolkata", 80),
        ("Alok Saxena", "O+", "+91-9876543218", "Lucknow", 50),
        ("Divya Pillai", "B+", "+91-9876543219", "Chennai", 70),
    ]
    for name, bg, phone, city, days_ago in donors_info:
        Donor.objects.get_or_create(
            phone=phone,
            defaults={
                'name': name, 'blood_group': bg, 'city': city, 'age': 28,
                'gender': 'M' if name.endswith(('Nair', 'Mehta', 'Reddy', 'Tiwari', 'Saxena')) else 'F',
                'last_donation_date': today - timedelta(days=days_ago),
                'address': f"{city} Synthetic District",
            }
        )

    # 9. Sample OPD Tokens, Notifications, Medical Record, Feedback & Invoice
    doc_sharma = doctor_objs[0]
    doc_patel = doctor_objs[1]
    tokens_spec = [
        (patient_objs[0], doc_sharma, 1, 'completed', 'normal', 'Routine cardiac wellness follow-up'),
        (patient_objs[1], doc_sharma, 2, 'called', 'emergency', 'Acute chest pain radiating to left arm'),
        (patient_objs[2], doc_sharma, 3, 'waiting', 'normal', 'Post-checkup review'),
        (patient_objs[3], doc_sharma, 4, 'waiting', 'senior_citizen', 'High blood pressure checkup'),
        (patient_objs[2], doc_patel, 1, 'called', 'normal', 'Seasonal viral fever'),
        (patient_objs[3], doc_patel, 2, 'waiting', 'normal', 'Digestive acidity checkup'),
    ]

    seeded_tokens = []
    for pat, doc, num, stat, prio, symp in tokens_spec:
        prefix = doc.department.name[:3].upper() if doc.department else 'MED'
        tok, _ = Token.objects.get_or_create(
            doctor=doc, appointment_date=today, token_number=num,
            defaults={'patient': pat, 'department': doc.department, 'token_code': f"{prefix}-{num:03d}", 'status': stat, 'priority': prio, 'symptoms': symp}
        )
        seeded_tokens.append(tok)

    Queue.objects.update_or_create(
        doctor=doc_sharma, queue_date=today,
        defaults={'current_token': 2, 'total_tokens': 4, 'avg_consult_minutes': doc_sharma.avg_consult_minutes, 'is_active': True}
    )
    Queue.objects.update_or_create(
        doctor=doc_patel, queue_date=today,
        defaults={'current_token': 1, 'total_tokens': 2, 'avg_consult_minutes': doc_patel.avg_consult_minutes, 'is_active': True}
    )

    # Admissions
    gen_occupied_bed = Bed.objects.filter(ward__name="General Ward A", status='occupied').first()
    adm1 = None
    if gen_occupied_bed:
        adm1, _ = Admission.objects.get_or_create(
            bed=gen_occupied_bed, patient=patient_objs[0],
            defaults={'attending_doctor': doc_sharma, 'diagnosis': 'Synthetic Demo Observation', 'status': 'admitted'}
        )

    icu_occupied_bed = Bed.objects.filter(ward__name="Intensive Care Unit (ICU)", status='occupied').first()
    if icu_occupied_bed:
        Admission.objects.get_or_create(
            bed=icu_occupied_bed, patient=patient_objs[1],
            defaults={'attending_doctor': doc_sharma, 'diagnosis': 'Synthetic ICU Cardiac Monitoring', 'status': 'admitted'}
        )

    # Blood Requests
    BloodRequest.objects.get_or_create(
        patient=patient_objs[0], blood_group="B+", units_required=2,
        defaults={'patient_name': 'Rahul Kumar', 'hospital_ward': 'General Ward A (Bed GEN-03)', 'priority': 'urgent', 'purpose': 'surgery', 'status': 'pending', 'required_by_date': today + timedelta(days=2)}
    )

    # Medical Record & Prescription for Rahul Kumar
    MedicalRecord.objects.get_or_create(
        patient=patient_objs[0], title='Cardiology Consultation Prescription',
        defaults={
            'doctor': doc_sharma,
            'token': seeded_tokens[0],
            'record_type': 'prescription',
            'diagnosis': 'Mild Essential Hypertension (Synthetic Sample)',
            'visit_notes': 'Blood pressure 138/86 mmHg. Advised low-sodium diet and morning walk.',
            'prescription_items': [
                {'medicine': 'Amlodipine 5mg', 'dosage': '1 Tablet', 'frequency': 'Once daily (Morning)', 'duration': '30 days'},
                {'medicine': 'Atorvastatin 10mg', 'dosage': '1 Tablet', 'frequency': 'Once daily (Night)', 'duration': '30 days'},
            ],
        }
    )

    # Sample Billing Invoice for Rahul Kumar
    inv, inv_created = Invoice.objects.get_or_create(
        patient=patient_objs[0], token=seeded_tokens[0],
        defaults={'admission': adm1, 'status': 'unpaid', 'notes': 'Sample OPD + General Ward Bill'}
    )
    if inv_created:
        InvoiceItem.objects.create(invoice=inv, description='OPD Consultation — Dr. Rajesh Sharma', category='opd_fee', quantity=1, unit_price=Decimal('800.00'))
        InvoiceItem.objects.create(invoice=inv, description='General Ward Bed Charge (1 Day)', category='ward_charge', quantity=1, unit_price=Decimal('1500.00'))
        inv.recalculate_totals()

    # Sample Feedback & Notification
    if seeded_tokens:
        DoctorFeedback.objects.get_or_create(
            token=seeded_tokens[0],
            defaults={'doctor': doc_sharma, 'patient': patient_objs[0], 'rating': 5, 'comment': 'Very attentive consultation and zero wait confusion.'}
        )
        Notification.objects.get_or_create(
            token=seeded_tokens[2], channel='in_app',
            defaults={
                'patient': patient_objs[2],
                'recipient_phone': patient_objs[2].user.phone or '',
                'title': f'Queue Alert: Token {seeded_tokens[2].token_code} is #1 in line',
                'message': 'You are next in line for Dr. Rajesh Sharma (Room 101).',
                'status': 'sent',
            }
        )

    print("[OK] Synthetic sandbox seeded cleanly (Non-Admin Roles Ready).")


if __name__ == '__main__':
    import sys
    seed(
        force_demo='--force-demo' in sys.argv,
        with_admin='--with-admin' in sys.argv,
    )
