"""
apps/accounts/models.py
========================
Defines core users, clinical profiles, doctor leave, doctor feedback,
and security audit logs for SmartCare HMS.
"""

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


# ─────────────────────────────────────────────
#  USER  (custom user model replacing default)
# ─────────────────────────────────────────────
class User(AbstractUser):
    """
    Extended User model with a 'role' field.
    """

    ROLE_CHOICES = [
        ('patient',         'Patient'),
        ('doctor',          'Doctor'),
        ('reception',       'Reception'),
        ('bloodbank_staff', 'Blood Bank Staff'),
        ('admin',           'Admin'),
    ]

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='patient',
        help_text="Determines what the user can see and do."
    )

    phone = models.CharField(
        max_length=15,
        blank=True,
        null=True,
        help_text="10-digit mobile number"
    )

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.get_full_name()} | {self.role} | @{self.username}"


# ─────────────────────────────────────────────
#  DEPARTMENT  (Cardiology, ENT, Ortho, etc.)
# ─────────────────────────────────────────────
class Department(models.Model):
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="e.g. Cardiology, ENT, Neurology"
    )

    description = models.TextField(
        blank=True,
        null=True,
        help_text="Short description of the department"
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Inactive departments won't appear in OPD booking"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'departments'
        ordering = ['name']

    def __str__(self):
        return self.name


# ─────────────────────────────────────────────
#  DOCTOR  (profile for users with role=doctor)
# ─────────────────────────────────────────────
class Doctor(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='doctor_profile',
        limit_choices_to={'role': 'doctor'}
    )

    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='doctors'
    )

    specialization = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. Cardiologist, Neurologist"
    )

    qualification = models.CharField(
        max_length=200,
        blank=True,
        help_text="e.g. MBBS, MD, MS"
    )

    experience_years = models.PositiveIntegerField(
        default=0,
        help_text="Years of experience"
    )

    consultation_fee = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=500.00,
        help_text="Fee in Indian Rupees"
    )

    room_number = models.CharField(
        max_length=20,
        blank=True,
        default='Room 101',
        help_text="OPD clinic room number e.g. Room 102"
    )

    avg_consult_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Average consultation time in minutes"
    )

    available_days = models.CharField(
        max_length=100,
        blank=True,
        default='Mon,Tue,Wed,Thu,Fri'
    )

    is_available = models.BooleanField(
        default=True,
        help_text="Marks if doctor is currently on duty"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctors'

    def __str__(self):
        return f"Dr. {self.user.get_full_name()} | {self.specialization}"


# ─────────────────────────────────────────────
#  DOCTOR LEAVE  (advance appointment calendar)
# ─────────────────────────────────────────────
class DoctorLeave(models.Model):
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='leaves'
    )
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    is_approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'doctor_leaves'
        ordering = ['start_date']

    def __str__(self):
        return f"{self.doctor} Leave: {self.start_date} to {self.end_date}"


# ─────────────────────────────────────────────
#  PATIENT  (profile for users with role=patient)
# ─────────────────────────────────────────────
class Patient(models.Model):
    BLOOD_GROUP_CHOICES = [
        ('A+', 'A+'), ('A-', 'A-'),
        ('B+', 'B+'), ('B-', 'B-'),
        ('O+', 'O+'), ('O-', 'O-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'),
    ]

    GENDER_CHOICES = [
        ('M', 'Male'),
        ('F', 'Female'),
        ('O', 'Other'),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='patient_profile',
        limit_choices_to={'role': 'patient'}
    )

    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)
    blood_group = models.CharField(max_length=3, choices=BLOOD_GROUP_CHOICES, blank=True)
    address = models.TextField(blank=True, help_text="Full residential address")

    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)

    patient_id = models.CharField(
        max_length=20,
        unique=True,
        blank=True,
        null=True,
        help_text="Auto-generated unique patient ID"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'patients'

    def __str__(self):
        return f"{self.user.get_full_name()} | {self.patient_id or 'No ID'}"


# ─────────────────────────────────────────────
#  DOCTOR FEEDBACK  (patient ratings per doctor)
# ─────────────────────────────────────────────
class DoctorFeedback(models.Model):
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='feedbacks'
    )
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='doctor_feedbacks'
    )
    token = models.OneToOneField(
        'opd.Token',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedback'
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'doctor_feedbacks'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.rating}/5 for {self.doctor} by {self.patient}"


# ─────────────────────────────────────────────
#  AUDIT LOG  (who viewed or changed records)
# ─────────────────────────────────────────────
class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('VIEW', 'Viewed Record'),
        ('CREATE', 'Created Record'),
        ('UPDATE', 'Updated Record'),
        ('DELETE', 'Deleted Record'),
        ('LOGIN', 'Successful Login'),
        ('LOGIN_FAILED', 'Failed Login Attempt'),
        ('PASSWORD_RESET', 'Password Reset'),
        ('EXPORT', 'Exported Data'),
    ]

    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    actor_username = models.CharField(max_length=150, blank=True)
    actor_role = models.CharField(max_length=30, blank=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    resource_type = models.CharField(max_length=60)
    resource_id = models.CharField(max_length=60, blank=True)
    patient = models.ForeignKey(
        Patient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.action}] {self.resource_type}#{self.resource_id} by {self.actor_username or 'anon'}"
