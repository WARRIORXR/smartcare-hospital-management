"""
apps/accounts/views.py
=======================
API Views for User authentication and profiles.

Endpoints:
  - POST /api/accounts/login/      -> JWT login (returns tokens + user info)
  - POST /api/accounts/register/   -> Register user (Patient / Doctor / Admin)
  - GET  /api/accounts/profile/    -> Get current user profile + medical/doctor data
  - GET  /api/accounts/departments/-> List hospital departments
"""

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, Patient, Doctor, Department
from .serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
    PatientProfileSerializer,
    DoctorProfileSerializer,
    DepartmentSerializer,
)


# ─────────────────────────────────────────────
# 1. JWT Login View
# ─────────────────────────────────────────────
class CustomLoginView(TokenObtainPairView):
    """
    POST /api/accounts/login/
    Authenticates username + password.
    Returns:
      {
        "refresh": "...",
        "access": "...",
        "user": {
           "id": 1,
           "username": "...",
           "email": "...",
           "first_name": "...",
           "last_name": "...",
           "role": "patient" | "doctor" | "admin",
           "phone": "..."
        }
      }
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


# ─────────────────────────────────────────────
# 2. User Registration View
# ─────────────────────────────────────────────
class RegisterView(APIView):
    """
    POST /api/accounts/register/
    Creates a new user and automatically returns JWT tokens
    so the user is logged in right after registration.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()

            # Generate tokens for the new user immediately
            refresh = RefreshToken.for_user(user)
            refresh['role'] = user.role
            refresh['username'] = user.username
            refresh['name'] = user.get_full_name() or user.username
            refresh['email'] = user.email

            user_data = UserSerializer(user).data

            return Response({
                "message": "User registered successfully!",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": user_data
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# 3. Current User Profile View
# ─────────────────────────────────────────────
class UserProfileView(APIView):
    """
    GET /api/accounts/profile/
    Returns full details for the logged-in user,
    including linked Patient or Doctor profile.
    Requires: Authorization: Bearer <token>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {
            "user": UserSerializer(user).data
        }

        # Attach role-specific profile if it exists
        if user.role == 'patient' and hasattr(user, 'patient_profile'):
            data["profile"] = PatientProfileSerializer(user.patient_profile).data
        elif user.role == 'doctor' and hasattr(user, 'doctor_profile'):
            data["profile"] = DoctorProfileSerializer(user.doctor_profile).data
        else:
            data["profile"] = None

        return Response(data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 4. Department List View
# ─────────────────────────────────────────────
class DepartmentListView(generics.ListAPIView):
    """
    GET /api/accounts/departments/
    Public endpoint to list active departments for dropdowns.
    """
    queryset = Department.objects.filter(is_active=True)
    serializer_class = DepartmentSerializer
    permission_classes = [AllowAny]
