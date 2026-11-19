"""
apps/opd/models.py
===================
OPD (Out-Patient Department) Token Queue System.

Tables created:
  - opd_tokens   (a token issued to a patient for a doctor visit)
  - opd_queue    (tracks queue position and call status)

Flow:
  Patient selects Doctor → Generates Token (e.g. MED-001) → Status: Waiting
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

    Format: MED-001, CAR-002, ENT-003, etc.
    Priority: Normal, Senior Citizen, Emergency
    Status: Waiting, In Progress, Completed, Cancelled, Skipped
    """

    STATUS_CHOICES = [
        ('waiting',    'Waiting'),      # Patient is in queue
        ('called',     'Called'),       # Doctor has called patient into room
        ('in_progress','In Progress'),  # Doctor is seeing this patient now
        ('completed',  'Completed'),    # Visit done
        ('admitted',   'Admitted to Ward'), # Admitted to hospital bed
        ('cancelled',  'Cancelled'),    # Patient left / cancelled
        ('skipped',    'Skipped'),      # Doctor skipped this patient
    ]

    PRIORITY_CHOICES = [
        ('normal',         'Normal'),
        ('senior_citizen', 'Senior Citizen'),
        ('emergency',      'Emergency'),
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
        blank=True,
        related_name='tokens'
    )

    # Formatted token code (e.g. MED-001, CAR-005)
    token_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Formatted token code e.g. MED-001"
    )

    # Sequential token number for the day (e.g. 1, 2, 3...)
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

    # Priority field
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default='normal',
        help_text="Patient priority: Normal, Senior Citizen, Emergency"
    )

    # Additional symptoms / reason for visit (optional)
    symptoms = models.TextField(
        blank=True,
        help_text="Brief symptoms described by patient"
    )

    # Flag for emergency (kept for fast filtering/indexing)
    is_emergency = models.BooleanField(
        default=False,
        help_text="Emergency patients go to top of queue"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)   # when token was issued
    updated_at = models.DateTimeField(auto_now=True)        # when status last changed

    class Meta:
        db_table = 'opd_tokens'
        unique_together = ('doctor', 'appointment_date', 'token_number')
        ordering = ['appointment_date', 'token_number']

    def save(self, *args, **kwargs):
        # Auto-sync is_emergency flag
        if self.priority == 'emergency':
            self.is_emergency = True

        # Auto-generate token_code if missing (e.g. MED-001)
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
    """
    Tracks the LIVE queue state for a specific doctor on a date.
    - current_token: which token number is being served RIGHT NOW
    - total_tokens: how many tokens were issued today
    - is_active: whether the doctor's OPD session is open
    """

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='queues'
    )

    queue_date = models.DateField(
        help_text="Date of this queue session"
    )

    # Which token is currently being called (0 means none yet)
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

    # Average consultation time in minutes (falls back to doctor's avg_consult_minutes)
    avg_consult_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Average consultation time (minutes)"
    )

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
