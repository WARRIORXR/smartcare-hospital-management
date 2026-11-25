"""
apps/accounts/serializers.py
=============================
Serializers for JWT auth, strict patient self-registration, password reset,
hospital staff provisioning, doctor leave/feedback, and audit logs.
"""

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Avg
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User, Patient, Doctor, Department, DoctorLeave, DoctorFeedback, AuditLog


# ─────────────────────────────────────────────
# 1. Custom Token Serializer (Login)
# ─────────────────────────────────────────────
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT serializer adding user role and profile summary.
    Enforces ALLOW_DEMO_ADMIN guard so default weak admin credentials
    cannot log in on production deployments.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        token['name'] = user.get_full_name() or user.username
        token['email'] = user.email
        return token

    def validate(self, attrs):
        raw_password = attrs.get('password', '')
        data = super().validate(attrs)

        # Safety barrier: refuse stale default admin123 demo password when demo admin is disabled
        if (
            not getattr(settings, 'ALLOW_DEMO_ADMIN', False)
            and (self.user.role == 'admin' or self.user.is_staff)
            and raw_password == 'admin123'
        ):
            raise AuthenticationFailed(
                'Demo administrator credentials are disabled in this environment.'
            )

        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'role': self.user.role,
            'phone': self.user.phone,
            'is_staff': self.user.is_staff,
        }

        if self.user.role == 'patient' and hasattr(self.user, 'patient_profile'):
            data['user']['patient_id'] = self.user.patient_profile.patient_id
            data['user']['patient_profile_id'] = self.user.patient_profile.id
            data['user']['blood_group'] = self.user.patient_profile.blood_group

        if self.user.role == 'doctor' and hasattr(self.user, 'doctor_profile'):
            data['user']['doctor_profile_id'] = self.user.doctor_profile.id
            data['user']['specialization'] = self.user.doctor_profile.specialization
            data['user']['room_number'] = self.user.doctor_profile.room_number
            data['user']['avg_consult_minutes'] = self.user.doctor_profile.avg_consult_minutes

        return data


# ─────────────────────────────────────────────
# 2. User & Staff Serializers
# ─────────────────────────────────────────────
class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'full_name', 'role', 'phone', 'is_active', 'date_joined'
        ]
        read_only_fields = ['id', 'date_joined']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class AdminStaffCreateSerializer(serializers.ModelSerializer):
    """Admin-only serializer for provisioning Reception, Blood Bank, Doctor, or Admin accounts."""
    password = serializers.CharField(write_only=True, required=True)
    role = serializers.ChoiceField(choices=User.ROLE_CHOICES)
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )
    specialization = serializers.CharField(required=False, allow_blank=True, default='')
    room_number = serializers.CharField(required=False, allow_blank=True, default='Room 101')

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'first_name', 'last_name',
            'phone', 'role', 'department', 'specialization', 'room_number'
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        validate_password(attrs['password'])
        if User.objects.filter(email__iexact=attrs.get('email', '')).exists():
            raise serializers.ValidationError({'email': 'A user with this email already exists.'})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        dept = validated_data.pop('department', None)
        spec = validated_data.pop('specialization', '')
        room = validated_data.pop('room_number', 'Room 101')
        role = validated_data['role']

        user = User(**validated_data)
        if role == 'admin':
            user.is_staff = True
        user.set_password(password)
        user.save()

        if role == 'doctor':
            Doctor.objects.create(
                user=user,
                department=dept,
                specialization=spec,
                room_number=room,
            )
        elif role == 'patient':
            Patient.objects.create(user=user, patient_id=f'PAT-{user.id:04d}')
        return user


# ─────────────────────────────────────────────
# 3. Patient Profile Serializer
# ─────────────────────────────────────────────
class PatientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'user', 'patient_id', 'date_of_birth', 'gender',
            'blood_group', 'address', 'emergency_contact_name',
            'emergency_contact_phone', 'created_at'
        ]
        read_only_fields = ['id', 'patient_id', 'created_at']


