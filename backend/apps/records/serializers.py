"""
apps/records/serializers.py
===========================
Serializers for Clinical Visit Notes, Prescriptions, and Lab Report Uploads.
"""

import json
import os
from rest_framework import serializers
from .models import MedicalRecord


class MedicalRecordSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_code = serializers.CharField(source='patient.patient_id', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    record_type_display = serializers.CharField(source='get_record_type_display', read_only=True)
    has_attachment = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()

    class Meta:
        model = MedicalRecord
        fields = [
            'id', 'patient', 'patient_name', 'patient_code',
            'doctor', 'doctor_name', 'token', 'admission',
            'record_type', 'record_type_display', 'title',
            'diagnosis', 'visit_notes', 'prescription_items',
            'attachment', 'has_attachment', 'attachment_name',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'doctor', 'created_by', 'created_at', 'updated_at']

    def get_patient_name(self, obj):
        return obj.patient.user.get_full_name() or obj.patient.user.username

    def get_doctor_name(self, obj):
        if obj.doctor and obj.doctor.user:
            return f"Dr. {obj.doctor.user.get_full_name() or obj.doctor.user.username}"
        return 'Hospital Clinician'

    def get_has_attachment(self, obj):
        return bool(obj.attachment)

    def get_attachment_name(self, obj):
        if obj.attachment and obj.attachment.name:
            return os.path.basename(obj.attachment.name)
        return None

    def validate_prescription_items(self, value):
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                raise serializers.ValidationError("prescription_items must be valid JSON array.")
            value = parsed
        if not isinstance(value, list):
            raise serializers.ValidationError("prescription_items must be a list of medication entries.")
        return value
