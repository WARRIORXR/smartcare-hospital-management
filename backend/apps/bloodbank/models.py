"""
apps/bloodbank/models.py
=========================
Blood Bank Management System for SmartCare.

Tables created:
  - blood_stock    (inventory of available blood units per blood group)
  - donors         (registered blood donors)
  - blood_requests (requests for blood made by patients or doctors)

Flow:
  Donor donates blood → BloodStock updated +units
  Patient/Doctor requests blood → BloodRequest created
  Blood Bank Staff approves → BloodStock updated -units
"""

from django.db import models
from apps.accounts.models import Patient, User


# ─────────────────────────────────────────────
#  SHARED CHOICES (used in multiple models)
# ─────────────────────────────────────────────
BLOOD_GROUP_CHOICES = [
    ('A+', 'A Positive'),
    ('A-', 'A Negative'),
    ('B+', 'B Positive'),
    ('B-', 'B Negative'),
    ('O+', 'O Positive'),
    ('O-', 'O Negative'),
    ('AB+','AB Positive'),
    ('AB-','AB Negative'),
]


# ─────────────────────────────────────────────
#  BLOOD STOCK  (inventory per blood group)
# ─────────────────────────────────────────────
class BloodStock(models.Model):
    """
    Tracks the current inventory (in units) of each blood group.
    There is exactly ONE record per blood group:
    A+, A-, B+, B-, O+, O-, AB+, AB-

    1 unit ≈ 450 ml of whole blood.
    Threshold: < 3 units triggers Red Critical Alert.
    """

    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUP_CHOICES,
        unique=True,         # Only ONE record per blood group
        help_text="e.g. A+, O-, AB+"
    )

    units_available = models.PositiveIntegerField(
        default=0,
        help_text="Current available units in stock"
    )

    units_reserved = models.PositiveIntegerField(
        default=0,
        help_text="Units reserved for pending approved requests"
    )

    # Minimum safe threshold — triggers red alert if stock is less than 3 units
    minimum_threshold = models.PositiveIntegerField(
        default=3,
        help_text="Red alert is raised if stock is less than 3 units"
    )

    # Nearest expiry date of current inventory batch
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expiry date for current blood stock units"
    )

    last_updated = models.DateTimeField(
        auto_now=True,
        help_text="Automatically updated when stock changes"
    )

    class Meta:
        db_table = 'blood_stock'
        ordering = ['blood_group']

    def __str__(self):
        return f"{self.blood_group} | {self.units_available} units (Exp: {self.expiry_date})"

    @property
    def is_critical(self):
        """Returns True if stock is less than 3 units (Red Alert)."""
        return self.units_available < 3

    @property
    def is_low(self):
        """Returns True if stock is below minimum threshold."""
        return self.units_available < self.minimum_threshold

    @property
    def total_usable(self):
        """Units available minus reserved ones."""
        return max(0, self.units_available - self.units_reserved)


# ─────────────────────────────────────────────
#  BLOOD BATCH  (individual batch with expiry)
# ─────────────────────────────────────────────
class BloodBatch(models.Model):
    """
    Logs individual blood unit additions with batch number and expiry date.
    Whole blood usually has shelf life of 35-42 days when refrigerated at 2-6°C.
    """
    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUP_CHOICES
    )

    units = models.PositiveIntegerField(
        default=1,
        help_text="Number of units in this batch"
    )

    batch_number = models.CharField(
        max_length=50,
        blank=True,
        unique=True,
        help_text="e.g. BATCH-AP-202611-01"
    )

    collection_date = models.DateField(
        auto_now_add=True,
        help_text="Date blood was collected"
    )

    expiry_date = models.DateField(
        help_text="Expiry date of this blood unit batch"
    )

    donor_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Optional donor identifier or name"
    )

    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logged_blood_batches'
    )

    is_disposed = models.BooleanField(
        default=False,
        help_text="True if expired and safely disposed"
    )

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'blood_batches'
        ordering = ['expiry_date', '-created_at']

    def __str__(self):
        return f"Batch {self.batch_number or self.id} | {self.blood_group} x{self.units} (Exp: {self.expiry_date})"