# ─────────────────────────────────────────────
# 4. Department Serializer (CRUD for Admin)
# ─────────────────────────────────────────────
class DepartmentSerializer(serializers.ModelSerializer):
    doctor_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = ['id', 'name', 'description', 'is_active', 'created_at', 'doctor_count']
        read_only_fields = ['id', 'created_at', 'doctor_count']

    def get_doctor_count(self, obj):
        return obj.doctors.count()


# ─────────────────────────────────────────────
# 5. Doctor Leave & Feedback Serializers
# ─────────────────────────────────────────────
class DoctorLeaveSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = DoctorLeave
        fields = ['id', 'doctor', 'doctor_name', 'start_date', 'end_date', 'reason', 'is_approved', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'doctor': {'required': False}}

    def get_doctor_name(self, obj):
        return f"Dr. {obj.doctor.user.get_full_name() or obj.doctor.user.username}"

    def validate(self, attrs):
        start = attrs.get('start_date')
        end = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        return attrs


class DoctorFeedbackSerializer(serializers.ModelSerializer):
    patient_display = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    token_code = serializers.CharField(source='token.token_code', read_only=True)

    class Meta:
        model = DoctorFeedback
        fields = [
            'id', 'doctor', 'doctor_name', 'patient', 'patient_display',
            'token', 'token_code', 'rating', 'comment', 'created_at'
        ]
        read_only_fields = ['id', 'patient', 'created_at']

    def get_patient_display(self, obj):
        first = obj.patient.user.first_name or 'Patient'
        return f"{first} ({obj.patient.patient_id or 'Verified'})"

    def get_doctor_name(self, obj):
        return f"Dr. {obj.doctor.user.get_full_name() or obj.doctor.user.username}"


# ─────────────────────────────────────────────
# 6. Doctor Profile & Detail Serializer
# ─────────────────────────────────────────────
class DoctorDetailSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source='department.name', read_only=True)

    waiting_patients_count = serializers.SerializerMethodField()
    estimated_wait_time = serializers.SerializerMethodField()
    today_total_tokens = serializers.SerializerMethodField()
    current_serving_token = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    feedback_count = serializers.SerializerMethodField()
    upcoming_leaves = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            'id', 'user_id', 'username', 'first_name', 'last_name', 'doctor_name',
            'department', 'department_name', 'specialization',
            'qualification', 'experience_years', 'consultation_fee',
            'room_number', 'avg_consult_minutes', 'available_days',
            'is_available', 'waiting_patients_count', 'estimated_wait_time',
            'today_total_tokens', 'current_serving_token',
            'average_rating', 'feedback_count', 'upcoming_leaves', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_doctor_name(self, obj):
        full_name = obj.user.get_full_name()
        return f"Dr. {full_name}" if full_name else f"Dr. {obj.user.username}"

    def get_waiting_patients_count(self, obj):
        from apps.opd.models import Token
        today = timezone.now().date()
        return Token.objects.filter(doctor=obj, appointment_date=today, status='waiting').count()

    def get_estimated_wait_time(self, obj):
        waiting_count = self.get_waiting_patients_count(obj)
        avg_mins = obj.avg_consult_minutes or 15
        return waiting_count * avg_mins

    def get_today_total_tokens(self, obj):
        from apps.opd.models import Queue
        today = timezone.now().date()
        queue = Queue.objects.filter(doctor=obj, queue_date=today).first()
        return queue.total_tokens if queue else 0

    def get_current_serving_token(self, obj):
        from apps.opd.models import Queue
        today = timezone.now().date()
        queue = Queue.objects.filter(doctor=obj, queue_date=today).first()
        return queue.current_token if queue else 0

    def get_average_rating(self, obj):
        avg = obj.feedbacks.aggregate(avg=Avg('rating'))['avg']
        return round(float(avg), 1) if avg is not None else None

    def get_feedback_count(self, obj):
        return obj.feedbacks.count()

    def get_upcoming_leaves(self, obj):
        today = timezone.now().date()
        leaves = obj.leaves.filter(end_date__gte=today, is_approved=True)[:5]
        return [
            {'id': l.id, 'start_date': l.start_date, 'end_date': l.end_date, 'reason': l.reason}
            for l in leaves
        ]


class DoctorProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Doctor
        fields = [
            'id', 'user', 'department', 'department_name', 'specialization',
            'qualification', 'experience_years', 'consultation_fee',
            'room_number', 'avg_consult_minutes', 'available_days', 'is_available'
        ]
        read_only_fields = ['id']


# ─────────────────────────────────────────────
# 7. Doctor Management Serializer (Admin Create/Update)
# ─────────────────────────────────────────────
class DoctorManageSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    email = serializers.EmailField(write_only=True, required=False)
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Doctor
        fields = [
            'id', 'department', 'specialization', 'qualification',
            'experience_years', 'consultation_fee', 'room_number',
            'avg_consult_minutes', 'available_days', 'is_available',
            'username', 'password', 'email', 'first_name', 'last_name', 'phone'
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        username = validated_data.pop('username', None)
        password = validated_data.pop('password', None)
        email = validated_data.pop('email', f"{username}@hospital.local")
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        phone = validated_data.pop('phone', '')

        if not username:
            raise serializers.ValidationError({"username": "Username is required to create a doctor."})
        if not password:
            raise serializers.ValidationError({"password": "A strong password is required to create a doctor."})
        validate_password(password)

        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({"username": "This username already exists."})

        user = User.objects.create(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            role='doctor'
        )
        user.set_password(password)
        user.save()

        doctor = Doctor.objects.create(user=user, **validated_data)
        return doctor

    def update(self, instance, validated_data):
        user = instance.user
        if 'first_name' in validated_data:
            user.first_name = validated_data.pop('first_name')
        if 'last_name' in validated_data:
            user.last_name = validated_data.pop('last_name')
        if 'email' in validated_data:
            user.email = validated_data.pop('email')
        if 'phone' in validated_data:
            user.phone = validated_data.pop('phone')
        if 'password' in validated_data:
            new_pw = validated_data.pop('password')
            validate_password(new_pw, user)
            user.set_password(new_pw)
        user.save()

        validated_data.pop('username', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# ─────────────────────────────────────────────
# 8. Strict Patient Self-Registration Serializer
# ─────────────────────────────────────────────
class RegisterSerializer(serializers.ModelSerializer):
    """
    Public self-registration is strictly restricted to the 'patient' role
    and enforces strong password complexity rules.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
    )
    role = serializers.CharField(required=False, default='patient')
    gender = serializers.CharField(required=False, allow_blank=True)
    blood_group = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone', 'role',
            'gender', 'blood_group', 'date_of_birth', 'address',
        ]

    def validate(self, attrs):
        requested_role = attrs.get('role', 'patient')
        if requested_role and requested_role != 'patient':
            raise serializers.ValidationError({
                "role": "Public registration is restricted to patients only. Staff accounts must be created by an administrator."
            })

        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError({"password": "Passwords do not match."})

        # Enforce Django's strong password validators + custom complexity rules
        candidate_user = User(
            username=attrs.get('username', ''),
            email=attrs.get('email', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        try:
            validate_password(attrs['password'], user=candidate_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        email = attrs.get('email')
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "A user with this email already exists."})

        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        validated_data.pop('role', None)
        password = validated_data.pop('password')

        gender = validated_data.pop('gender', '')
        blood_group = validated_data.pop('blood_group', '')
        date_of_birth = validated_data.pop('date_of_birth', None)
        address = validated_data.pop('address', '')

        user = User(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role='patient',
        )
        user.set_password(password)
        user.save()

        Patient.objects.create(
            user=user,
            patient_id=f"PAT-{user.id:04d}",
            gender=gender,
            blood_group=blood_group,
            date_of_birth=date_of_birth,
            address=address,
        )
        return user


# ─────────────────────────────────────────────
# 9. Password Reset & AuditLog Serializers
# ─────────────────────────────────────────────
class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(write_only=True, required=True)
    confirm_password = serializers.CharField(write_only=True, required=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'new_password': 'Passwords do not match.'})
        try:
            validate_password(attrs['new_password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)})
        return attrs


class AuditLogSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source='patient.patient_id', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'actor', 'actor_username', 'actor_role', 'action',
            'resource_type', 'resource_id', 'patient', 'patient_code',
            'ip_address', 'user_agent', 'details', 'created_at'
        ]
        read_only_fields = fields
