"""
apps/beds/tests.py & apps/bloodbank/tests.py coverage for Ward Admissions,
Donor PII protection, and Patient Isolation.
"""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, Doctor, Patient, User
from .models import Bed, Ward


class BedsIsolationTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name='Surgery')
        self.ward = Ward.objects.create(name='ICU-Test', ward_type='icu', floor_number=2, total_beds=2)
        self.bed = Bed.objects.create(ward=self.ward, bed_number='ICU-01', status='available')

        self.doc_user = User.objects.create_user(username='doc_bed', email='db@test.com', password='Doctor@Strong99', role='doctor')
        self.doctor = Doctor.objects.create(user=self.doc_user, department=self.dept)
        self.rec_user = User.objects.create_user(username='rec_bed', email='rb@test.com', password='Recep@Strong99', role='reception')

        self.pat_a = Patient.objects.create(
            user=User.objects.create_user(username='pa_bed', email='pab@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-BED1'
        )
        self.pat_b = Patient.objects.create(
            user=User.objects.create_user(username='pb_bed', email='pbb@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-BED2'
        )

    def test_auto_admit_and_discharge_and_patient_isolation(self):
        self.client.force_authenticate(user=self.rec_user)
        admit = self.client.post('/api/beds/admissions/auto-admit/', {
            'patient_id': self.pat_a.id,
            'ward_type': 'icu',
            'diagnosis': 'Post-op monitoring',
            'attending_doctor_id': self.doctor.id,
        }, format='json')
        self.assertEqual(admit.status_code, status.HTTP_201_CREATED)
        adm_id = admit.data['admission']['id']

        # Patient B cannot view Patient A's inpatient admission or bed overview
        self.client.force_authenticate(user=self.pat_b.user)
        self.assertEqual(self.client.get('/api/beds/overview/').status_code, status.HTTP_403_FORBIDDEN)
        active_b = self.client.get('/api/beds/admissions/active/')
        self.assertEqual(active_b.status_code, status.HTTP_200_OK)
        self.assertEqual(len(active_b.data), 0)

        # Discharge releases bed
        self.client.force_authenticate(user=self.doc_user)
        dis = self.client.post(f'/api/beds/admissions/{adm_id}/discharge/', {'discharge_notes': 'Stable'}, format='json')
        self.assertEqual(dis.status_code, status.HTTP_200_OK)
        self.bed.refresh_from_db()
        self.assertEqual(self.bed.status, 'available')
