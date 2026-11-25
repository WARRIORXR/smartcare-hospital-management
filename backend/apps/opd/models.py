"""
apps/opd/models.py
===================
OPD (Out-Patient Department) Token Queue System, Advance Appointments,
and Patient Queue Proximity Notifications.
"""

from django.db import models
from apps.accounts.models import Patient, Doctor, Department


# ─────────────────────────────────────────────
#  TOKEN  (issued when patient registers for OPD or Advance Slot)
# ─────────────────────────────────────────────
class Token(models.Model):
    STATUS_CHOICES = [
        ('waiting',     'Waiting'),
        ('called',      'Called'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('admitted',    'Admitted to Ward'),
        ('cancelled',   'Cancelled'),
        ('skipped',     'Skipped'),
    ]

    PRIORITY_CHOICES = [
        ('normal',         'Normal'),
        ('senior_citizen', 'Senior Citizen'),
        ('emergency',      'Emergency'),
    ]

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='tokens'
    )

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='tokens'
    )

    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tokens'
    )

    token_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Formatted token code e.g. MED-001"
    )

    token_number = models.PositiveIntegerField(
        help_text="Sequential number for this doctor on this date"
    )

    appointment_date = models.DateField(
        help_text="Date for which this token is valid"
    )

    time_slot = models.CharField(
        max_length=30,
        blank=True,
        default='',
        help_text="Optional slot for advance booking e.g. 10:00 AM - 10:30 AM"
    )

    is_advance_booking = models.BooleanField(
        default=False,
        help_text="True when booked for a future date or chosen time slot"
    )

    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='waiting'
    )

    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default='normal',
        help_text="Patient priority: Normal, Senior Citizen, Emergency"
    )

    symptoms = models.TextField(
        blank=True,
        help_text="Brief symptoms described by patient"
    )

    is_emergency = models.BooleanField(
        default=False,
        help_text="Emergency patients go to top of queue"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'opd_tokens'
        unique_together = ('doctor', 'appointment_date', 'token_number')
        ordering = ['appointment_date', 'token_number']

    def save(self, *args, **kwargs):
        if self.priority == 'emergency':
            self.is_emergency = True

        if not self.token_code and self.token_number:
            dept_name = ''
            if self.department:
                dept_name = self.department.name
            elif self.doctor and self.doctor.department:
                dept_name = self.doctor.department.name

            prefix = dept_name[:3].upper() if len(dept_name) >= 3 else 'MED'
            self.token_code = f"{prefix}-{self.token_number:03d}"

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.token_code or f'#{self.token_number}'} | {self.patient} | Dr. {self.doctor.user.last_name} | {self.status}"


# ─────────────────────────────────────────────
#  QUEUE  (live queue tracking for a doctor)
# ─────────────────────────────────────────────
class Queue(models.Model):
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='queues'
    )

    queue_date = models.DateField(help_text="Date of this queue session")
    current_token = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    avg_consult_minutes = models.PositiveIntegerField(default=15)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'opd_queue'
        unique_together = ('doctor', 'queue_date')
        ordering = ['-queue_date']

    def __str__(self):
        return (
            f"Queue | Dr. {self.doctor.user.last_name} | "
            f"{self.queue_date} | "
            f"Current: {self.current_token}/{self.total_tokens}"
        )


# ─────────────────────────────────────────────
#  NOTIFICATION  (SMS / WhatsApp / In-App Queue Alerts)
# ─────────────────────────────────────────────
class Notification(models.Model):
    CHANNEL_CHOICES = [
        ('in_app',   'In-App Alert'),
        ('sms',      'SMS'),
        ('whatsapp', 'WhatsApp'),
    ]

    STATUS_CHOICES = [
        ('queued',    'Queued'),
        ('sent',      'Sent'),
        ('simulated', 'Simulated (Sandbox)'),
        ('failed',    'Failed'),
    ]

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    token = models.ForeignKey(
        Token,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    channel = models.CharField(max_length=15, choices=CHANNEL_CHOICES, default='sms')
    trigger_event = models.CharField(max_length=40, blank=True, default='queue_proximity')
    recipient_phone = models.CharField(max_length=25, blank=True)
    title = models.CharField(max_length=150)
    message = models.TextField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='simulated')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'opd_notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.channel.upper()} - {self.status}] {self.title} -> {self.patient}"
