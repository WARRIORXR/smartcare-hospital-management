"""
apps/beds/serializers.py
========================
Serializers for Ward and Bed management.
"""

from rest_framework import serializers
from .models import Ward, Bed, Admission


class BedSerializer(serializers.ModelSerializer):
    """
    Serializer for individual beds in a ward.
    Includes human-readable ward and status labels.
    """
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    ward_type = serializers.CharField(source='ward.ward_type', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    current_patient_name = serializers.SerializerMethodField()

    class Meta:
        model = Bed
        fields = [
            'id',
            'ward',
            'ward_name',
            'ward_type',
            'bed_number',
            'status',
            'status_display',
            'has_oxygen',
            'has_ventilator',
            'has_monitor',
            'current_patient_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_current_patient_name(self, obj):
        """If bed is occupied, return current patient's name if admission exists."""
        if obj.status == 'occupied':
            admission = obj.admissions.filter(status='admitted').first()
            if admission and admission.patient and admission.patient.user:
                return admission.patient.user.get_full_name() or admission.patient.user.username
        return None

    def validate_bed_number(self, value):
        """Clean and uppercase bed number, e.g. 'gen-101' -> 'GEN-101'."""
        return value.strip().upper()


class WardSerializer(serializers.ModelSerializer):
    """
    Serializer for hospital wards.
    Includes bed statistics (total, available, occupied, cleaning).
    """
    ward_type_display = serializers.CharField(source='get_ward_type_display', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    
    # Real-time computed bed counts
    total_beds_count = serializers.SerializerMethodField()
    available_beds_count = serializers.SerializerMethodField()
    occupied_beds_count = serializers.SerializerMethodField()
    cleaning_beds_count = serializers.SerializerMethodField()
    beds = BedSerializer(many=True, read_only=True)

    class Meta:
        model = Ward
        fields = [
            'id',
            'name',
            'ward_type',
            'ward_type_display',
            'department',
            'department_name',
            'total_beds',
            'floor_number',
            'is_active',
            'total_beds_count',
            'available_beds_count',
            'occupied_beds_count',
            'cleaning_beds_count',
            'beds',
            'created_at',
        ]
        read_only_fields = ['created_at']

    def get_total_beds_count(self, obj):
        return obj.beds.count()

    def get_available_beds_count(self, obj):
        return obj.beds.filter(status='available').count()

    def get_occupied_beds_count(self, obj):
        return obj.beds.filter(status='occupied').count()

    def get_cleaning_beds_count(self, obj):
        return obj.beds.filter(status='cleaning').count()


class BedStatusUpdateSerializer(serializers.ModelSerializer):
    """
    Dedicated serializer for fast status updates (e.g. from the React tile grid).
    """
    class Meta:
        model = Bed
        fields = ['status']


class AdmissionSerializer(serializers.ModelSerializer):
    """
    Serializer for Patient Admission into a Bed.
    """
    patient_name = serializers.SerializerMethodField()
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True)
    ward_name = serializers.CharField(source='bed.ward.name', read_only=True)
    attending_doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Admission
        fields = [
            'id',
            'patient',
            'patient_name',
            'bed',
            'bed_number',
            'ward_name',
            'attending_doctor',
            'attending_doctor_name',
            'diagnosis',
            'admission_date',
            'discharge_date',
            'status',
            'discharge_notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['admission_date', 'created_at', 'updated_at']

    def get_patient_name(self, obj):
        if obj.patient and obj.patient.user:
            return obj.patient.user.get_full_name() or obj.patient.user.username
        return 'Unknown'

    def get_attending_doctor_name(self, obj):
        if obj.attending_doctor and obj.attending_doctor.user:
            return f"Dr. {obj.attending_doctor.user.get_full_name() or obj.attending_doctor.user.username}"
        return 'Not Assigned'