# ─────────────────────────────────────────────
#  DONOR  (registered blood donor)
# ─────────────────────────────────────────────
class Donor(models.Model):
    """
    A person who donates blood.
    May or may not be a registered system User.
    Tracks donation history (last donation date) to enforce
    the 3-month gap rule between donations.
    """

    GENDER_CHOICES = [
        ('M', 'Male'),
        ('F', 'Female'),
        ('O', 'Other'),
    ]

    # Optional: If donor is a registered user, link them
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='donations',
        help_text="Leave blank if donor is not a registered user"
    )

    # Donor personal details (required even if not a system user)
    name = models.CharField(
        max_length=100,
        help_text="Full name of the donor"
    )

    age = models.PositiveIntegerField(
        default=25,
        blank=True,
        help_text="Donor age (must be 18-65 to donate)"
    )

    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, default='M')

    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUP_CHOICES
    )

    phone = models.CharField(
        max_length=15,
        help_text="Contact number"
    )

    city = models.CharField(
        max_length=100,
        default='City',
        blank=True,
        help_text="Donor residential city"
    )

    address = models.TextField(blank=True)

    # Donation tracking
    units_donated = models.PositiveIntegerField(
        default=1,
        help_text="Units donated in this sitting (usually 1)"
    )

    # Date of this donation
    donation_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when blood was collected"
    )

    # Last donation (for enforcing 3-month rule)
    last_donation_date = models.DateField(
        null=True,
        blank=True,
        help_text="Last donation date (enforces 90-day cooldown)"
    )

    # Was donor eligible? (health check before donation)
    is_eligible = models.BooleanField(
        default=True,
        help_text="Set False if health check failed"
    )

    # Notes by blood bank staff
    notes = models.TextField(
        blank=True,
        help_text="Any medical notes or remarks"
    )

    # Who recorded this donation
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_donations',
        help_text="Blood bank staff who registered this donation"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'donors'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} | {self.blood_group} | {self.city} | {self.phone}"

    @property
    def days_since_last_donation(self):
        if not self.last_donation_date:
            return None
        from django.utils import timezone
        return (timezone.now().date() - self.last_donation_date).days

    @property
    def can_donate_now(self):
        """Eligible if first-time donor or last donation was > 90 days ago (3 months)."""
        if not self.is_eligible:
            return False
        if not self.last_donation_date:
            return True
        return self.days_since_last_donation >= 90


# ─────────────────────────────────────────────
#  BLOOD REQUEST  (request for blood units)
# ─────────────────────────────────────────────
class BloodRequest(models.Model):
    """
    A request for blood units, made by a patient or on behalf of a patient.
    Blood bank staff review and approve/reject requests.
    On approval, BloodStock is decremented.

    Priority levels: Normal (can wait) vs Urgent (needs blood ASAP).
    """

    STATUS_CHOICES = [
        ('pending',   'Pending'),     # Awaiting staff review
        ('approved',  'Approved'),    # Approved, blood allocated
        ('rejected',  'Rejected'),    # Request denied (insufficient stock etc.)
        ('fulfilled', 'Fulfilled'),   # Blood physically handed over
        ('cancelled', 'Cancelled'),   # Requester cancelled
    ]

    PRIORITY_CHOICES = [
        ('normal',    'Normal'),     # Can wait a few hours
        ('urgent',    'Urgent'),     # Needed within 2-4 hours
        ('emergency', 'Emergency'),  # Immediate / life-threatening
    ]

    PURPOSE_CHOICES = [
        ('surgery',      'Surgery'),
        ('accident',     'Accident / Trauma / Emergency'),
        ('anemia',       'Severe Anemia'),
        ('thalassemia',  'Thalassemia'),
        ('maternity',    'Maternity / Delivery'),
        ('other',        'Other Medical Condition'),
    ]

    # For which patient is blood requested (optional link to registered patient)
    patient = models.ForeignKey(
        Patient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='blood_requests'
    )

    # Name of patient (for fast search or if patient record is not linked)
    patient_name = models.CharField(
        max_length=150,
        blank=True,
        help_text="Full name of patient needing blood"
    )

    # Hospital ward / room location
    hospital_ward = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. ICU-02, General Ward A"
    )

    # Who made the request (could be patient themselves or reception staff)
    requested_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='made_blood_requests'
    )

    blood_group = models.CharField(
        max_length=3,
        choices=BLOOD_GROUP_CHOICES,
        help_text="Required blood group"
    )

    units_required = models.PositiveIntegerField(
        default=1,
        help_text="How many units are needed"
    )

    # How many units were actually given (may differ from required)
    units_provided = models.PositiveIntegerField(
        default=0,
        help_text="Filled in when request is fulfilled"
    )

    purpose = models.CharField(
        max_length=15,
        choices=PURPOSE_CHOICES,
        default='other'
    )

    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='normal'
    )

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # Date by which blood is needed
    required_by_date = models.DateField(
        null=True,
        blank=True,
        help_text="Deadline by which blood must be provided"
    )

    # Notes from requester
    notes = models.TextField(
        blank=True,
        help_text="Additional notes about the request"
    )

    # Who reviewed/approved or rejected the request
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_blood_requests'
    )

    # Reason for rejection (if rejected)
    rejection_reason = models.TextField(
        blank=True,
        help_text="Reason if request was rejected"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'blood_requests'
        ordering = ['-created_at']

    def __str__(self):
        return (
            f"Request #{self.pk} | "
            f"{self.blood_group} x{self.units_required} | "
            f"{self.patient} | "
            f"{self.status} | {self.priority}"
        )
