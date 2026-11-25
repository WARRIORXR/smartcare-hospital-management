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
    current_patient_id = serializers.SerializerMethodField()
    current_patient_blood_group = serializers.SerializerMethodField()
    current_admission_id = serializers.SerializerMethodField()

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
            'current_patient_id',
            'current_patient_blood_group',
            'current_admission_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def _can_view_patient_pii(self):
        request = self.context.get('request') if self.context else None
        if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
            return False
        user = request.user
        return user.role in ['admin', 'doctor', 'reception'] or user.is_staff or user.is_superuser

    def get_current_patient_name(self, obj):
        """If bed is occupied, return current patient's name only for authorized clinical staff."""
        if obj.status == 'occupied' and self._can_view_patient_pii():
            admission = obj.admissions.filter(status='admitted').first()
            if admission and admission.patient and admission.patient.user:
                return admission.patient.user.get_full_name() or admission.patient.user.username
        return None

    def get_current_patient_id(self, obj):
        """If bed is occupied, return patient ID only for authorized clinical staff."""
        if obj.status == 'occupied' and self._can_view_patient_pii():
            admission = obj.admissions.filter(status='admitted').first()
            if admission and admission.patient:
                return admission.patient.id
        return None

    def get_current_patient_blood_group(self, obj):
        """If bed is occupied, return patient's blood group only for authorized clinical staff."""
        if obj.status == 'occupied' and self._can_view_patient_pii():
            admission = obj.admissions.filter(status='admitted').first()
            if admission and admission.patient:
                return admission.patient.blood_group
        return None

    def get_current_admission_id(self, obj):
        """If bed is occupied, return active admission ID only for authorized clinical staff."""
        if obj.status == 'occupied' and self._can_view_patient_pii():
            admission = obj.admissions.filter(status='admitted').first()
            if admission:
                return admission.id
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
    patient_id = serializers.IntegerField(source='patient.id', read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_code = serializers.SerializerMethodField()
    patient_phone = serializers.SerializerMethodField()
    patient_gender = serializers.SerializerMethodField()
    patient_blood_group = serializers.SerializerMethodField()
    bed_number = serializers.CharField(source='bed.bed_number', read_only=True)
    ward_name = serializers.CharField(source='bed.ward.name', read_only=True)
    ward_type = serializers.CharField(source='bed.ward.ward_type', read_only=True)
    attending_doctor_name = serializers.SerializerMethodField()
    token_code = serializers.CharField(source='token.token_code', read_only=True)

    class Meta:
        model = Admission
        fields = [
            'id',
            'patient',
            'patient_id',
            'patient_name',
            'patient_code',
            'patient_phone',
            'patient_gender',
            'patient_blood_group',
            'bed',
            'bed_number',
            'ward_name',
            'ward_type',
            'attending_doctor',
            'attending_doctor_name',
            'token',
            'token_code',
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

    def get_patient_code(self, obj):
        if obj.patient:
            return getattr(obj.patient, 'patient_id', f"PAT-{obj.patient.id:04d}")
        return 'N/A'

    def get_patient_phone(self, obj):
        if obj.patient and obj.patient.user:
            return getattr(obj.patient.user, 'phone', 'N/A')
        return 'N/A'

    def get_patient_gender(self, obj):
        if obj.patient:
            return getattr(obj.patient, 'gender', 'N/A')
        return 'N/A'

    def get_patient_blood_group(self, obj):
        if obj.patient:
            return getattr(obj.patient, 'blood_group', 'N/A')
        return 'N/A'

    def get_attending_doctor_name(self, obj):
        if obj.attending_doctor and obj.attending_doctor.user:
            return f"Dr. {obj.attending_doctor.user.get_full_name() or obj.attending_doctor.user.username}"
        return 'Not Assigned'


class AutoAdmitSerializer(serializers.Serializer):
    """
    Serializer for admitting a patient with auto bed assignment.
    """
    token_id = serializers.IntegerField(required=False, allow_null=True)
    patient_id = serializers.IntegerField(required=False, allow_null=True)
    ward_type = serializers.ChoiceField(choices=Ward.WARD_TYPE_CHOICES, default='general')
    diagnosis = serializers.CharField(required=True, allow_blank=False)
    attending_doctor_id = serializers.IntegerField(required=False, allow_null=True)
    preferred_ward_id = serializers.IntegerField(required=False, allow_null=True)


class DischargeSerializer(serializers.Serializer):
    """
    Serializer for discharging an admitted patient.
    """
    discharge_notes = serializers.CharField(required=False, allow_blank=True, default='')
