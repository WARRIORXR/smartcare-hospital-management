"""
apps/opd/models.py
===================
OPD (Out-Patient Department) Token Queue System.

Tables created:
  - opd_tokens   (a token issued to a patient for a doctor visit)
  - opd_queue    (tracks queue position and call status)

Flow:
  Reception registers patient → Issues Token → Token appears in Queue
  Doctor calls next token → Status updates in real time
"""

from django.db import models
from apps.accounts.models import Patient, Doctor, Department


# ─────────────────────────────────────────────
#  TOKEN  (issued when patient registers for OPD)
# ─────────────────────────────────────────────
class Token(models.Model):
    """
    An OPD Token is issued to a patient for a specific doctor
    on a specific date. Token number resets daily.

    Example: Token #5 for Dr. Sharma on 2024-01-15
    """

    STATUS_CHOICES = [
        ('waiting',    'Waiting'),      # Patient is in queue
        ('in_progress','In Progress'),  # Doctor is seeing this patient now
        ('completed',  'Completed'),    # Visit done
        ('cancelled',  'Cancelled'),    # Patient left / cancelled
        ('skipped',    'Skipped'),      # Doctor skipped this patient
    ]

    # Which patient got this token
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='tokens'
    )

    # Which doctor the patient is visiting
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='tokens'
    )

    # Department (denormalized here for fast filtering)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        related_name='tokens'
    )

    # Token number for the day (e.g. 1, 2, 3...)
    token_number = models.PositiveIntegerField(
        help_text="Sequential number for this doctor on this date"
    )

    # Date of appointment
    appointment_date = models.DateField(
        help_text="Date for which this token is valid"
    )

    # Current status of this token
    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='waiting'
    )

    # Additional symptoms / reason for visit (optional)
    symptoms = models.TextField(
        blank=True,
        help_text="Brief symptoms described by patient"
    )

    # Priority: normal patients vs emergency
    is_emergency = models.BooleanField(
        default=False,
        help_text="Emergency patients go to top of queue"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)   # when token was issued
    updated_at = models.DateTimeField(auto_now=True)        # when status last changed

    class Meta:
        db_table = 'opd_tokens'
        # Ensure token numbers are unique per doctor per day
        unique_together = ('doctor', 'appointment_date', 'token_number')
        ordering = ['appointment_date', 'token_number']

    def __str__(self):
        return (
            f"Token #{self.token_number} | "
            f"{self.patient} | "
            f"Dr.{self.doctor.user.last_name} | "
            f"{self.appointment_date} | {self.status}"
        )


# ─────────────────────────────────────────────
#  QUEUE  (live queue tracking for a doctor)
# ─────────────────────────────────────────────
class Queue(models.Model):
    """
    Tracks the LIVE queue state for a specific doctor on a date.
    Think of it as the queue board displayed at reception.

    - current_token: which token number is being served RIGHT NOW
    - total_tokens: how many tokens were issued today
    - is_active: whether the doctor's OPD session is open

    One Queue record per Doctor per Day.
    """

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='queues'
    )

    queue_date = models.DateField(
        help_text="Date of this queue session"
    )

    # Which token is currently being called
    current_token = models.PositiveIntegerField(
        default=0,
        help_text="0 means no token called yet today"
    )

    # Total tokens issued for this doctor today
    total_tokens = models.PositiveIntegerField(
        default=0
    )

    # Is doctor's OPD open or closed for today?
    is_active = models.BooleanField(
        default=True,
        help_text="Set False to close OPD for the day"
    )

    # Optional: estimated time per patient in minutes
    avg_consult_minutes = models.PositiveIntegerField(
        default=10,
        help_text="Average consultation time (minutes)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'opd_queue'
        # Only one queue per doctor per day
        unique_together = ('doctor', 'queue_date')
        ordering = ['-queue_date']

    def __str__(self):
        return (
            f"Queue | Dr.{self.doctor.user.last_name} | "
            f"{self.queue_date} | "
            f"Current: {self.current_token}/{self.total_tokens}"
        )
