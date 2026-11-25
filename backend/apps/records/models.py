"""
apps/records/models.py
======================
Clinical Medical Records: Visit Notes, Structured Prescriptions, and Lab Report Uploads.
"""

import os
from django.core.exceptions import ValidationError
from django.db import models
from apps.accounts.models import Patient, Doctor, User


def validate_report_file(value):
    """Allow safe document/image formats up to 5 MB."""
    ext = os.path.splitext(value.name)[1].lower()
    allowed_exts = ['.pdf', '.png', '.jpg', '.jpeg', '.txt']
    if ext not in allowed_exts:
        raise ValidationError(
            f"Unsupported file type '{ext}'. Allowed formats: {', '.join(allowed_exts)}"
        )
    max_size = 5 * 1024 * 1024  # 5 MB
    if value.size > max_size:
        raise ValidationError("Lab report file size cannot exceed 5 MB.")


class MedicalRecord(models.Model):
    RECORD_TYPE_CHOICES = [
        ('visit_note',   'Visit Note'),
        ('prescription', 'Prescription'),
        ('lab_report',   'Lab Report'),
    ]

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='medical_records'
    )
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='medical_records'
    )
    token = models.ForeignKey(
        'opd.Token',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='medical_records'
    )
    admission = models.ForeignKey(
        'beds.Admission',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='medical_records'
    )
    record_type = models.CharField(
        max_length=20,
        choices=RECORD_TYPE_CHOICES,
        default='visit_note'
    )
    title = models.CharField(max_length=200)
    diagnosis = models.CharField(max_length=255, blank=True)
    visit_notes = models.TextField(blank=True)
    prescription_items = models.JSONField(default=list, blank=True)
    attachment = models.FileField(
        upload_to='lab_reports/%Y/%m/',
        null=True,
        blank=True,
        validators=[validate_report_file]
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_medical_records'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'medical_records'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.get_record_type_display()}] {self.title} - {self.patient}"
