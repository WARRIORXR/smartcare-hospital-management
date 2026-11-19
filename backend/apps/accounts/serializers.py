"""
apps/accounts/serializers.py
=============================
Serializers for User authentication, profiles, and Admin management of
Departments and Doctors.
"""

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.password_validation import validate_password
from .models import User, Patient, Doctor, Department


# ─────────────────────────────────────────────
# 1. Custom Token Serializer (Login)
# ─────────────────────────────────────────────
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT serializer that adds user role and details:
      1. Inside the encrypted JWT token payload (claims)
      2. Inside the API response JSON body
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
        data = super().validate(attrs)

        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'role': self.user.role,
            'phone': self.user.phone,
        }

        if self.user.role == 'patient' and hasattr(self.user, 'patient_profile'):
            data['user']['patient_id'] = self.user.patient_profile.patient_id
            data['user']['blood_group'] = self.user.patient_profile.blood_group

        if self.user.role == 'doctor' and hasattr(self.user, 'doctor_profile'):
            data['user']['specialization'] = self.user.doctor_profile.specialization
            data['user']['room_number'] = self.user.doctor_profile.room_number
            data['user']['avg_consult_minutes'] = self.user.doctor_profile.avg_consult_minutes

        return data


# ─────────────────────────────────────────────
# 2. User Serializer
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
# 5. Doctor Profile & Detail Serializer
# ─────────────────────────────────────────────
class DoctorDetailSerializer(serializers.ModelSerializer):
    """
    Rich Doctor details for Patient Directory and Admin view.
    Includes real-time live queue load (how many patients are waiting today).
    """
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    doctor_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    # Live Queue Load fields
    waiting_patients_count = serializers.SerializerMethodField()
    estimated_wait_time = serializers.SerializerMethodField()
    today_total_tokens = serializers.SerializerMethodField()
    current_serving_token = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            'id', 'user_id', 'username', 'first_name', 'last_name', 'doctor_name',
            'email', 'phone', 'department', 'department_name', 'specialization',
            'qualification', 'experience_years', 'consultation_fee',
            'room_number', 'avg_consult_minutes', 'available_days',
            'is_available', 'waiting_patients_count', 'estimated_wait_time',
            'today_total_tokens', 'current_serving_token', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_doctor_name(self, obj):
        full_name = obj.user.get_full_name()
        return f"Dr. {full_name}" if full_name else f"Dr. {obj.user.username}"

    def get_waiting_patients_count(self, obj):
        from apps.opd.models import Token
        from django.utils import timezone
        today = timezone.now().date()
        return Token.objects.filter(doctor=obj, appointment_date=today, status='waiting').count()

    def get_estimated_wait_time(self, obj):
        waiting_count = self.get_waiting_patients_count(obj)
        avg_mins = obj.avg_consult_minutes or 15
        return waiting_count * avg_mins

    def get_today_total_tokens(self, obj):
        from apps.opd.models import Queue
        from django.utils import timezone
        today = timezone.now().date()
        queue = Queue.objects.filter(doctor=obj, queue_date=today).first()
        return queue.total_tokens if queue else 0

    def get_current_serving_token(self, obj):
        from apps.opd.models import Queue
        from django.utils import timezone
        today = timezone.now().date()
        queue = Queue.objects.filter(doctor=obj, queue_date=today).first()
        return queue.current_token if queue else 0


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
# 6. Doctor Management Serializer (Admin Create/Update)
# ─────────────────────────────────────────────
class DoctorManageSerializer(serializers.ModelSerializer):
    """
    Admin serializer to create and update Doctors along with their User account.
    """
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
        password = validated_data.pop('password', 'Doctor@123')
        email = validated_data.pop('email', f"{username}@hospital.local")
        first_name = validated_data.pop('first_name', '')
        last_name = validated_data.pop('last_name', '')
        phone = validated_data.pop('phone', '')

        if not username:
            raise serializers.ValidationError({"username": "Username is required to create a doctor."})

        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError({"username": "This username already exists."})

        # Create doctor user account
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

        # Create doctor profile
        doctor = Doctor.objects.create(user=user, **validated_data)
        return doctor

    def update(self, instance, validated_data):
        # Update linked user fields if provided
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
            user.set_password(validated_data.pop('password'))
        user.save()

        # Discard write-only username if present in update
        validated_data.pop('username', None)

        # Update doctor model fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# ─────────────────────────────────────────────
# 7. Registration Serializer
# ─────────────────────────────────────────────
class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles self-registration for patients, doctors, and admins.
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

    gender = serializers.CharField(required=False, allow_blank=True)
    blood_group = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True)

    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        required=False,
        allow_null=True
    )
    specialization = serializers.CharField(required=False, allow_blank=True)
    qualification = serializers.CharField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(required=False, default=0)
    room_number = serializers.CharField(required=False, allow_blank=True)
    avg_consult_minutes = serializers.IntegerField(required=False, default=15)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone', 'role',
            'gender', 'blood_group', 'date_of_birth', 'address',
            'department', 'specialization', 'qualification', 'experience_years',
            'room_number', 'avg_consult_minutes'
        ]

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError({"password": "Passwords do not match."})

        if len(attrs.get('password')) < 6:
            raise serializers.ValidationError({"password": "Password must be at least 6 characters."})

        email = attrs.get('email')
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"email": "A user with this email already exists."})

        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        password = validated_data.pop('password')

        gender = validated_data.pop('gender', '')
        blood_group = validated_data.pop('blood_group', '')
        date_of_birth = validated_data.pop('date_of_birth', None)
        address = validated_data.pop('address', '')

        department = validated_data.pop('department', None)
        specialization = validated_data.pop('specialization', '')
        qualification = validated_data.pop('qualification', '')
        experience_years = validated_data.pop('experience_years', 0)
        room_number = validated_data.pop('room_number', 'Room 101')
        avg_consult_minutes = validated_data.pop('avg_consult_minutes', 15)

        role = validated_data.get('role', 'patient')

        user = User(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role=role,
        )

        if role == 'admin':
            user.is_staff = True

        user.set_password(password)
        user.save()

        if role == 'patient':
            patient_id = f"PAT-{user.id:04d}"
            Patient.objects.create(
                user=user,
                patient_id=patient_id,
                gender=gender,
                blood_group=blood_group,
                date_of_birth=date_of_birth,
                address=address,
            )
        elif role == 'doctor':
            Doctor.objects.create(
                user=user,
                department=department,
                specialization=specialization,
                qualification=qualification,
                experience_years=experience_years,
                room_number=room_number,
                avg_consult_minutes=avg_consult_minutes,
            )

        return user
