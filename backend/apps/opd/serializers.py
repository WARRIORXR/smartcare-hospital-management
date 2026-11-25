"""
apps/opd/serializers.py
========================
Serializers for OPD Tokens, Advance Appointments, Public Queue Display (PII-free),
and SMS / WhatsApp / In-App Queue Proximity Notifications.
"""

from django.db.models import Max
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Doctor, DoctorLeave, Patient
from .models import Notification, Queue, Token


STANDARD_TIME_SLOTS = [
    '09:00 AM - 09:30 AM',
    '09:30 AM - 10:00 AM',
    '10:00 AM - 10:30 AM',
    '10:30 AM - 11:00 AM',
    '11:00 AM - 11:30 AM',
    '11:30 AM - 12:00 PM',
    '02:00 PM - 02:30 PM',
    '02:30 PM - 03:00 PM',
    '03:00 PM - 03:30 PM',
    '03:30 PM - 04:00 PM',
]


class TokenSerializer(serializers.ModelSerializer):
    """Detailed Token representation for Patient (own tokens), Doctor, Reception, and Admin."""

    patient_name = serializers.SerializerMethodField()
    patient_code = serializers.CharField(source='patient.patient_id', read_only=True)
    patient_blood_group = serializers.CharField(source='patient.blood_group', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)
    patient_phone = serializers.CharField(source='patient.user.phone', read_only=True)
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
    active_admission = serializers.SerializerMethodField()
    has_feedback = serializers.SerializerMethodField()

    class Meta:
        model = Token
        fields = [
            'id', 'token_code', 'token_number', 'patient', 'patient_name',
            'patient_code', 'patient_blood_group', 'patient_gender', 'patient_phone',
            'doctor', 'doctor_name', 'department', 'department_name', 'room_number',
            'avg_consult_minutes', 'appointment_date', 'time_slot', 'is_advance_booking',
            'status', 'priority', 'symptoms', 'is_emergency', 'queue_position',
            'tokens_ahead', 'estimated_wait_minutes', 'approx_waiting_time',
            'current_serving_token', 'qr_data', 'active_admission', 'has_feedback',
            'created_at',
        ]
        read_only_fields = ['id', 'token_code', 'token_number', 'created_at']

    def get_active_admission(self, obj):
        try:
            from apps.beds.models import Admission
            adm = Admission.objects.select_related('bed__ward').filter(
                patient=obj.patient, status='admitted'
            ).order_by('-admission_date').first()
            if adm:
                return {
                    'admission_id': adm.id,
                    'ward_name': adm.bed.ward.name if adm.bed and adm.bed.ward else '',
                    'bed_number': adm.bed.bed_number if adm.bed else '',
                    'admission_date': adm.admission_date.isoformat() if adm.admission_date else None,
                }
        except Exception:
            pass
        return None

    def get_has_feedback(self, obj):
        return hasattr(obj, 'feedback')

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
        if obj.status != 'waiting':
            return 0
        return Token.objects.filter(
            doctor=obj.doctor,
            appointment_date=obj.appointment_date,
            status='waiting',
            token_number__lt=obj.token_number
        ).count()

    def get_queue_position(self, obj):
        if obj.status != 'waiting':
            return 0
        return self.get_tokens_ahead(obj) + 1

    def get_approx_waiting_time(self, obj):
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
            f"SLOT:{obj.time_slot or 'WALKIN'}|"
            f"PRIORITY:{obj.priority.upper()}"
        )

    def get_current_serving_token(self, obj):
        queue = Queue.objects.filter(
            doctor=obj.doctor,
            queue_date=obj.appointment_date
        ).first()
        return queue.current_token if queue else 0


class PublicDisplayTokenSerializer(serializers.ModelSerializer):
    """Sanitized display serializer that omits patient PII (name, phone, symptoms) from waiting screens."""

    room_number = serializers.CharField(source='doctor.room_number', read_only=True)
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Token
        fields = [
            'id', 'token_code', 'token_number', 'doctor_name',
            'room_number', 'priority', 'status', 'time_slot', 'appointment_date',
        ]

    def get_doctor_name(self, obj):
        full_name = obj.doctor.user.get_full_name()
        return f"Dr. {full_name}" if full_name else f"Dr. {obj.doctor.user.username}"


