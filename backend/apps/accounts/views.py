"""
apps/accounts/views.py
=======================
API Views for User authentication, profiles, and Admin management
of Departments and Doctors.

Endpoints:
  - POST /api/accounts/login/            -> JWT login
  - POST /api/accounts/register/         -> User registration
  - GET  /api/accounts/profile/          -> Current user profile
  - GET, POST /api/accounts/departments/ -> List / Admin Add department
  - GET, PUT, DELETE /api/accounts/departments/<id>/ -> Admin Edit/Delete department
  - GET, POST /api/accounts/doctors/     -> List doctors / Admin Add doctor
  - GET, PUT, DELETE /api/accounts/doctors/<id>/     -> Admin Edit/Delete doctor
"""

from rest_framework import status, generics, permissions, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q

from .models import User, Patient, Doctor, Department
from .serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
    PatientProfileSerializer,
    DoctorProfileSerializer,
    DepartmentSerializer,
    DoctorDetailSerializer,
    DoctorManageSerializer,
)


# ─────────────────────────────────────────────
# Custom Permission: Admin Only for Writes
# ─────────────────────────────────────────────
class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allows read-only access (GET, HEAD, OPTIONS) to any user,
    but restricts write access (POST, PUT, PATCH, DELETE) to Admins.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role == 'admin' or request.user.is_staff)
        )


# ─────────────────────────────────────────────
# 1. JWT Login View
# ─────────────────────────────────────────────
class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


# ─────────────────────────────────────────────
# 2. User Registration View
# ─────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()

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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {
            "user": UserSerializer(user).data
        }

        if user.role == 'patient' and hasattr(user, 'patient_profile'):
            data["profile"] = PatientProfileSerializer(user.patient_profile).data
        elif user.role == 'doctor' and hasattr(user, 'doctor_profile'):
            data["profile"] = DoctorProfileSerializer(user.doctor_profile).data
        else:
            data["profile"] = None

        return Response(data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 4. Department Views (Admin Add/Edit/Delete + List)
# ─────────────────────────────────────────────
class DepartmentListCreateView(generics.ListCreateAPIView):
    """
    GET: List departments (Supports ?all=true for admin to view inactive ones)
    POST: Admin creates a department
    """
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        show_all = self.request.query_params.get('all', 'false').lower() == 'true'
        if show_all and self.request.user.is_authenticated and (self.request.user.role == 'admin' or self.request.user.is_staff):
            return Department.objects.all().order_by('name')
        return Department.objects.filter(is_active=True).order_by('name')


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET, PUT, PATCH, DELETE a specific department by ID.
    Admin only for updates and deletes.
    """
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]


# ─────────────────────────────────────────────
# 5. Doctor Views (Admin Add/Edit/Delete + Patient View List)
# ─────────────────────────────────────────────
class DoctorListCreateView(generics.ListCreateAPIView):
    """
    GET: List all doctors with filtering and search.
         Available to patients, doctors, and public directory.
         Query params:
           ?department=<id>   -> filter by department
           ?available=true    -> filter available only
           ?search=<term>     -> search by doctor name or specialization
    POST: Admin creates a new doctor (creates User + Doctor profile)
    """
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DoctorManageSerializer
        return DoctorDetailSerializer

    def get_queryset(self):
        queryset = Doctor.objects.select_related('user', 'department').all().order_by('user__first_name')

        # Filter by department
        dept_id = self.request.query_params.get('department')
        if dept_id:
            queryset = queryset.filter(department_id=dept_id)

        # Filter by availability
        available_only = self.request.query_params.get('available')
        if available_only is not None and available_only.lower() == 'true':
            queryset = queryset.filter(is_available=True)

        # Search by doctor name or specialization
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(specialization__icontains=search) |
                Q(department__name__icontains=search)
            )

        return queryset


class DoctorDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET, PUT, PATCH, DELETE a doctor profile.
    Admin only for updates and deletes.
    """
    queryset = Doctor.objects.select_related('user', 'department').all()
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return DoctorManageSerializer
        return DoctorDetailSerializer

    def perform_destroy(self, instance):
        # Also delete linked User account
        user = instance.user
        instance.delete()
        user.delete()
