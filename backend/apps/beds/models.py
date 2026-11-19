"""
apps/beds/models.py
====================
Bed Management System for SmartCare.

Tables created:
  - wards       (hospital wards like ICU, General, Maternity...)
  - beds        (individual beds inside a ward)
  - admissions  (patient admitted to a specific bed)

Flow:
  Admin creates Wards → Adds Beds to Ward →
  Reception admits Patient → assigns a free Bed →
  When patient is discharged → Bed becomes available again
"""

from django.db import models
from apps.accounts.models import Patient, Doctor, Department


# ─────────────────────────────────────────────
#  WARD  (a section of the hospital)
# ─────────────────────────────────────────────
class Ward(models.Model):
    """
    A Ward is a section of the hospital (e.g. ICU, General Ward).
    Each Ward has a fixed capacity (number of beds).
    """

    WARD_TYPE_CHOICES = [
        ('general',   'General Ward'),
        ('icu',       'ICU'),
        ('icu_neo',   'Neonatal ICU'),
        ('private',   'Private Room'),
        ('semi',      'Semi-Private Room'),
        ('maternity', 'Maternity Ward'),
        ('pediatric', 'Pediatric Ward'),
        ('emergency', 'Emergency Ward'),
    ]

    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="e.g. General Ward A, ICU-1"
    )

    ward_type = models.CharField(
        max_length=15,
        choices=WARD_TYPE_CHOICES,
        default='general'
    )

    # Which department this ward belongs to
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='wards'
    )

    # Total number of beds (physical capacity)
    total_beds = models.PositiveIntegerField(
        default=10,
        help_text="Physical number of beds in this ward"
    )

    floor_number = models.PositiveIntegerField(
        default=1,
        help_text="Which floor is this ward on?"
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Inactive wards are hidden from bed allocation"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wards'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.ward_type}) | Floor {self.floor_number}"

    @property
    def available_beds(self):
        """Returns count of beds that are currently free."""
        return self.beds.filter(status='available').count()


# ─────────────────────────────────────────────
#  BED  (individual bed in a ward)
# ─────────────────────────────────────────────
class Bed(models.Model):
    """
    A single bed inside a ward.
    Tracks whether the bed is available, occupied, or under maintenance.
    """

    STATUS_CHOICES = [
        ('available',    'Available'),       # Bed is free
        ('occupied',     'Occupied'),        # Patient is admitted
        ('maintenance',  'Under Maintenance'), # Being cleaned/repaired
        ('reserved',     'Reserved'),        # Reserved for incoming patient
    ]

    # Which ward does this bed belong to?
    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name='beds'
    )

    # Bed number (unique within a ward), e.g. B-101, B-102
    bed_number = models.CharField(
        max_length=10,
        help_text="Unique bed identifier within the ward e.g. B-101"
    )

    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='available'
    )

    # ICU beds might have ventilator support
    has_oxygen = models.BooleanField(default=False)
    has_ventilator = models.BooleanField(default=False)
    has_monitor = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'beds'
        # Bed number must be unique within a ward
        unique_together = ('ward', 'bed_number')
        ordering = ['ward', 'bed_number']

    def __str__(self):
        return f"Bed {self.bed_number} | {self.ward.name} | {self.status}"


# ─────────────────────────────────────────────
#  ADMISSION  (patient admitted to a bed)
# ─────────────────────────────────────────────
class Admission(models.Model):
    """
    Records a patient being admitted to a specific bed.
    When patient is discharged, bed status goes back to 'available'.

    One Admission = One patient + One bed + date range.
    """

    STATUS_CHOICES = [
        ('admitted',    'Admitted'),       # Currently in bed
        ('discharged',  'Discharged'),     # Has left
        ('transferred', 'Transferred'),    # Moved to another bed/ward
    ]

    # Which patient is admitted?
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='admissions'
    )

    # Which bed is assigned?
    bed = models.ForeignKey(
        Bed,
        on_delete=models.CASCADE,
        related_name='admissions'
    )

    # Which doctor is responsible?
    attending_doctor = models.ForeignKey(
        Doctor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='admissions'
    )

    # Diagnosis / reason for admission
    diagnosis = models.TextField(
        blank=True,
        help_text="Reason for admission / diagnosis"
    )

    admission_date = models.DateTimeField(
        auto_now_add=True,
        help_text="Automatically set when record is created"
    )

    # Filled in when patient is discharged
    discharge_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Set when patient is discharged"
    )

    status = models.CharField(
        max_length=15,
        choices=STATUS_CHOICES,
        default='admitted'
    )

    # Discharge summary written by doctor
    discharge_notes = models.TextField(
        blank=True,
        help_text="Doctor's notes at time of discharge"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'admissions'
        ordering = ['-admission_date']

    def __str__(self):
        return (
            f"{self.patient.user.get_full_name()} | "
            f"Bed {self.bed.bed_number} | "
            f"{self.status}"
        )
