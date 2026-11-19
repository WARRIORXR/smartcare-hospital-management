"""
seed_demo_data.py
=================
SmartCare HMS - Comprehensive Demo Database Seeder.

Creates:
  1. Hospital Administrator (admin / admin123)
  2. 5 Departments (Cardiology, Orthopedics, Pediatrics, Neurology, General Medicine)
  3. 5 Doctors with room numbers and average consultation times
  4. 4 Sample Registered Patients with Patient IDs
  5. 20 Beds across 4 Wards (ICU, General Ward, Private, Emergency)
  6. Blood Stock for all 8 Blood Groups with safe levels and red alerts (< 3 units)
  7. 10 Registered Blood Donors with contact details & blood groups
  8. Sample OPD Tokens for today's queue & Public TV Display demo
  9. Sample Inpatient Bed Admissions linking Token -> Patient -> Bed
  10. Sample Blood Requests linked to patients

Usage:
  cd d:\\ANTIGRAVITY\\hospital\\backend
  venv\\Scripts\\python.exe seed_demo_data.py
  OR
  venv\\Scripts\\python.exe manage.py seed_demo_data
"""

import os
import sys
from datetime import timedelta

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartcare.settings')
import django
django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.accounts.models import Department, Doctor, Patient
from apps.opd.models import Token, Queue
from apps.beds.models import Ward, Bed, Admission
from apps.bloodbank.models import BloodStock, Donor, BloodRequest

User = get_user_model()


