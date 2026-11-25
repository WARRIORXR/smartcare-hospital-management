"""
apps/records/tests.py
=====================
Tests for Prescriptions, Visit Notes, Lab Report Uploads, and Strict Object-Level Download Authorization.
"""

import shutil
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, Doctor, Patient, User

TEMP_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class MedicalRecordsSecurityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)
    def setUp(self):
        self.dept = Department.objects.create(name='Pathology')
        self.doc_user = User.objects.create_user(
            username='dr_rec', email='drrec@test.com', password='Doctor@Strong99', role='doctor'
        )
        self.doctor = Doctor.objects.create(user=self.doc_user, department=self.dept)
        self.pat_a = Patient.objects.create(
            user=User.objects.create_user(username='rec_pa', email='rpa@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-REC1'
        )
        self.pat_b = Patient.objects.create(
            user=User.objects.create_user(username='rec_pb', email='rpb@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-REC2'
        )

    def test_upload_lab_report_and_enforce_download_idor_isolation(self):
        self.client.force_authenticate(user=self.doc_user)
        lab_file = SimpleUploadedFile('cbc_report.pdf', b'%PDF-1.4 sample lab content', content_type='application/pdf')
        res = self.client.post('/api/records/', {
            'patient': self.pat_a.id,
            'record_type': 'lab_report',
            'title': 'Complete Blood Count',
            'diagnosis': 'Normal',
            'visit_notes': 'Hemoglobin 14.2 g/dL',
            'attachment': lab_file,
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        rec_id = res.data['id']

        # Patient B must NOT read or download Patient A's medical record
        self.client.force_authenticate(user=self.pat_b.user)
        self.assertEqual(self.client.get(f'/api/records/{rec_id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(f'/api/records/{rec_id}/download/').status_code, status.HTTP_403_FORBIDDEN)

        # Patient A cannot create/delete medical records, but CAN view & download their own
        self.client.force_authenticate(user=self.pat_a.user)
        self.assertEqual(self.client.delete(f'/api/records/{rec_id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(f'/api/records/{rec_id}/').status_code, status.HTTP_200_OK)
        dl = self.client.get(f'/api/records/{rec_id}/download/')
        self.assertEqual(dl.status_code, status.HTTP_200_OK)
        self.assertIn(b'%PDF-1.4', b''.join(dl.streaming_content))
