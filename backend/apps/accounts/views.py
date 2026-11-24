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
# 6. Patient Directory (Cross-Module Integration)
# ─────────────────────────────────────────────
class PatientListView(generics.ListAPIView):
    """
    GET /api/accounts/patients/
    Lists registered patients with search filter.
    Used by Doctors, Bed Management, and Blood Bank to quickly select patients.
    Strictly isolated: Patients can only view their own profile.
    """
    serializer_class = PatientProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Strict privacy barrier: Patients can only view their own profile, never others
        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if hasattr(user, 'patient_profile'):
                return Patient.objects.filter(id=user.patient_profile.id)
            return Patient.objects.none()

        qs = Patient.objects.select_related('user').all().order_by('-created_at')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__username__icontains=search) |
                Q(patient_id__icontains=search) |
                Q(user__phone__icontains=search)
            )
        return qs


# ─────────────────────────────────────────────
# 7. Complete Unified Patient Journey API (Step 13)
# ─────────────────────────────────────────────
class PatientJourneyView(APIView):
    """
    GET /api/accounts/patients/<id>/journey/
    Connects all 3 modules in one seamless patient journey:
      - Module 1: OPD Consultation Tokens & Doctors
      - Module 2: Inpatient Bed Allocation & Admissions
      - Module 3: Blood Bank Requests & Matching Donors
    Linked through the Patient ID.
    Strictly protected: Patients can ONLY view their own journey.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from rest_framework.exceptions import NotFound

        # Anti-IDOR Security Barrier:
        # Patients are strictly forbidden from viewing another patient's medical records
        if request.user.role == 'patient' and not (request.user.is_staff or request.user.is_superuser):
            if not hasattr(request.user, 'patient_profile'):
                return Response(
                    {"detail": "Logged in user does not have an active patient profile."},
                    status=status.HTTP_403_FORBIDDEN
                )
            user_profile = request.user.patient_profile
            # Check if requested pk matches their own profile id or user id or 'me'
            if str(pk).lower() != 'me' and str(pk) != str(user_profile.id) and str(pk) != str(request.user.id):
                return Response(
                    {"detail": "Access denied. You are not authorized to view another patient's medical journey."},
                    status=status.HTTP_403_FORBIDDEN
                )
            patient = user_profile
        else:
            patient = Patient.objects.filter(pk=pk).first()
            if not patient:
                patient = Patient.objects.filter(user_id=pk).first()
            if not patient:
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


# ─────────────────────────────────────────────
# 7. Admin Analytics Dashboard API (Step 14)
# ─────────────────────────────────────────────
class AdminAnalyticsDashboardView(APIView):
    """
    GET /api/accounts/admin/analytics/
    Calculates hospital-wide analytics directly from the database:
      1. Total tokens today (and breakdown by status)
      2. Average waiting time (in minutes)
      3. Busiest department (name + token count)
      4. Bed occupancy percentage (and breakdown by ward)
      5. Blood stock low alerts (< 3 units)
    Also supplies formatted data arrays for Chart.js visualizations.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import timedelta
        from django.utils import timezone
        from django.db.models import Count, Avg, Q, Sum
        from apps.opd.models import Token, Queue
        from apps.beds.models import Bed, Ward, Admission
        from apps.bloodbank.models import BloodStock, BloodRequest, Donor

        today = timezone.now().date()

        # 1. OPD Tokens Analytics
        today_tokens = Token.objects.filter(appointment_date=today)
        total_tokens_today = today_tokens.count()
        waiting_count = today_tokens.filter(status='waiting').count()
        called_count = today_tokens.filter(status='called').count()
        in_progress_count = today_tokens.filter(status='in_progress').count()
        completed_count = today_tokens.filter(status='completed').count()
        admitted_count = today_tokens.filter(status='admitted').count()
        skipped_count = today_tokens.filter(status='skipped').count()
        cancelled_count = today_tokens.filter(status='cancelled').count()

        # 2. Average Waiting Time (in minutes)
        serviced_tokens = today_tokens.filter(status__in=['called', 'in_progress', 'completed'])
        wait_times = []
        for t in serviced_tokens:
            diff_mins = (t.updated_at - t.created_at).total_seconds() / 60.0
            if diff_mins >= 0:
                wait_times.append(diff_mins)

        if wait_times:
            avg_waiting_time = round(sum(wait_times) / len(wait_times), 1)
        else:
            # Fallback to doctor consult average or 15 mins
            avg_doc_time = Doctor.objects.filter(is_available=True).aggregate(Avg('avg_consult_minutes'))['avg_consult_minutes__avg'] or 15.0
            avg_waiting_time = round(float(avg_doc_time), 1)

        # 3. Busiest Department
        # Group today's tokens by department
        dept_counts_qs = (
            today_tokens.exclude(department__isnull=True)
            .values('department__id', 'department__name')
            .annotate(token_count=Count('id'))
            .order_by('-token_count')
        )

        busiest_dept_name = "General Medicine"
        busiest_dept_tokens = 0

        if dept_counts_qs.exists():
            busiest = dept_counts_qs.first()
            busiest_dept_name = busiest['department__name']
            busiest_dept_tokens = busiest['token_count']
        else:
            # Fallback to all-time tokens if today has no tokens yet
            all_time_busiest = (
                Token.objects.exclude(department__isnull=True)
                .values('department__name')
                .annotate(token_count=Count('id'))
                .order_by('-token_count')
                .first()
            )
            if all_time_busiest:
                busiest_dept_name = all_time_busiest['department__name']
                busiest_dept_tokens = all_time_busiest['token_count']
            else:
                first_dept = Department.objects.first()
                if first_dept:
                    busiest_dept_name = first_dept.name

        # Department distribution for Chart.js
        all_departments = Department.objects.all().order_by('name')
        dept_chart_labels = []
        dept_chart_data = []
        for dept in all_departments:
            dept_chart_labels.append(dept.name)
            # Count today's tokens, or total if today is 0
            count_today = today_tokens.filter(department=dept).count()
            dept_chart_data.append(count_today)

        # If all counts are 0 today, show all-time counts for meaningful visualization
        if sum(dept_chart_data) == 0:
            dept_chart_data = [Token.objects.filter(department=dept).count() for dept in all_departments]

        # 4. Bed Occupancy Percentage
        total_beds = Bed.objects.count()
        occupied_beds = Bed.objects.filter(status='occupied').count()
        available_beds = Bed.objects.filter(status='available').count()
        cleaning_beds = Bed.objects.filter(status='cleaning').count()
        maintenance_beds = Bed.objects.filter(status__in=['maintenance', 'reserved']).count()

        bed_occupancy_percentage = round((occupied_beds / total_beds * 100), 1) if total_beds > 0 else 0.0

        # Ward-by-ward breakdown for Chart.js
        wards_qs = Ward.objects.filter(is_active=True).order_by('name')
        ward_chart_labels = []
        ward_chart_occupied = []
        ward_chart_available = []
        ward_chart_percentages = []

        for w in wards_qs:
            w_total = w.beds.count()
            w_occ = w.beds.filter(status='occupied').count()
            w_avail = w.beds.filter(status='available').count()
            w_pct = round((w_occ / w_total * 100), 1) if w_total > 0 else 0.0

            ward_chart_labels.append(w.name)
            ward_chart_occupied.append(w_occ)
            ward_chart_available.append(w_avail)
            ward_chart_percentages.append(w_pct)

        # 5. Blood Stock Low Alerts (< 3 units)
        all_blood_groups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
        stocks_map = {s.blood_group: s for s in BloodStock.objects.all()}

        low_stock_alerts = []
        blood_chart_labels = []
        blood_chart_units = []
        blood_chart_colors = []
        total_blood_units = 0

        for bg in all_blood_groups:
            stock = stocks_map.get(bg)
            units = stock.units_available if stock else 0
            total_blood_units += units
            is_low = units < 3

            if is_low:
                low_stock_alerts.append({
                    "blood_group": bg,
                    "units_available": units,
                    "minimum_threshold": 3,
                    "shortage": max(0, 3 - units),
                    "expiry_date": stock.expiry_date if stock else None
                })

            blood_chart_labels.append(bg)
            blood_chart_units.append(units)
            # Red alert color for < 3 units, green for safe
            blood_chart_colors.append('#ef4444' if is_low else '#10b981')

        # 6. Last 7 Days Daily Token Volume Trend
        trend_labels = []
        trend_data = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            day_count = Token.objects.filter(appointment_date=day).count()
            trend_labels.append(day.strftime("%a (%d %b)"))
            trend_data.append(day_count)

        # Build Comprehensive Analytics Payload
        data = {
            "summary_kpis": {
                "total_tokens_today": total_tokens_today,
                "waiting_tokens": waiting_count,
                "called_tokens": called_count + in_progress_count,
                "completed_tokens": completed_count,
                "average_waiting_time_minutes": avg_waiting_time,
                "average_waiting_time_display": f"{avg_waiting_time} mins",
                "busiest_department": {
                    "name": busiest_dept_name,
                    "tokens_count": busiest_dept_tokens,
                },
                "bed_occupancy_percentage": bed_occupancy_percentage,
                "total_beds": total_beds,
                "occupied_beds": occupied_beds,
                "available_beds": available_beds,
                "cleaning_beds": cleaning_beds,
                "blood_stock_low_alerts": {
                    "count": len(low_stock_alerts),
                    "has_alerts": len(low_stock_alerts) > 0,
                    "critical_groups": [item["blood_group"] for item in low_stock_alerts],
                    "total_blood_units": total_blood_units,
                },
                "total_doctors": Doctor.objects.count(),
                "available_doctors": Doctor.objects.filter(is_available=True).count(),
                "total_patients": Patient.objects.count(),
                "active_admissions": Admission.objects.filter(status='admitted').count(),
                "pending_blood_requests": BloodRequest.objects.filter(status='pending').count(),
            },
            "charts": {
                "token_status_distribution": {
                    "labels": ["Waiting", "Called / In Progress", "Completed", "Admitted to Ward", "Skipped / Cancelled"],
                    "data": [
                        waiting_count,
                        called_count + in_progress_count,
                        completed_count,
                        admitted_count,
                        skipped_count + cancelled_count
                    ],
                    "colors": ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444"]
                },
                "daily_token_trend": {
                    "labels": trend_labels,
                    "data": trend_data,
                },
                "department_tokens": {
                    "labels": dept_chart_labels,
                    "data": dept_chart_data,
                },
                "bed_status": {
                    "labels": ["Available", "Occupied", "Cleaning", "Maintenance"],
                    "data": [available_beds, occupied_beds, cleaning_beds, maintenance_beds],
                    "colors": ["#10b981", "#ef4444", "#f59e0b", "#6b7280"]
                },
                "ward_occupancy": {
                    "labels": ward_chart_labels,
                    "occupied": ward_chart_occupied,
                    "available": ward_chart_available,
                    "percentages": ward_chart_percentages,
                },
                "blood_stock_levels": {
                    "labels": blood_chart_labels,
                    "data": blood_chart_units,
                    "colors": blood_chart_colors,
                    "threshold": 3
                }
            },
            "alerts": {
                "low_blood_stock": low_stock_alerts,
            }
        }

        return Response(data, status=status.HTTP_200_OK)