def seed():
    print("=" * 60)
    print("🏥 Starting SmartCare HMS Demo Data Seeder...")
    print("=" * 60)

    # ─────────────────────────────────────────────
    # 1. Hospital Administrator Account
    # ─────────────────────────────────────────────
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
    admin_user.set_password('admin123')
    admin_user.save()
    print(f"[{'CREATED' if created else 'EXISTS'}] Admin User: admin / admin123")

    # ─────────────────────────────────────────────
    # 2. Departments
    # ─────────────────────────────────────────────
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
    print(f"[OK] Seeded {len(dept_objs)} Hospital Departments.")

    # ─────────────────────────────────────────────
    # 3. 5 Doctors (With Dept, Room, and Avg Consult Time)
    # ─────────────────────────────────────────────
    doctors_info = [
        {
            "username": "dr.sharma",
            "password": "password123",
            "first_name": "Rajesh",
            "last_name": "Sharma",
            "email": "dr.sharma@smartcare.hospital",
            "phone": "+91-9811122201",
            "dept": "Cardiology",
            "spec": "Senior Interventional Cardiologist",
            "room": "Room 101",
            "avg_mins": 15,
        },
        {
            "username": "dr.patel",
            "password": "password123",
            "first_name": "Priya",
            "last_name": "Patel",
            "email": "dr.patel@smartcare.hospital",
            "phone": "+91-9811122202",
            "dept": "General Medicine",
            "spec": "Consultant Physician & Diabetologist",
            "room": "Room 102",
            "avg_mins": 10,
        },
        {
            "username": "dr.verma",
            "password": "password123",
            "first_name": "Vikram",
            "last_name": "Verma",
            "email": "dr.verma@smartcare.hospital",
            "phone": "+91-9811122203",
            "dept": "Orthopedics",
            "spec": "Orthopedic & Joint Replacement Surgeon",
            "room": "Room 201",
            "avg_mins": 20,
        },
        {
            "username": "dr.gupta",
            "password": "password123",
            "first_name": "Sneha",
            "last_name": "Gupta",
            "email": "dr.gupta@smartcare.hospital",
            "phone": "+91-9811122204",
            "dept": "Pediatrics",
            "spec": "Child Specialist & Pediatric Intensivist",
            "room": "Room 202",
            "avg_mins": 12,
        },
        {
            "username": "dr.iyer",
            "password": "password123",
            "first_name": "Anand",
            "last_name": "Iyer",
            "email": "dr.iyer@smartcare.hospital",
            "phone": "+91-9811122205",
            "dept": "Neurology",
            "spec": "Consultant Neurologist & Stroke Specialist",
            "room": "Room 301",
            "avg_mins": 25,
        },
    ]

    doctor_objs = []
    for d_data in doctors_info:
        user, _ = User.objects.get_or_create(
            username=d_data["username"],
            defaults={
                'email': d_data["email"],
                'first_name': d_data["first_name"],
                'last_name': d_data["last_name"],
                'role': 'doctor',
                'phone': d_data["phone"],
            }
        )
        user.set_password(d_data["password"])
        user.save()

        doc_profile, _ = Doctor.objects.get_or_create(
            user=user,
            defaults={
                'department': dept_objs[d_data["dept"]],
                'specialization': d_data["spec"],
                'room_number': d_data["room"],
                'avg_consult_minutes': d_data["avg_mins"],
                'is_available': True,
            }
        )
        doctor_objs.append(doc_profile)
    print(f"[OK] Seeded {len(doctor_objs)} Specialist Doctors.")

    # ─────────────────────────────────────────────
    # 4. Registered Patients
    # ─────────────────────────────────────────────
    patients_info = [
        {
            "username": "patient1",
            "first_name": "Rahul",
            "last_name": "Kumar",
            "email": "rahul.kumar@gmail.com",
            "phone": "+91-9822233301",
            "patient_id": "PAT-0001",
            "gender": "M",
            "blood_group": "B+",
        },
        {
            "username": "patient2",
            "first_name": "Anjali",
            "last_name": "Singh",
            "email": "anjali.singh@gmail.com",
            "phone": "+91-9822233302",
            "patient_id": "PAT-0002",
            "gender": "F",
            "blood_group": "O+",
        },
        {
            "username": "patient3",
            "first_name": "Amit",
            "last_name": "Joshi",
            "email": "amit.joshi@gmail.com",
            "phone": "+91-9822233303",
            "patient_id": "PAT-0003",
            "gender": "M",
            "blood_group": "A+",
        },
        {
            "username": "patient4",
            "first_name": "Pooja",
            "last_name": "Desai",
            "email": "pooja.desai@gmail.com",
            "phone": "+91-9822233304",
            "patient_id": "PAT-0004",
            "gender": "F",
            "blood_group": "AB-",
        },
    ]

    patient_objs = []
    for p_data in patients_info:
        user, _ = User.objects.get_or_create(
            username=p_data["username"],
            defaults={
                'email': p_data["email"],
                'first_name': p_data["first_name"],
                'last_name': p_data["last_name"],
                'role': 'patient',
                'phone': p_data["phone"],
            }
        )
        user.set_password('password123')
        user.save()

        pat_profile, _ = Patient.objects.get_or_create(
            user=user,
            defaults={
                'patient_id': p_data["patient_id"],
                'gender': p_data["gender"],
                'blood_group': p_data["blood_group"],
                'address': 'SmartCity Healthcare Colony, Sector 4',
                'emergency_contact_name': 'Family Member',
                'emergency_contact_phone': '+91-9999888877',
            }
        )
        patient_objs.append(pat_profile)
    print(f"[OK] Seeded {len(patient_objs)} Registered Patients.")

    # ─────────────────────────────────────────────
    # 5. 20 Beds Across 4 Wards (ICU, General, Private, Emergency)
    # ─────────────────────────────────────────────
    wards_setup = [
        {
            "name": "General Ward A",
            "type": "general",
            "floor": 1,
            "prefix": "GEN",
            "count": 8,
            "dept": dept_objs["General Medicine"],
            # 8 beds: 4 available, 3 occupied, 1 cleaning
            "statuses": ['available', 'available', 'occupied', 'occupied', 'available', 'cleaning', 'occupied', 'available']
        },
        {
            "name": "Intensive Care Unit (ICU)",
            "type": "icu",
            "floor": 2,
            "prefix": "ICU",
            "count": 4,
            "dept": dept_objs["Cardiology"],
            # 4 beds: 2 occupied, 1 available, 1 cleaning
            "statuses": ['occupied', 'available', 'occupied', 'cleaning']
        },
        {
            "name": "Private Deluxe Wing",
            "type": "private",
            "floor": 3,
            "prefix": "PVT",
            "count": 5,
            "dept": dept_objs["Cardiology"],
            # 5 beds: 3 available, 2 occupied
            "statuses": ['available', 'occupied', 'available', 'occupied', 'available']
        },
        {
            "name": "Emergency Casualty Ward",
            "type": "emergency",
            "floor": 1,
            "prefix": "EMG",
            "count": 3,
            "dept": dept_objs["General Medicine"],
            # 3 beds: 2 available, 1 occupied
            "statuses": ['available', 'occupied', 'available']
        },
    ]

    total_beds_created = 0
    bed_records = []
    for w_spec in wards_setup:
        ward_obj, _ = Ward.objects.get_or_create(
            name=w_spec["name"],
            defaults={
                'ward_type': w_spec["type"],
                'floor_number': w_spec["floor"],
                'total_beds': w_spec["count"],
                'department': w_spec["dept"],
                'is_active': True,
            }
        )

        for idx, status in enumerate(w_spec["statuses"], start=1):
            bed_num = f"{w_spec['prefix']}-{idx:02d}"
            bed, _ = Bed.objects.get_or_create(
                ward=ward_obj,
                bed_number=bed_num,
                defaults={
                    'status': status,
                    'has_oxygen': w_spec["type"] in ['icu', 'emergency', 'private'],
                    'has_ventilator': w_spec["type"] == 'icu',
                    'has_monitor': w_spec["type"] in ['icu', 'emergency'],
                }
            )
            # Update status to match seed specification
            bed.status = status
            bed.save()
            bed_records.append(bed)
            total_beds_created += 1

    print(f"[OK] Seeded {total_beds_created} Hospital Beds across 4 Wards (ICU, General, Private, Emergency).")

    # ─────────────────────────────────────────────
    # 6. Blood Stock for All 8 Blood Groups
    # ─────────────────────────────────────────────
    today = timezone.now().date()
    expiry_default = today + timedelta(days=35)
    expiry_soon = today + timedelta(days=12)

    blood_stock_distribution = [
        {"group": "A+", "units": 8, "expiry": expiry_default},
        {"group": "A-", "units": 2, "expiry": expiry_soon},      # 🚨 Low alert (< 3)
        {"group": "B+", "units": 12, "expiry": expiry_default},
        {"group": "B-", "units": 1, "expiry": expiry_soon},      # 🚨 Low alert (< 3)
        {"group": "O+", "units": 15, "expiry": expiry_default},
        {"group": "O-", "units": 2, "expiry": expiry_soon},      # 🚨 Low alert (< 3)
        {"group": "AB+", "units": 6, "expiry": expiry_default},
        {"group": "AB-", "units": 1, "expiry": expiry_soon},     # 🚨 Low alert (< 3)
    ]

    for item in blood_stock_distribution:
        stock, _ = BloodStock.objects.get_or_create(
            blood_group=item["group"],
            defaults={
                'units_available': item["units"],
                'minimum_threshold': 3,
                'expiry_date': item["expiry"],
            }
        )
        stock.units_available = item["units"]
        stock.minimum_threshold = 3
        stock.expiry_date = item["expiry"]
        stock.save()

    print("[OK] Seeded Blood Stock inventory for all 8 groups with active Red Alerts (< 3 units).")

    # ─────────────────────────────────────────────
    # 7. 10 Registered Blood Donors
    # ─────────────────────────────────────────────
    donors_info = [
        ("Ramesh Nair", "B+", "+91-9876543210", "Mumbai", 45),
        ("Sunita Rao", "O+", "+91-9876543211", "Delhi", 90),
        ("Karan Mehta", "A+", "+91-9876543212", "Pune", 30),
        ("Deepa Menon", "O-", "+91-9876543213", "Bangalore", 120),  # Matches low stock O-
        ("Suresh Reddy", "AB+", "+91-9876543214", "Hyderabad", 60),
        ("Neha Kapoor", "B-", "+91-9876543215", "Jaipur", 15),      # Matches low stock B-
        ("Manoj Tiwari", "A-", "+91-9876543216", "Ahmedabad", 110), # Matches low stock A-
        ("Kavita Das", "AB-", "+91-9876543217", "Kolkata", 80),     # Matches low stock AB-
        ("Alok Saxena", "O+", "+91-9876543218", "Lucknow", 50),
        ("Divya Pillai", "B+", "+91-9876543219", "Chennai", 70),
    ]

    for name, bg, phone, city, days_ago in donors_info:
        Donor.objects.get_or_create(
            phone=phone,
            defaults={
                'name': name,
                'blood_group': bg,
                'city': city,
                'last_donation_date': today - timedelta(days=days_ago),
                'is_available': True,
                'medical_notes': 'Eligible and verified donor.',
            }
        )
    print(f"[OK] Seeded {len(donors_info)} Registered Donors across matching blood groups.")

    # ─────────────────────────────────────────────
    # 8. Sample OPD Tokens for Today (Live Queue Demo)
    # ─────────────────────────────────────────────
    doc_sharma = doctor_objs[0]  # Dr. Rajesh Sharma (Cardiology)
    doc_patel = doctor_objs[1]   # Dr. Priya Patel (General Medicine)

    tokens_spec = [
        # Dr. Sharma (Cardiology) Queue
        (patient_objs[0], doc_sharma, 1, 'completed', 'normal', 'Chest heaviness and palpitations'),
        (patient_objs[1], doc_sharma, 2, 'called', 'emergency', 'Acute chest pain radiating to left arm'),
        (patient_objs[2], doc_sharma, 3, 'waiting', 'normal', 'Routine post-stent follow up'),
        (patient_objs[3], doc_sharma, 4, 'waiting', 'senior_citizen', 'High blood pressure checkup'),

        # Dr. Patel (General Medicine) Queue
        (patient_objs[2], doc_patel, 1, 'called', 'normal', 'Seasonal viral fever and body ache'),
        (patient_objs[3], doc_patel, 2, 'waiting', 'normal', 'Digestive issues and acidity'),
    ]

    for pat, doc, num, stat, prio, symp in tokens_spec:
        prefix = doc.department.name[:3].upper() if doc.department else 'MED'
        t_code = f"{prefix}-{num:03d}"
        tok, _ = Token.objects.get_or_create(
            doctor=doc,
            appointment_date=today,
            token_number=num,
            defaults={
                'patient': pat,
                'department': doc.department,
                'token_code': t_code,
                'status': stat,
                'priority': prio,
                'symptoms': symp,
            }
        )
        tok.status = stat
        tok.priority = prio
        tok.save()

    # Sync Queue objects
    Queue.objects.update_or_create(
        doctor=doc_sharma,
        queue_date=today,
        defaults={
            'current_token': 2,
            'total_tokens': 4,
            'avg_consult_minutes': doc_sharma.avg_consult_minutes,
            'is_active': True,
        }
    )
    Queue.objects.update_or_create(
        doctor=doc_patel,
        queue_date=today,
        defaults={
            'current_token': 1,
            'total_tokens': 2,
            'avg_consult_minutes': doc_patel.avg_consult_minutes,
            'is_active': True,
        }
    )
    print("[OK] Seeded Live OPD Tokens and Doctor Queue states for today.")

    # ─────────────────────────────────────────────
    # 9. Sample Inpatient Admissions (Step 13 Connection)
    # ─────────────────────────────────────────────
    gen_occupied_bed = Bed.objects.filter(ward__name="General Ward A", status='occupied').first()
    if gen_occupied_bed:
        Admission.objects.get_or_create(
            bed=gen_occupied_bed,
            patient=patient_objs[0],
            defaults={
                'attending_doctor': doc_sharma,
                'diagnosis': 'Admitted for Observation after Cardiac OPD Consultation',
                'status': 'admitted',
            }
        )

    icu_occupied_bed = Bed.objects.filter(ward__name="Intensive Care Unit (ICU)", status='occupied').first()
    if icu_occupied_bed:
        Admission.objects.get_or_create(
            bed=icu_occupied_bed,
            patient=patient_objs[1],
            defaults={
                'attending_doctor': doc_sharma,
                'diagnosis': 'Acute Coronary Syndrome - ICU Continuous Cardiac Monitoring',
                'status': 'admitted',
            }
        )
    print("[OK] Seeded Sample Inpatient Admissions linked to Token Patients.")

    # ─────────────────────────────────────────────
    # 10. Sample Blood Requests (Step 13 Connection)
    # ─────────────────────────────────────────────
    BloodRequest.objects.get_or_create(
        patient=patient_objs[0],
        blood_group="B+",
        units_required=2,
        defaults={
            'patient_name': 'Rahul Kumar',
            'contact_phone': '+91-9822233301',
            'hospital_ward': 'General Ward A (Bed GEN-03)',
            'priority': 'urgent',
            'purpose': 'Post-procedure stabilization and hemoglobin replenishment',
            'status': 'pending',
            'required_by_date': today + timedelta(days=2),
        }
    )
    BloodRequest.objects.get_or_create(
        patient=patient_objs[1],
        blood_group="O+",
        units_required=3,
        defaults={
            'patient_name': 'Anjali Singh',
            'contact_phone': '+91-9822233302',
            'hospital_ward': 'Intensive Care Unit (Bed ICU-01)',
            'priority': 'emergency',
            'purpose': 'Emergency cardiac surgery standby',
            'status': 'approved',
            'units_provided': 3,
            'required_by_date': today,
        }
    )
    print("[OK] Seeded Sample Blood Bank Requests linked to Patients.")

    print("=" * 60)
    print("✅ SmartCare HMS Demo Data Seeding Completed Successfully!")
    print("=" * 60)
    print("\n🔑 DEMO LOGIN CREDENTIALS:")
    print("------------------------------------------------------------")
    print("  Role            Username      Password")
    print("------------------------------------------------------------")
    print("  Administrator   admin         admin123")
    print("  Doctor          dr.sharma     password123  (Cardiology)")
    print("  Doctor          dr.patel      password123  (General Medicine)")
    print("  Doctor          dr.verma      password123  (Orthopedics)")
    print("  Patient         patient1      password123  (PAT-0001 / B+)")
    print("  Patient         patient2      password123  (PAT-0002 / O+)")
    print("------------------------------------------------------------\n")


if __name__ == '__main__':
    seed()
