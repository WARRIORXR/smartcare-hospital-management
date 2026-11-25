"""
apps/accounts/tests.py
======================
Automated Django REST Framework tests for Auth, Strong Passwords, Privilege Escalation Prevention,
Rate Limiting, Password Reset, Token Refresh Rotation & Blacklisting, Anti-IDOR Journey Protection,
Doctor Leave/Feedback, Audit Logs, and Admin Analytics CSV/PDF Exports.
"""

from datetime import timedelta
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AuditLog, Department, Doctor, DoctorLeave, Patient, User
from apps.opd.models import Token


class AccountsSecurityAndFeaturesTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.dept = Department.objects.create(name='Cardiology', description='Heart care')
        self.admin_user = User.objects.create_user(
            username='admin_sec', email='admin@smartcare.test', password='Admin@Strong99', role='admin', is_staff=True
        )
        self.doc_user = User.objects.create_user(
            username='dr_alpha', email='alpha@smartcare.test', password='Doctor@Strong99',
            first_name='Alpha', last_name='Doc', role='doctor'
        )
        self.doctor = Doctor.objects.create(
            user=self.doc_user, department=self.dept, specialization='Cardiologist',
            room_number='Room 101', avg_consult_minutes=15, is_available=True
        )
        self.reception_user = User.objects.create_user(
            username='rec_one', email='rec@smartcare.test', password='Recep@Strong99', role='reception'
        )
        self.pat_a_user = User.objects.create_user(
            username='pat_a', email='pata@smartcare.test', password='Patient@Strong99',
            first_name='Patient', last_name='A', role='patient', phone='+91-9000000001'
        )
        self.pat_a = Patient.objects.create(user=self.pat_a_user, patient_id='PAT-A01', blood_group='O+')

        self.pat_b_user = User.objects.create_user(
            username='pat_b', email='patb@smartcare.test', password='Patient@Strong99',
            first_name='Patient', last_name='B', role='patient', phone='+91-9000000002'
        )
        self.pat_b = Patient.objects.create(user=self.pat_b_user, patient_id='PAT-B02', blood_group='B+')

    def _login(self, username, password):
        res = self.client.post('/api/accounts/login/', {'username': username, 'password': password}, format='json')
        return res

    def test_public_registration_rejects_non_patient_role_privilege_escalation(self):
        res = self.client.post('/api/accounts/register/', {
            'username': 'attacker',
            'email': 'attacker@test.com',
            'password': 'StrongPassword@1',
            'password_confirm': 'StrongPassword@1',
            'role': 'admin',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='attacker').exists())

    def test_weak_password_rejected_on_registration(self):
        res = self.client.post('/api/accounts/register/', {
            'username': 'weakuser',
            'email': 'weak@test.com',
            'password': 'password',
            'password_confirm': 'password',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', res.data)

    def test_valid_patient_registration_succeeds(self):
        res = self.client.post('/api/accounts/register/', {
            'username': 'realpatient',
            'email': 'real@smartcare.test',
            'password': 'RealUser@2026',
            'password_confirm': 'RealUser@2026',
            'first_name': 'Sonia',
            'last_name': 'Gill',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(username='realpatient')
        self.assertEqual(created.role, 'patient')
        self.assertFalse(created.is_staff)

    def test_demo_admin123_blocked_when_allow_demo_admin_false(self):
        with override_settings(ALLOW_DEMO_ADMIN=False):
            legacy = User.objects.create_user(
                username='legacy_admin', email='leg@test.com', password='admin123', role='admin', is_staff=True
            )
            res = self._login(legacy.username, 'admin123')
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_rate_limiting_triggers_429_after_5_attempts(self):
        for i in range(5):
            res = self._login('nonexistent', 'WrongPass@1')
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        throttled = self._login('nonexistent', 'WrongPass@1')
        self.assertEqual(throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_jwt_refresh_rotation_and_blacklist(self):
        login_res = self._login('pat_a', 'Patient@Strong99')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        old_refresh = login_res.data['refresh']

        refresh_res = self.client.post('/api/auth/refresh/', {'refresh': old_refresh}, format='json')
        self.assertEqual(refresh_res.status_code, status.HTTP_200_OK)
        new_refresh = refresh_res.data['refresh']
        self.assertNotEqual(old_refresh, new_refresh)

        # Reusing rotated old refresh token must fail due to blacklisting
        reuse_res = self.client.post('/api/auth/refresh/', {'refresh': old_refresh}, format='json')
        self.assertEqual(reuse_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Explicit logout blacklists active refresh token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh_res.data['access']}")
        out_res = self.client.post('/api/accounts/logout/', {'refresh': new_refresh}, format='json')
        self.assertEqual(out_res.status_code, status.HTTP_200_OK)
        post_out = self.client.post('/api/auth/refresh/', {'refresh': new_refresh}, format='json')
        self.assertEqual(post_out.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_reset_full_flow(self):
        with override_settings(DEBUG=True):
            req_res = self.client.post('/api/accounts/password-reset/', {'email': 'pata@smartcare.test'}, format='json')
            self.assertEqual(req_res.status_code, status.HTTP_200_OK)
            preview = req_res.data.get('dev_preview')
            self.assertIsNotNone(preview)

            confirm_res = self.client.post('/api/accounts/password-reset/confirm/', {
                'uid': preview['uid'],
                'token': preview['token'],
                'new_password': 'NewStrong@Password9',
                'confirm_password': 'NewStrong@Password9',
            }, format='json')
            self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

            login_new = self._login('pat_a', 'NewStrong@Password9')
            self.assertEqual(login_new.status_code, status.HTTP_200_OK)

    def test_object_level_idor_patient_journey_and_audit_log(self):
        self.client.force_authenticate(user=self.pat_a_user)

        # Patient A cannot view Patient B's medical journey (IDOR check)
        denied = self.client.get(f'/api/accounts/patients/{self.pat_b.id}/journey/')
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        # Patient A cannot list other patients
        pat_list = self.client.get('/api/accounts/patients/')
        self.assertEqual(pat_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(pat_list.data), 1)
        self.assertEqual(pat_list.data[0]['id'], self.pat_a.id)

        # Patient A can view their own medical journey
        allowed = self.client.get(f'/api/accounts/patients/{self.pat_a.id}/journey/')
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(
                actor=self.pat_a_user, action='VIEW', resource_type='PatientJourney', patient=self.pat_a
            ).exists()
        )

    def test_analytics_and_exports_restricted_to_admin(self):
        # Patient blocked from admin analytics & audit logs
        self.client.force_authenticate(user=self.pat_a_user)
        self.assertEqual(self.client.get('/api/accounts/admin/analytics/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/accounts/audit-logs/').status_code, status.HTTP_403_FORBIDDEN)

        # Admin can read analytics, audit logs, CSV and PDF reports
        self.client.force_authenticate(user=self.admin_user)
        self.assertEqual(self.client.get('/api/accounts/admin/analytics/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/accounts/audit-logs/').status_code, status.HTTP_200_OK)

        csv_res = self.client.get('/api/accounts/admin/analytics/export/csv/')
        self.assertEqual(csv_res.status_code, status.HTTP_200_OK)
        self.assertIn('text/csv', csv_res['Content-Type'])

        pdf_res = self.client.get('/api/accounts/admin/analytics/export/pdf/')
        self.assertEqual(pdf_res.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_res['Content-Type'], 'application/pdf')
        self.assertTrue(pdf_res.content.startswith(b'%PDF'))

    def test_doctor_leave_and_feedback(self):
        today = timezone.now().date()
        self.client.force_authenticate(user=self.doc_user)
        leave_res = self.client.post('/api/accounts/leaves/', {
            'start_date': (today + timedelta(days=3)).isoformat(),
            'end_date': (today + timedelta(days=4)).isoformat(),
            'reason': 'Medical Conference',
        }, format='json')
        self.assertEqual(leave_res.status_code, status.HTTP_201_CREATED)

        completed_tok = Token.objects.create(
            patient=self.pat_a, doctor=self.doctor, department=self.dept,
            token_number=1, appointment_date=today, status='completed'
        )
        self.client.force_authenticate(user=self.pat_a_user)
        fb_res = self.client.post('/api/accounts/feedback/', {
            'doctor': self.doctor.id,
            'token': completed_tok.id,
            'rating': 5,
            'comment': 'Great care and clear explanation.',
        }, format='json')
        self.assertEqual(fb_res.status_code, status.HTTP_201_CREATED)

    def test_swagger_openapi_schema_and_docs_accessible(self):
        schema_res = self.client.get('/api/schema/')
        self.assertEqual(schema_res.status_code, status.HTTP_200_OK)
        docs_res = self.client.get('/api/docs/')
        self.assertEqual(docs_res.status_code, status.HTTP_200_OK)

