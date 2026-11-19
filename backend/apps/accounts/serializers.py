"""
apps/accounts/serializers.py
=============================
Serializers for User authentication and profiles.

Includes:
  - CustomTokenObtainPairSerializer: Returns JWT tokens + user role & details
  - RegisterSerializer: Registers a new user with role and creates profile
  - UserSerializer: Returns current user details
  - PatientProfileSerializer / DoctorProfileSerializer
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
    This allows React to know the user's role immediately upon login.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Custom claims embedded in the JWT payload
        token['username'] = user.username
        token['role'] = user.role
        token['name'] = user.get_full_name() or user.username
        token['email'] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)

        # Include user details directly in login response JSON
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'role': self.user.role,
            'phone': self.user.phone,
        }

        # Include patient_id if user is a patient
        if self.user.role == 'patient' and hasattr(self.user, 'patient_profile'):
            data['user']['patient_id'] = self.user.patient_profile.patient_id
            data['user']['blood_group'] = self.user.patient_profile.blood_group

        # Include doctor specialization if user is a doctor
        if self.user.role == 'doctor' and hasattr(self.user, 'doctor_profile'):
            data['user']['specialization'] = self.user.doctor_profile.specialization

        return data


# ─────────────────────────────────────────────
# 2. User Serializer (General details)
# ─────────────────────────────────────────────
class UserSerializer(serializers.ModelSerializer):
    """
    Serializer to display user info.
    Password is never exposed.
    """
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
# 4. Doctor Profile Serializer
# ─────────────────────────────────────────────
class DoctorProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Doctor
        fields = [
            'id', 'user', 'department', 'department_name', 'specialization',
            'qualification', 'experience_years', 'consultation_fee',
            'available_days', 'is_available'
        ]
        read_only_fields = ['id']


# ─────────────────────────────────────────────
# 5. Department Serializer
# ─────────────────────────────────────────────
class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'description', 'is_active']


# ─────────────────────────────────────────────
# 6. Registration Serializer
# ─────────────────────────────────────────────
class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles user registration for all roles (Patient, Doctor, Admin, etc.)
    Validates password, creates User, and creates associated Patient/Doctor profile.
    """

    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text="Password must be at least 6 characters"
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        help_text="Confirm your password"
    )

    # Optional profile fields during registration
    # Patient fields:
    gender = serializers.CharField(required=False, allow_blank=True)
    blood_group = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    address = serializers.CharField(required=False, allow_blank=True)

    # Doctor fields:
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        required=False,
        allow_null=True
    )
    specialization = serializers.CharField(required=False, allow_blank=True)
    qualification = serializers.CharField(required=False, allow_blank=True)
    experience_years = serializers.IntegerField(required=False, default=0)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone', 'role',
            # Patient optional fields:
            'gender', 'blood_group', 'date_of_birth', 'address',
            # Doctor optional fields:
            'department', 'specialization', 'qualification', 'experience_years'
        ]
        extra_kwargs = {
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
        }

    def validate(self, attrs):
        # 1. Check passwords match
        if attrs.get('password') != attrs.get('password_confirm'):
            raise serializers.ValidationError({"password": "Passwords do not match."})

        # 2. Check password length
        if len(attrs.get('password')) < 6:
            raise serializers.ValidationError({"password": "Password must be at least 6 characters."})

        # 3. Check email uniqueness
        email = attrs.get('email')
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError({"email": "A user with this email already exists."})

        return attrs

    def create(self, validated_data):
        # Extract fields not belonging to the User model
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

        role = validated_data.get('role', 'patient')

        # Create user instance
        user = User(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role=role,
        )

        # Admin role gets staff permissions
        if role == 'admin':
            user.is_staff = True

        user.set_password(password)  # Hashes password securely with PBKDF2
        user.save()

        # Create profile based on role
        if role == 'patient':
            # Generate patient ID: PAT-{user.id:04d}
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
            )

        return user
