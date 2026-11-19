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


# ─────────────────────────────────────────────
# 6. Complete Unified Patient Journey API (Step 13)
# ─────────────────────────────────────────────
class PatientJourneyView(APIView):
    """
    GET /api/accounts/patients/<id>/journey/
    Connects all 3 modules in one seamless patient journey:
      - Module 1: OPD Consultation Tokens & Doctors
      - Module 2: Inpatient Bed Allocation & Admissions
      - Module 3: Blood Bank Requests & Matching Donors
    Linked through the Patient ID.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        patient = Patient.objects.filter(Q(pk=pk) | Q(user_id=pk)).first()
        if not patient:
            from rest_framework.exceptions import NotFound
            raise NotFound("Patient profile not found.")

        # 1. Module 1: OPD Tokens
        from apps.opd.models import Token
        from apps.opd.serializers import TokenSerializer
        tokens_qs = Token.objects.filter(patient=patient).select_related(
            'doctor__user', 'doctor__department', 'department'
        ).order_by('-appointment_date', '-created_at')

        tokens_data = []
        for t in tokens_qs:
            tokens_data.append({
                "id": t.id,
                "token_code": t.token_code,
                "token_number": t.token_number,
                "doctor_name": f"Dr. {t.doctor.user.get_full_name() or t.doctor.user.username}",
                "department_name": t.department.name if t.department else (t.doctor.department.name if t.doctor and t.doctor.department else 'General'),
                "room_number": t.doctor.room_number if t.doctor else 'OPD',
                "status": t.status,
                "status_display": t.get_status_display(),
                "priority": t.priority,
                "symptoms": t.symptoms,
                "appointment_date": t.appointment_date,
                "created_at": t.created_at,
            })

        # 2. Module 2: Inpatient Bed Admissions
        from apps.beds.models import Admission
        admissions_qs = Admission.objects.filter(patient=patient).select_related(
            'bed__ward', 'attending_doctor__user', 'token'
        ).order_by('-admission_date')

        active_admission = admissions_qs.filter(status='admitted').first()
        active_admission_data = None
        if active_admission:
            active_admission_data = {
                "id": active_admission.id,
                "bed_id": active_admission.bed.id,
                "bed_number": active_admission.bed.bed_number,
                "ward_name": active_admission.bed.ward.name,
                "ward_type": active_admission.bed.ward.ward_type,
                "floor_number": active_admission.bed.ward.floor_number,
                "attending_doctor_name": f"Dr. {active_admission.attending_doctor.user.get_full_name() or active_admission.attending_doctor.user.username}" if active_admission.attending_doctor else 'Assigned Staff',
                "diagnosis": active_admission.diagnosis,
                "admission_date": active_admission.admission_date,
                "token_code": active_admission.token.token_code if active_admission.token else None,
            }

        admissions_history = []
        for a in admissions_qs:
            admissions_history.append({
                "id": a.id,
                "bed_number": a.bed.bed_number,
                "ward_name": a.bed.ward.name,
                "ward_type": a.bed.ward.ward_type,
                "status": a.status,
                "diagnosis": a.diagnosis,
                "admission_date": a.admission_date,
                "discharge_date": a.discharge_date,
                "discharge_notes": a.discharge_notes,
            })

        # 3. Module 3: Blood Bank Requests
        from apps.bloodbank.models import BloodRequest, BloodStock
        blood_requests_qs = BloodRequest.objects.filter(patient=patient).order_by('-created_at')

        blood_requests_data = []
        for br in blood_requests_qs:
            stock = BloodStock.objects.filter(blood_group=br.blood_group).first()
            available = stock.units_available if stock else 0
            blood_requests_data.append({
                "id": br.id,
                "blood_group": br.blood_group,
                "units_required": br.units_required,
                "units_provided": br.units_provided,
                "priority": br.priority,
                "status": br.status,
                "hospital_ward": br.hospital_ward,
                "purpose": br.purpose,
                "required_by_date": br.required_by_date,
                "notes": br.notes,
                "available_stock_now": available,
                "is_stock_low": available < 3 or available < br.units_required,
                "created_at": br.created_at,
            })

        return Response({
            "patient": {
                "id": patient.id,
                "patient_code": patient.patient_id or f"PAT-{patient.id:04d}",
                "name": patient.user.get_full_name() or patient.user.username,
                "username": patient.user.username,
                "email": patient.user.email,
                "phone": patient.user.phone or 'N/A',
                "blood_group": patient.blood_group or 'Not Specified',
                "gender": patient.gender or 'Not Specified',
                "address": patient.address or 'N/A',
                "emergency_contact": f"{patient.emergency_contact_name} ({patient.emergency_contact_phone})" if patient.emergency_contact_name else 'N/A',
            },
            "journey_summary": {
                "total_opd_visits": len(tokens_data),
                "is_currently_admitted": active_admission is not None,
                "current_bed": active_admission.bed.bed_number if active_admission else None,
                "current_ward": active_admission.bed.ward.name if active_admission else None,
                "total_blood_requests": len(blood_requests_data),
                "pending_blood_requests": sum(1 for b in blood_requests_data if b['status'] == 'pending'),
            },
            "module_1_opd": tokens_data,
            "module_2_beds": {
                "active_admission": active_admission_data,
                "admissions_history": admissions_history,
            },
            "module_3_bloodbank": blood_requests_data,
        }, status=status.HTTP_200_OK)
