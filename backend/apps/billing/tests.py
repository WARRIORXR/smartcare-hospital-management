"""
apps/billing/tests.py
=====================
Tests for Automated OPD + Ward Billing Generation, Invoice Payment,
PDF Receipt Generation, and Anti-IDOR Protection.
"""

from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, Doctor, Patient, User
from apps.beds.models import Admission, Bed, Ward
from apps.opd.models import Token


class BillingAndPDFTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name='Cardiology')
        self.doc_user = User.objects.create_user(username='doc_bill', email='dbill@test.com', password='Doctor@Strong99', role='doctor')
        self.doctor = Doctor.objects.create(user=self.doc_user, department=self.dept, consultation_fee=Decimal('750.00'))
        self.rec_user = User.objects.create_user(username='rec_bill', email='rbill@test.com', password='Recep@Strong99', role='reception')

        self.pat_a = Patient.objects.create(
            user=User.objects.create_user(username='bill_pa', email='bpa@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-BILL1'
        )
        self.pat_b = Patient.objects.create(
            user=User.objects.create_user(username='bill_pb', email='bpb@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-BILL2'
        )

        self.token = Token.objects.create(
            patient=self.pat_a, doctor=self.doctor, department=self.dept,
            token_number=1, appointment_date=timezone.now().date()
        )
        ward = Ward.objects.create(name='General Test Ward', ward_type='general', floor_number=1, total_beds=2)
        bed = Bed.objects.create(ward=ward, bed_number='G-01', status='occupied')
        self.admission = Admission.objects.create(patient=self.pat_a, bed=bed, attending_doctor=self.doctor, token=self.token)

    def test_generate_pay_and_download_pdf_receipt_with_idor_protection(self):
        # Patient cannot generate invoices directly
        self.client.force_authenticate(user=self.pat_a.user)
        self.assertEqual(self.client.post('/api/billing/invoices/generate/', {'token_id': self.token.id}, format='json').status_code, status.HTTP_403_FORBIDDEN)

        # Reception generates combined OPD (750) + General Ward 1-day (1500) = 2250 invoice
        self.client.force_authenticate(user=self.rec_user)
        gen = self.client.post('/api/billing/invoices/generate/', {
            'token_id': self.token.id,
            'admission_id': self.admission.id,
        }, format='json')
        self.assertEqual(gen.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(gen.data['total_amount']), Decimal('2250.00'))
        inv_id = gen.data['id']

        # Patient B is blocked from viewing or downloading Patient A's receipt
        self.client.force_authenticate(user=self.pat_b.user)
        self.assertEqual(self.client.get(f'/api/billing/invoices/{inv_id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(f'/api/billing/invoices/{inv_id}/pdf/').status_code, status.HTTP_403_FORBIDDEN)

        # Patient A can pay and download genuine PDF receipt
        self.client.force_authenticate(user=self.pat_a.user)
        pay = self.client.post(f'/api/billing/invoices/{inv_id}/pay/', {'payment_method': 'upi'}, format='json')
        self.assertEqual(pay.status_code, status.HTTP_200_OK)
        self.assertEqual(pay.data['status'], 'paid')

        pdf_res = self.client.get(f'/api/billing/invoices/{inv_id}/pdf/')
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_res['Content-Type'], 'application/pdf')
        self.assertTrue(pdf_res.content.startswith(b'%PDF'))
