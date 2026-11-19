"""
apps/accounts/models.py
========================
Defines the core users and profiles for SmartCare.

Tables created:
  - users          (custom User with role)
  - departments    (hospital departments like Cardiology, ENT...)
  - doctors        (doctor profile linked to User + Department)
  - patients       (patient profile linked to User)
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


# ─────────────────────────────────────────────
#  USER  (custom user model replacing default)
# ─────────────────────────────────────────────
class User(AbstractUser):
    """
    Extended User model with a 'role' field.
    Django's AbstractUser already gives us:
      username, email, password, first_name, last_name,
      is_active, is_staff, date_joined, last_login

    We ADD: role, phone
    """

    # Every user must have exactly one role
    ROLE_CHOICES = [
        ('patient',        'Patient'),
        ('doctor',         'Doctor'),
        ('reception',      'Reception'),
        ('bloodbank_staff','Blood Bank Staff'),
        ('admin',          'Admin'),
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
        db_table = 'users'       # exact MySQL table name
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return f"{self.get_full_name()} | {self.role} | @{self.username}"


# ─────────────────────────────────────────────
#  DEPARTMENT  (Cardiology, ENT, Ortho, etc.)
# ─────────────────────────────────────────────
class Department(models.Model):
    """
    Hospital departments.
    Doctors and OPD tokens are linked to departments.
    """

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
        ordering = ['name']        # alphabetical order by default

    def __str__(self):
        return self.name


# ─────────────────────────────────────────────
#  DOCTOR  (profile for users with role=doctor)
# ─────────────────────────────────────────────
class Doctor(models.Model):
    """
    Doctor profile.
    Each Doctor is linked 1-to-1 with a User (role='doctor')
    and belongs to one Department.
    """

    # One User → One Doctor profile
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,     # delete doctor profile if user deleted
        related_name='doctor_profile',
        limit_choices_to={'role': 'doctor'}
    )

    # Many Doctors → One Department
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,    # keep doctor if dept deleted
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
        default=0.00,
        help_text="Fee in Indian Rupees"
    )

    # Available days as a comma-separated string
    # e.g. "Mon,Tue,Wed,Thu,Fri"
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
#  PATIENT  (profile for users with role=patient)
# ─────────────────────────────────────────────
class Patient(models.Model):
    """
    Patient profile.
    Each Patient is linked 1-to-1 with a User (role='patient').
    Stores medical info like blood group, age, etc.
    """

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

    # One User → One Patient profile
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='patient_profile',
        limit_choices_to={'role': 'patient'}
    )

    date_of_birth = models.DateField(
        null=True,
        blank=True
    )

    gender = models.CharField(
        max_length=1,
        choices=GENDER_CHOICES,
        blank=True
    )

    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUP_CHOICES,
        blank=True
    )

    address = models.TextField(
        blank=True,
        help_text="Full residential address"
    )

    # Emergency contact
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True)

    # Unique patient ID generated by reception (e.g. PAT-0001)
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