class TokenGenerateSerializer(serializers.ModelSerializer):
    """Handles immediate walk-in OPD tokens AND advance scheduled appointments."""

    doctor = serializers.PrimaryKeyRelatedField(queryset=Doctor.objects.all())
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.all(), required=False)
    appointment_date = serializers.DateField(required=False)
    time_slot = serializers.CharField(required=False, allow_blank=True, default='')
    priority = serializers.ChoiceField(choices=Token.PRIORITY_CHOICES, default='normal')
    symptoms = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = Token
        fields = [
            'id', 'doctor', 'patient', 'appointment_date', 'time_slot',
            'is_advance_booking', 'priority', 'symptoms',
            'token_code', 'token_number', 'status',
        ]
        read_only_fields = ['id', 'token_code', 'token_number', 'status', 'is_advance_booking']

    def validate(self, attrs):
        request = self.context.get('request')
        doctor = attrs.get('doctor')
        today = timezone.now().date()
        appointment_date = attrs.get('appointment_date') or today
        attrs['appointment_date'] = appointment_date

        if appointment_date < today:
            raise serializers.ValidationError({"appointment_date": "Cannot book appointments in the past."})

        if (appointment_date - today).days > 30:
            raise serializers.ValidationError({"appointment_date": "Advance bookings can be made up to 30 days ahead."})

        # Check doctor leave schedule
        on_leave = DoctorLeave.objects.filter(
            doctor=doctor,
            is_approved=True,
            start_date__lte=appointment_date,
            end_date__gte=appointment_date,
        ).first()
        if on_leave:
            raise serializers.ValidationError({
                "appointment_date": f"Dr. {doctor.user.last_name} is on scheduled leave on {appointment_date}."
            })

        # For same-day walk-in queue, doctor must currently be on duty
        if appointment_date == today and not doctor.is_available:
            raise serializers.ValidationError({"doctor": f"Dr. {doctor.user.last_name} is currently off duty."})

        # Enforce strict object-level ownership on patient resolution
        patient = attrs.get('patient')
        if request and getattr(request.user, 'role', '') == 'patient':
            if not hasattr(request.user, 'patient_profile'):
                raise serializers.ValidationError({"patient": "Patient profile not found."})
            own_profile = request.user.patient_profile
            if patient and patient.id != own_profile.id:
                raise serializers.ValidationError({"patient": "You may only book tokens for your own patient profile."})
            patient = own_profile
            attrs['patient'] = patient
        elif not patient and request and hasattr(request.user, 'patient_profile'):
            patient = request.user.patient_profile
            attrs['patient'] = patient

        if not patient:
            raise serializers.ValidationError({"patient": "Patient profile is required."})

        # Prevent duplicate active booking for same doctor on same date
        existing_token = Token.objects.filter(
            patient=patient,
            doctor=doctor,
            appointment_date=appointment_date,
            status__in=['waiting', 'called', 'in_progress']
        ).first()

        if existing_token:
            raise serializers.ValidationError({
                "non_field_errors": [
                    f"An active appointment ({existing_token.token_code}) already exists with Dr. {doctor.user.last_name} on {appointment_date}."
                ]
            })

        # Limit bookings per advance time slot to max 4 patients per 30-min window
        time_slot = (attrs.get('time_slot') or '').strip()
        attrs['time_slot'] = time_slot
        if time_slot:
            slot_count = Token.objects.filter(
                doctor=doctor,
                appointment_date=appointment_date,
                time_slot=time_slot,
            ).exclude(status__in=['cancelled', 'skipped']).count()
            if slot_count >= 4:
                raise serializers.ValidationError({"time_slot": f"Time slot {time_slot} is fully booked."})

        return attrs

    def create(self, validated_data):
        doctor = validated_data['doctor']
        patient = validated_data['patient']
        today = timezone.now().date()
        appointment_date = validated_data.get('appointment_date', today)
        time_slot = validated_data.get('time_slot', '')
        priority = validated_data.get('priority', 'normal')
        symptoms = validated_data.get('symptoms', '')

        last_token_num = Token.objects.filter(
            doctor=doctor,
            appointment_date=appointment_date
        ).aggregate(Max('token_number'))['token_number__max'] or 0

        next_number = last_token_num + 1
        dept = doctor.department
        dept_name = dept.name if dept else 'OPD'
        prefix = dept_name[:3].upper() if len(dept_name) >= 3 else 'MED'
        token_code = f"{prefix}-{next_number:03d}"

        token = Token.objects.create(
            patient=patient,
            doctor=doctor,
            department=dept,
            token_number=next_number,
            token_code=token_code,
            appointment_date=appointment_date,
            time_slot=time_slot,
            is_advance_booking=(appointment_date > today or bool(time_slot)),
            status='waiting',
            priority=priority,
            symptoms=symptoms,
            is_emergency=(priority == 'emergency')
        )

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


class NotificationSerializer(serializers.ModelSerializer):
    token_code = serializers.CharField(source='token.token_code', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'token', 'token_code', 'channel', 'trigger_event',
            'recipient_phone', 'title', 'message', 'status', 'is_read', 'created_at'
        ]
        read_only_fields = fields
