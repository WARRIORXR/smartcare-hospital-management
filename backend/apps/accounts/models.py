"""
apps/accounts/models.py
------------------------
Minimal User model stub so Django can start up during setup.
Full implementation comes in Step 2.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom User model extending Django's built-in AbstractUser.
    We add a 'role' field to distinguish between user types.
    Full fields will be added in Step 2.
    """
    # User role choices
    ROLE_CHOICES = [
        ('patient', 'Patient'),
        ('doctor', 'Doctor'),
        ('reception', 'Reception'),
        ('bloodbank_staff', 'Blood Bank Staff'),
        ('admin', 'Admin'),
    ]
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='patient'
    )

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f"{self.username} ({self.role})"
