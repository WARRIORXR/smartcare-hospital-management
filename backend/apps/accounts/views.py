"""
apps/accounts/views.py
=======================
API Views for User authentication, refresh logout, password reset,
profiles, admin management, leave/feedback, audit logs, and analytics exports.
"""

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .audit import record_audit_log
from .models import AuditLog, Department, Doctor, DoctorFeedback, DoctorLeave, Patient, User
from .reports import (
    build_analytics_csv_response,
    build_analytics_pdf_response,
    compute_analytics_data,
)
from .serializers import (
    AdminStaffCreateSerializer,
    AuditLogSerializer,
    CustomTokenObtainPairSerializer,
    DepartmentSerializer,
    DoctorDetailSerializer,
    DoctorFeedbackSerializer,
    DoctorLeaveSerializer,
    DoctorManageSerializer,
    DoctorProfileSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PatientProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)


# ─────────────────────────────────────────────
# Custom Permissions
# ─────────────────────────────────────────────
class IsAdminOnly(permissions.BasePermission):
    """Restricts access exclusively to Administrators."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == 'admin' or request.user.is_staff or request.user.is_superuser)
        )


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Requires authentication for read methods;
    restricts write access (POST, PUT, PATCH, DELETE) to Admins.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.role == 'admin' or request.user.is_staff or request.user.is_superuser)


# ─────────────────────────────────────────────
# 1. Auth Views (Login, Logout, Register, Password Reset)
# ─────────────────────────────────────────────
class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'login'

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        attempted_username = str(request.data.get('username', '')).strip()[:150]
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            record_audit_log(
                request,
                action='LOGIN_FAILED',
                resource_type='AuthSession',
                actor_username=attempted_username or 'unknown',
                actor_role='anonymous',
                details='Invalid login credentials or blocked demo admin attempt.',
            )
            raise

        user_info = serializer.validated_data.get('user', {})
        record_audit_log(
            request,
            action='LOGIN',
            resource_type='AuthSession',
            resource_id=user_info.get('id', ''),
            actor_username=user_info.get('username', attempted_username),
            actor_role=user_info.get('role', ''),
            details='User authenticated via JWT.',
        )
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """Blacklist the submitted refresh token so sessions cannot be reused after logout."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'refresh': {'type': 'string'}}}}, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except (TokenError, InvalidToken):
                return Response({'detail': 'Invalid refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'message': 'Logged out cleanly.'}, status=status.HTTP_200_OK)


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'register'
    serializer_class = RegisterSerializer

    @extend_schema(request=RegisterSerializer, responses={201: UserSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()

            refresh = RefreshToken.for_user(user)
            refresh['role'] = user.role
            refresh['username'] = user.username
            refresh['name'] = user.get_full_name() or user.username
            refresh['email'] = user.email

            record_audit_log(
                request,
                action='CREATE',
                resource_type='PatientRegistration',
                resource_id=user.id,
                patient=getattr(user, 'patient_profile', None),
                actor=user,
                details='Patient self-registered.',
            )

            return Response({
                "message": "Patient registered successfully!",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetRequestView(APIView):
    """Request a password reset email without disclosing whether the email exists."""

    permission_classes = [AllowAny]
    throttle_scope = 'password_reset'
    serializer_class = PasswordResetRequestSerializer

    @extend_schema(request=PasswordResetRequestSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip()

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        preview_payload = None
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            frontend_url = getattr(settings, 'FRONTEND_URL', 'https://smartcare-hospital-tyr.pages.dev')
            reset_link = f"{frontend_url.rstrip('/')}/reset-password/{uid}/{token}"

            send_mail(
                subject="SmartCare HMS — Password Reset Request",
                message=(
                    f"Hello {user.get_full_name() or user.username},\n\n"
                    f"Use the link below to reset your password:\n{reset_link}\n\n"
                    f"If you did not request this, please ignore this email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
            record_audit_log(
                request,
                action='PASSWORD_RESET',
                resource_type='PasswordResetRequest',
                resource_id=user.id,
                actor=user,
                details='Password reset email dispatched.',
            )
            if settings.DEBUG or settings.TESTING:
                preview_payload = {'uid': uid, 'token': token}

        resp = {
            "message": "If an account matches that email, a password reset link has been sent."
        }
        if preview_payload is not None:
            resp['dev_preview'] = preview_payload
        return Response(resp, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """Confirm uid & token and apply a validated strong password."""

    permission_classes = [AllowAny]
    throttle_scope = 'password_reset'
    serializer_class = PasswordResetConfirmSerializer

    @extend_schema(request=PasswordResetConfirmSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data['uid']
        token = serializer.validated_data['token']
        new_password = serializer.validated_data['new_password']

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except Exception:
            return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'Invalid or expired reset token.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        record_audit_log(
            request,
            action='PASSWORD_RESET',
            resource_type='PasswordResetConfirm',
            resource_id=user.id,
            actor=user,
            details='Password reset completed successfully.',
        )
        return Response({'message': 'Password has been reset successfully. Please sign in.'}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 2. Current User Profile & Admin Staff Provisioning
# ─────────────────────────────────────────────
class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        user = request.user
        data = {"user": UserSerializer(user).data}

        if user.role == 'patient' and hasattr(user, 'patient_profile'):
            data["profile"] = PatientProfileSerializer(user.patient_profile).data
        elif user.role == 'doctor' and hasattr(user, 'doctor_profile'):
            data["profile"] = DoctorProfileSerializer(user.doctor_profile).data
        else:
            data["profile"] = None

        return Response(data, status=status.HTTP_200_OK)


class AdminStaffListCreateView(generics.ListCreateAPIView):
    """Admin-only endpoint to inspect users or provision Doctor/Reception/BloodBank/Admin staff."""

    permission_classes = [IsAdminOnly]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdminStaffCreateSerializer
        return UserSerializer

    def get_queryset(self):
        qs = User.objects.all().order_by('-date_joined')
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def perform_create(self, serializer):
        created_user = serializer.save()
        record_audit_log(
            self.request,
            action='CREATE',
            resource_type='StaffAccount',
            resource_id=created_user.id,
            details=f"Provisioned {created_user.role} user @{created_user.username}.",
        )


# ─────────────────────────────────────────────
# 3. Department Views
# ─────────────────────────────────────────────
class DepartmentListCreateView(generics.ListCreateAPIView):
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        show_all = self.request.query_params.get('all', 'false').lower() == 'true'
        if show_all and self.request.user.is_authenticated and (self.request.user.role == 'admin' or self.request.user.is_staff):
            return Department.objects.all().order_by('name')
        return Department.objects.filter(is_active=True).order_by('name')


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]


# ─────────────────────────────────────────────
# 4. Doctor Views, Availability/Leave & Feedback
# ─────────────────────────────────────────────
class DoctorListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DoctorManageSerializer
        return DoctorDetailSerializer

    def get_queryset(self):
        queryset = Doctor.objects.select_related('user', 'department').all().order_by('user__first_name')

        dept_id = self.request.query_params.get('department')
        if dept_id:
            queryset = queryset.filter(department_id=dept_id)

        available_only = self.request.query_params.get('available')
        if available_only is not None and available_only.lower() == 'true':
            queryset = queryset.filter(is_available=True)

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
    queryset = Doctor.objects.select_related('user', 'department').all()
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return DoctorManageSerializer
        return DoctorDetailSerializer

    def perform_destroy(self, instance):
        user = instance.user
        instance.delete()
        user.delete()


class DoctorAvailabilityToggleView(APIView):
    """Doctor (for self) or Admin can toggle live on-duty availability."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'doctor_id': {'type': 'integer'}, 'is_available': {'type': 'boolean'}}}}, responses={200: OpenApiTypes.OBJECT})
    def patch(self, request):
        user = request.user
        doctor_id = request.data.get('doctor_id')

        if user.role == 'admin' or user.is_staff:
            doctor = get_object_or_404(Doctor, pk=doctor_id) if doctor_id else None
        elif hasattr(user, 'doctor_profile'):
            doctor = user.doctor_profile
        else:
            return Response({'detail': 'Not authorized to toggle doctor availability.'}, status=status.HTTP_403_FORBIDDEN)

        if not doctor:
            return Response({'detail': 'doctor_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        new_val = request.data.get('is_available')
        doctor.is_available = (not doctor.is_available) if new_val is None else bool(new_val)
        doctor.save()
        return Response({
            'doctor_id': doctor.id,
            'is_available': doctor.is_available,
            'message': f"Availability set to {'On Duty' if doctor.is_available else 'Off Duty'}."
        })


class DoctorLeaveListCreateView(generics.ListCreateAPIView):
    serializer_class = DoctorLeaveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = DoctorLeave.objects.select_related('doctor__user').all()
        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)
        elif hasattr(self.request.user, 'doctor_profile') and self.request.user.role == 'doctor':
            qs = qs.filter(doctor=self.request.user.doctor_profile)
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == 'doctor' and hasattr(user, 'doctor_profile'):
            serializer.save(doctor=user.doctor_profile)
        elif user.role == 'admin' or user.is_staff:
            if not serializer.validated_data.get('doctor'):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'doctor': 'Admin must specify a doctor ID.'})
            serializer.save()
        else:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only doctors or administrators can schedule leave.')


class DoctorLeaveDetailView(generics.DestroyAPIView):
    serializer_class = DoctorLeaveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin' or user.is_staff:
            return DoctorLeave.objects.all()
        if hasattr(user, 'doctor_profile'):
            return DoctorLeave.objects.filter(doctor=user.doctor_profile)
        return DoctorLeave.objects.none()


class DoctorFeedbackListCreateView(APIView):
    """GET doctor ratings/reviews; POST feedback from patient after consultation."""

    permission_classes = [IsAuthenticated]
    serializer_class = DoctorFeedbackSerializer

    @extend_schema(responses={200: DoctorFeedbackSerializer(many=True)})
    def get(self, request):
        doctor_id = request.query_params.get('doctor')
        qs = DoctorFeedback.objects.select_related('doctor__user', 'patient__user', 'token').all()
        if doctor_id:
            qs = qs.filter(doctor_id=doctor_id)
        elif request.user.role == 'doctor' and hasattr(request.user, 'doctor_profile'):
            qs = qs.filter(doctor=request.user.doctor_profile)
        elif request.user.role == 'patient' and hasattr(request.user, 'patient_profile') and not doctor_id:
            qs = qs.filter(patient=request.user.patient_profile)

        serializer = DoctorFeedbackSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user = request.user
        if user.role != 'patient' or not hasattr(user, 'patient_profile'):
            return Response({'detail': 'Only registered patients can submit doctor ratings.'}, status=status.HTTP_403_FORBIDDEN)

        patient = user.patient_profile
        serializer = DoctorFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        doctor = serializer.validated_data['doctor']
        token = serializer.validated_data.get('token')

        if token:
            if token.patient_id != patient.id:
                return Response({'detail': 'You can only rate consultations linked to your own OPD token.'}, status=status.HTTP_403_FORBIDDEN)
            if token.doctor_id != doctor.id:
                return Response({'detail': 'Selected token does not belong to the chosen doctor.'}, status=status.HTTP_400_BAD_REQUEST)
            if token.status not in ['completed', 'admitted']:
                return Response({'detail': 'Feedback can only be submitted after consultation is completed.'}, status=status.HTTP_400_BAD_REQUEST)
            if hasattr(token, 'feedback'):
                return Response({'detail': 'Feedback has already been submitted for this consultation.'}, status=status.HTTP_400_BAD_REQUEST)

        feedback = serializer.save(patient=patient)
        record_audit_log(
            request,
            action='CREATE',
            resource_type='DoctorFeedback',
            resource_id=feedback.id,
            patient=patient,
            details=f"Rated {doctor} {feedback.rating}/5.",
        )
        return Response(DoctorFeedbackSerializer(feedback).data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
# 5. Patient Directory & Unified Patient Journey (Anti-IDOR + Audit)
# ─────────────────────────────────────────────
class PatientListView(generics.ListAPIView):
    serializer_class = PatientProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if hasattr(user, 'patient_profile'):
                return Patient.objects.filter(id=user.patient_profile.id)
            return Patient.objects.none()

        if user.role not in ['doctor', 'reception', 'bloodbank_staff', 'admin'] and not user.is_staff:
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
            record_audit_log(
                self.request,
                action='VIEW',
                resource_type='PatientDirectorySearch',
                details=f"Searched patient directory with query='{search[:80]}'.",
            )
        return qs


class PatientJourneyView(APIView):
    """
    GET /api/accounts/patients/<id>/journey/
    Enforces strict object-level authorization and logs clinical views in AuditLog.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request, pk):
        user = request.user
        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if not hasattr(user, 'patient_profile'):
                return Response(
                    {"detail": "Logged in user does not have an active patient profile."},
                    status=status.HTTP_403_FORBIDDEN
                )
            user_profile = user.patient_profile
            if str(pk).lower() != 'me' and str(pk) != str(user_profile.id) and str(pk) != str(user.id):
                record_audit_log(
                    request,
                    action='VIEW',
                    resource_type='PatientJourneyDenied',
                    resource_id=pk,
                    details='Blocked unauthorized patient journey access attempt (IDOR prevention).',
                )
                return Response(
                    {"detail": "Access denied. You are not authorized to view another patient's medical journey."},
                    status=status.HTTP_403_FORBIDDEN
                )
            patient = user_profile
        else:
            if user.role not in ['doctor', 'reception', 'bloodbank_staff', 'admin'] and not user.is_staff:
                return Response({"detail": "Role not authorized to inspect patient records."}, status=status.HTTP_403_FORBIDDEN)
            patient = Patient.objects.filter(pk=pk).first() or Patient.objects.filter(user_id=pk).first()
            if not patient:
                raise NotFound("Patient profile not found.")

        record_audit_log(
            request,
            action='VIEW',
            resource_type='PatientJourney',
            resource_id=patient.id,
            patient=patient,
            details=f"Accessed complete medical journey for {patient.patient_id or patient.id}.",
        )

        # 1. Module 1: OPD Tokens
        from apps.opd.models import Token
        tokens_qs = Token.objects.filter(patient=patient).select_related(
            'doctor__user', 'doctor__department', 'department'
        ).order_by('-appointment_date', '-created_at')

        tokens_data = [{
            "id": t.id,
            "token_code": t.token_code,
            "token_number": t.token_number,
            "doctor_name": f"Dr. {t.doctor.user.get_full_name() or t.doctor.user.username}",
            "department_name": t.department.name if t.department else (t.doctor.department.name if t.doctor and t.doctor.department else 'General'),
            "room_number": t.doctor.room_number if t.doctor else 'OPD',
            "status": t.status,
            "status_display": t.get_status_display(),
            "priority": t.priority,
            "time_slot": t.time_slot,
            "symptoms": t.symptoms,
            "appointment_date": t.appointment_date,
            "created_at": t.created_at,
        } for t in tokens_qs]

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

        admissions_history = [{
            "id": a.id,
            "bed_number": a.bed.bed_number,
            "ward_name": a.bed.ward.name,
            "ward_type": a.bed.ward.ward_type,
            "status": a.status,
            "diagnosis": a.diagnosis,
            "admission_date": a.admission_date,
            "discharge_date": a.discharge_date,
            "discharge_notes": a.discharge_notes,
        } for a in admissions_qs]

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

        # 4. Module 4: Clinical Medical Records (Prescriptions, Notes, Lab Reports)
        from apps.records.models import MedicalRecord
        records_qs = MedicalRecord.objects.filter(patient=patient).select_related('doctor__user').order_by('-created_at')
        records_data = [{
            "id": r.id,
            "record_type": r.record_type,
            "title": r.title,
            "diagnosis": r.diagnosis,
            "visit_notes": r.visit_notes,
            "prescription_items": r.prescription_items,
            "has_attachment": bool(r.attachment),
            "doctor_name": f"Dr. {r.doctor.user.get_full_name() or r.doctor.user.username}" if r.doctor else 'Hospital Clinician',
            "created_at": r.created_at,
        } for r in records_qs]

        # 5. Module 5: Billing & Invoices Summary
        from apps.billing.models import Invoice
        invoices_qs = Invoice.objects.filter(patient=patient).order_by('-created_at')
        invoices_data = [{
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "status": inv.status,
            "total_amount": str(inv.total_amount),
            "payment_method": inv.payment_method,
            "created_at": inv.created_at,
        } for inv in invoices_qs]

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
                "total_medical_records": len(records_data),
                "total_invoices": len(invoices_data),
            },
            "module_1_opd": tokens_data,
            "module_2_beds": {
                "active_admission": active_admission_data,
                "admissions_history": admissions_history,
            },
            "module_3_bloodbank": blood_requests_data,
            "module_4_records": records_data,
            "module_5_billing": invoices_data,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 6. Admin Audit Logs & Analytics Dashboard / Reports
# ─────────────────────────────────────────────
class AuditLogListView(generics.ListAPIView):
    """GET /api/accounts/audit-logs/ -> Admin-only security & clinical access trail."""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminOnly]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('actor', 'patient').all().order_by('-created_at')
        action = self.request.query_params.get('action')
        resource_type = self.request.query_params.get('resource_type')
        search = self.request.query_params.get('search')

        if action:
            qs = qs.filter(action=action)
        if resource_type:
            qs = qs.filter(resource_type__icontains=resource_type)
        if search:
            qs = qs.filter(
                Q(actor_username__icontains=search) |
                Q(resource_type__icontains=search) |
                Q(details__icontains=search) |
                Q(ip_address__icontains=search)
            )
        return qs[:200]


class AdminAnalyticsDashboardView(APIView):
    """GET /api/accounts/admin/analytics/ -> Admin-only executive metrics."""

    permission_classes = [IsAdminOnly]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        data = compute_analytics_data()
        return Response(data, status=status.HTTP_200_OK)


class AdminAnalyticsExportView(APIView):
    """GET /api/accounts/admin/analytics/export/<str:export_format>/ -> Download CSV or PDF."""

    permission_classes = [IsAdminOnly]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, export_format='csv'):
        fmt = (export_format or request.query_params.get('export_format', 'csv')).lower()
        data = compute_analytics_data()

        if fmt == 'pdf':
            record_audit_log(request, action='EXPORT', resource_type='AnalyticsPDF', details='Exported executive PDF analytics report.')
            return build_analytics_pdf_response(data)
        if fmt == 'csv':
            record_audit_log(request, action='EXPORT', resource_type='AnalyticsCSV', details='Exported executive CSV analytics report.')
            return build_analytics_csv_response(data)

        return Response({'error': "Unsupported format. Use 'csv' or 'pdf'."}, status=status.HTTP_400_BAD_REQUEST)
