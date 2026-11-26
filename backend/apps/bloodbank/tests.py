"""
apps/bloodbank/tests.py
=======================
Tests for Blood Bank inventory, low-stock matching donors, and donor PII privacy protection.
"""

from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Patient, User
from .models import BloodStock, Donor


class BloodBankSecurityTests(APITestCase):
    def setUp(self):
        self.bb_user = User.objects.create_user(
            username='bb_staff', email='bb@test.com', password='BloodBank@Strong99', role='bloodbank_staff'
        )
        self.pat_user = User.objects.create_user(
            username='bb_pat', email='bbp@test.com', password='Patient@Strong99', role='patient'
        )
        self.pat = Patient.objects.create(user=self.pat_user, patient_id='PAT-BB1', blood_group='O-')
        self.other_pat = Patient.objects.create(
            user=User.objects.create_user(username='bb_pat2', email='bbp2@test.com', password='Patient@Strong99', role='patient'),
            patient_id='PAT-BB2', blood_group='A+'
        )
        BloodStock.objects.create(blood_group='O-', units_available=1, minimum_threshold=3, expiry_date=timezone.now().date() + timedelta(days=20))
        Donor.objects.create(name='Donor Secret', blood_group='O-', phone='+91-9988776655', city='Delhi', is_eligible=True)

    def test_patient_cannot_access_donor_directory_or_receive_donor_pii(self):
        self.client.force_authenticate(user=self.pat_user)
        self.assertEqual(self.client.get('/api/bloodbank/donors/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/bloodbank/donors/matching/?blood_group=O-').status_code, status.HTTP_403_FORBIDDEN)

        # Cannot submit request specifying another patient's ID
        bad_req = self.client.post('/api/bloodbank/requests/', {
            'patient': self.other_pat.id,
            'blood_group': 'O-',
            'units_required': 1,
        }, format='json')
        self.assertEqual(bad_req.status_code, status.HTTP_403_FORBIDDEN)

        # Own request succeeds but omits matching_donors PII from patient response
        ok_req = self.client.post('/api/bloodbank/requests/', {
            'blood_group': 'O-',
            'units_required': 1,
            'priority': 'emergency',
        }, format='json')
        self.assertEqual(ok_req.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ok_req.data['matching_donors'], [])

        # Blood Bank Staff receives matching donors and can fulfill stock updates
        self.client.force_authenticate(user=self.bb_user)
        match = self.client.get('/api/bloodbank/donors/matching/?blood_group=O-')
        self.assertEqual(match.status_code, status.HTTP_200_OK)
        self.assertEqual(match.data['matching_donors_count'], 1)

    def test_terminal_blood_request_cannot_be_re_fulfilled_or_reverted(self):
        self.client.force_authenticate(user=self.bb_user)
        # Ensure sufficient stock (5 units A+)
        self.client.post('/api/bloodbank/stock/update/', {
            'blood_group': 'A+', 'units': 5, 'action': 'set',
            'expiry_date': (timezone.now().date() + timedelta(days=30)).isoformat()
        }, format='json')
        req_res = self.client.post('/api/bloodbank/requests/', {
            'patient': self.other_pat.id,
            'blood_group': 'A+',
            'units_required': 2,
            'priority': 'urgent',
        }, format='json')
        self.assertEqual(req_res.status_code, status.HTTP_201_CREATED)
        req_id = req_res.data['request']['id']

        first_fulfill = self.client.patch(f'/api/bloodbank/requests/{req_id}/status/', {'status': 'fulfilled'}, format='json')
        self.assertEqual(first_fulfill.status_code, status.HTTP_200_OK)
        self.assertEqual(BloodStock.objects.get(blood_group='A+').units_available, 3)

        # Second fulfill or revert must be rejected cleanly without double-deducting stock
        second_fulfill = self.client.patch(f'/api/bloodbank/requests/{req_id}/status/', {'status': 'fulfilled'}, format='json')
        self.assertEqual(second_fulfill.status_code, status.HTTP_400_BAD_REQUEST)
        revert_reject = self.client.patch(f'/api/bloodbank/requests/{req_id}/status/', {'status': 'rejected'}, format='json')
        self.assertEqual(revert_reject.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BloodStock.objects.get(blood_group='A+').units_available, 3)
