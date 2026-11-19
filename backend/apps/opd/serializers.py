"""
apps/opd/serializers.py
========================
Serializers for Token generation and Queue tracking.
"""

from rest_framework import serializers
from django.utils import timezone
from django.db.models import Max
from .models import Token, Queue
from apps.accounts.models import Doctor, Patient, Department


class TokenSerializer(serializers.ModelSerializer):
    """
    Detailed Token representation for Patient, Doctor, and Reception.
    Computes real-time queue position and estimated wait time.
    """
    patient_name = serializers.SerializerMethodField()
    patient_code = serializers.CharField(source='patient.patient_id', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    room_number = serializers.CharField(source='doctor.room_number', read_only=True)
    avg_consult_minutes = serializers.IntegerField(source='doctor.avg_consult_minutes', read_only=True)
    queue_position = serializers.SerializerMethodField()
    tokens_ahead = serializers.SerializerMethodField()
    estimated_wait_minutes = serializers.SerializerMethodField()
    approx_waiting_time = serializers.SerializerMethodField()
    current_serving_token = serializers.SerializerMethodField()
    qr_data = serializers.SerializerMethodField()

    class Meta:
        model = Token
        fields = [
            'id', 'token_code', 'token_number', 'patient', 'patient_name',
            'patient_code', 'doctor', 'doctor_name', 'department',
            'department_name', 'room_number', 'avg_consult_minutes',
            'appointment_date', 'status', 'priority', 'symptoms',
            'is_emergency', 'queue_position', 'tokens_ahead',
            'estimated_wait_minutes', 'approx_waiting_time',
            'current_serving_token', 'qr_data', 'created_at'
        ]
        read_only_fields = ['id', 'token_code', 'token_number', 'created_at']

    def get_patient_name(self, obj):
        return obj.patient.user.get_full_name() or obj.patient.user.username

    def get_doctor_name(self, obj):
        full_name = obj.doctor.user.get_full_name()
        return f"Dr. {full_name}" if full_name else f"Dr. {obj.doctor.user.username}"

    def get_department_name(self, obj):
        if obj.department:
            return obj.department.name
        if obj.doctor and obj.doctor.department:
            return obj.doctor.department.name
        return 'General'

    def get_tokens_ahead(self, obj):
        """
        Exact count of patients waiting ahead of this token.
        0 means this patient is currently next in line!
        """
        if obj.status != 'waiting':
            return 0

        return Token.objects.filter(
            doctor=obj.doctor,
            appointment_date=obj.appointment_date,
            status='waiting',
            token_number__lt=obj.token_number
        ).count()

    def get_queue_position(self, obj):
        """
        Position in line (1 = next, 2 = 2nd in line, etc.)
        """
        if obj.status != 'waiting':
            return 0
        return self.get_tokens_ahead(obj) + 1

    def get_approx_waiting_time(self, obj):
        """
        Approx waiting time = tokens ahead x doctor avg consultation time.
        """
        if obj.status != 'waiting':
            return 0
        ahead = self.get_tokens_ahead(obj)
        avg_mins = obj.doctor.avg_consult_minutes or 15
        return ahead * avg_mins

    def get_estimated_wait_minutes(self, obj):
        return self.get_approx_waiting_time(obj)

    def get_qr_data(self, obj):
        return (
            f"SMARTCARE-TOKEN:{obj.token_code}|"
            f"PATIENT:{obj.patient.patient_id}|"
            f"DOCTOR:Dr.{obj.doctor.user.last_name}|"
            f"ROOM:{obj.doctor.room_number}|"
            f"DATE:{obj.appointment_date}|"
            f"PRIORITY:{obj.priority.upper()}"
        )

    def get_current_serving_token(self, obj):
        """
        Fetches the token currently in consultation for this doctor today.
        """
        queue = Queue.objects.filter(
            doctor=obj.doctor,
            queue_date=obj.appointment_date
        ).first()
        return queue.current_token if queue else 0


class TokenGenerateSerializer(serializers.ModelSerializer):
    """
    Handles Token creation logic:
      - Validates doctor availability
      - Prevents duplicate active booking on same day
      - Automatically generates next sequential token_number (e.g. 1, 2, 3)
      - Formats token_code (e.g. MED-001, CAR-002)
      - Sets status to 'waiting'
      - Sets priority: Normal, Senior Citizen, Emergency
      - Updates doctor's Queue table
    """
    doctor = serializers.PrimaryKeyRelatedField(queryset=Doctor.objects.all())
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.all(), required=False)
    appointment_date = serializers.DateField(required=False, default=timezone.now().date)
    priority = serializers.ChoiceField(choices=Token.PRIORITY_CHOICES, default='normal')
    symptoms = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = Token
        fields = [
            'id', 'doctor', 'patient', 'appointment_date',
            'priority', 'symptoms', 'token_code', 'token_number', 'status'
        ]
        read_only_fields = ['id', 'token_code', 'token_number', 'status']

    def validate(self, attrs):
        request = self.context.get('request')
        doctor = attrs.get('doctor')
        appointment_date = attrs.get('appointment_date', timezone.now().date())

        # Check doctor is available
        if not doctor.is_available:
            raise serializers.ValidationError({"doctor": f"Dr. {doctor.user.last_name} is currently off duty."})

        # Determine patient
        patient = attrs.get('patient')
        if not patient and request and hasattr(request.user, 'patient_profile'):
            patient = request.user.patient_profile
            attrs['patient'] = patient

        if not patient:
            raise serializers.ValidationError({"patient": "Patient profile not found. Are you logged in as a Patient?"})

        # Check for duplicate active booking for same doctor on same date
        existing_token = Token.objects.filter(
            patient=patient,
            doctor=doctor,
            appointment_date=appointment_date,
            status__in=['waiting', 'in_progress']
        ).first()

        if existing_token:
            raise serializers.ValidationError({
                "non_field_errors": [
                    f"You already have an active token ({existing_token.token_code}) for Dr. {doctor.user.last_name} today."
                ]
            })

        return attrs

    def create(self, validated_data):
        doctor = validated_data['doctor']
        patient = validated_data['patient']
        appointment_date = validated_data.get('appointment_date', timezone.now().date())
        priority = validated_data.get('priority', 'normal')
        symptoms = validated_data.get('symptoms', '')

        # 1. Calculate next sequential token number for this doctor on this date
        last_token_num = Token.objects.filter(
            doctor=doctor,
            appointment_date=appointment_date
        ).aggregate(Max('token_number'))['token_number__max'] or 0

        next_number = last_token_num + 1

        # 2. Derive prefix from Department (e.g. Cardiology -> CAR, Medicine -> MED)
        dept = doctor.department
        dept_name = dept.name if dept else 'OPD'
        prefix = dept_name[:3].upper() if len(dept_name) >= 3 else 'MED'
        token_code = f"{prefix}-{next_number:03d}"

        # 3. Create Token
        token = Token.objects.create(
            patient=patient,
            doctor=doctor,
            department=dept,
            token_number=next_number,
            token_code=token_code,
            appointment_date=appointment_date,
            status='waiting',
            priority=priority,
            symptoms=symptoms,
            is_emergency=(priority == 'emergency')
        )

        # 4. Synchronize doctor's Queue table for this date
        queue, _ = Queue.objects.get_or_create(
            doctor=doctor,
            queue_date=appointment_date,
            defaults={
                'avg_consult_minutes': doctor.avg_consult_minutes or 15,
                'total_tokens': 0,
                'current_token': 0,
            }
        )
        queue.total_tokens = next_number
        queue.save()

        return token
