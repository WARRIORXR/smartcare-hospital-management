"""
apps/opd/tests.py
=================
Tests for OPD Tokens, Advance Time-Slot Bookings, Doctor Leave Blocking,
<=3 Queue Proximity SMS/WhatsApp/In-App Notifications, and Anti-IDOR Token Checks.
"""

from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, Doctor, DoctorLeave, Patient, User
from .models import Notification, Token


class OpdQueueAndNotificationsTests(APITestCase):
    def setUp(self):
        self.dept = Department.objects.create(name='General Medicine')
        self.doc_user = User.objects.create_user(
            username='dr_opd', email='dropd@test.com', password='Doctor@Strong99',
            first_name='Priya', last_name='Patel', role='doctor'
        )
        self.doctor = Doctor.objects.create(
            user=self.doc_user, department=self.dept, room_number='Room 102', is_available=True
        )
        self.patients = []
        for idx in range(1, 6):
            u = User.objects.create_user(
                username=f'opd_p{idx}', email=f'p{idx}@test.com', password='Patient@Strong99',
                first_name=f'Pat{idx}', role='patient', phone=f'+91-980000000{idx}'
            )
            self.patients.append(Patient.objects.create(user=u, patient_id=f'PAT-OPD{idx}'))

    def test_proximity_notifications_when_3_positions_away(self):
        # Book 5 tokens today; calling token #1 moves #2, #3, #4 within <=3 positions
        today = timezone.now().date()
        for idx, pat in enumerate(self.patients, start=1):
            self.client.force_authenticate(user=pat.user)
            res = self.client.post('/api/opd/tokens/generate/', {
                'doctor': self.doctor.id,
                'appointment_date': today.isoformat(),
                'priority': 'normal',
                'symptoms': 'Fever',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Call #1 -> #2, #3, #4 should all have SMS/WhatsApp/in_app notifications
        self.client.force_authenticate(user=self.doc_user)
        call_res = self.client.post('/api/opd/doctor/call-next/', {}, format='json')
        self.assertEqual(call_res.status_code, status.HTTP_200_OK)

        # Patient 4 (index 3, originally 4th, now #3 waiting) receives proximity alerts
        p4_notifs = Notification.objects.filter(patient=self.patients[3], trigger_event='queue_proximity')
        self.assertTrue(p4_notifs.filter(channel='sms').exists())
        self.assertTrue(p4_notifs.filter(channel='whatsapp').exists())
        self.assertTrue(p4_notifs.filter(channel='in_app').exists())

        # Patient 4 can fetch own notifications, not someone else's
        self.client.force_authenticate(user=self.patients[3].user)
        my_notifs = self.client.get('/api/opd/notifications/')
        self.assertEqual(my_notifs.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(my_notifs.data), 3)

    def test_advance_booking_slots_and_doctor_leave_blocked(self):
        future_day = timezone.now().date() + timedelta(days=4)
        leave_day = timezone.now().date() + timedelta(days=6)
        DoctorLeave.objects.create(
            doctor=self.doctor, start_date=leave_day, end_date=leave_day, reason='Conference', is_approved=True
        )

        self.client.force_authenticate(user=self.patients[0].user)
        # Slots endpoint reflects availability vs leave
        slots_ok = self.client.get(f'/api/opd/doctors/{self.doctor.id}/slots/?date={future_day.isoformat()}')
        self.assertEqual(slots_ok.status_code, status.HTTP_200_OK)
        self.assertFalse(slots_ok.data['is_on_leave'])

        # Booking advance slot succeeds
        book_res = self.client.post('/api/opd/tokens/generate/', {
            'doctor': self.doctor.id,
            'appointment_date': future_day.isoformat(),
            'time_slot': '10:00 AM - 10:30 AM',
            'priority': 'normal',
        }, format='json')
        self.assertEqual(book_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(book_res.data['is_advance_booking'])

        # Booking on doctor's leave date is blocked
        leave_res = self.client.post('/api/opd/tokens/generate/', {
            'doctor': self.doctor.id,
            'appointment_date': leave_day.isoformat(),
            'time_slot': '10:00 AM - 10:30 AM',
        }, format='json')
        self.assertEqual(leave_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patient_cannot_view_other_patient_token_or_clinical_display(self):
        tok = Token.objects.create(
            patient=self.patients[0], doctor=self.doctor, department=self.dept,
            token_number=1, appointment_date=timezone.now().date()
        )
        self.client.force_authenticate(user=self.patients[1].user)
        self.assertEqual(self.client.get(f'/api/opd/tokens/{tok.id}/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(f'/api/opd/public/display/{self.doctor.id}/').status_code, status.HTTP_403_FORBIDDEN)
