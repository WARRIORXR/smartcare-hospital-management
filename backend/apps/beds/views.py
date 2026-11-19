"""
apps/beds/views.py
==================
Views for Ward and Bed Management (Module 2).

Endpoints:
  - GET, POST          /api/beds/wards/           -> List all wards / Admin Add Ward
  - GET, PUT, DELETE   /api/beds/wards/<id>/      -> Admin Ward Details / Edit / Delete
  - GET, POST          /api/beds/                 -> List beds (filters: ward, status) / Admin Add Bed
  - GET, PUT, DELETE   /api/beds/<id>/            -> Bed Details / Edit / Delete
  - PATCH              /api/beds/<id>/status/     -> Quick Status Toggle (Available / Occupied / Cleaning)
  - GET                /api/beds/overview/        -> Live Dashboard Summary & Ward Groupings
  - GET, POST          /api/beds/admissions/      -> List / Create Inpatient Admission
  - POST               /api/beds/admissions/<id>/discharge/ -> Discharge patient & set bed to cleaning
"""

from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Count, Q

from .models import Ward, Bed, Admission
from .serializers import (
    WardSerializer,
    BedSerializer,
    BedStatusUpdateSerializer,
    AdmissionSerializer,
    AutoAdmitSerializer,
    DischargeSerializer,
)
from apps.accounts.models import Patient, Doctor
from apps.opd.models import Token


# ─────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────
class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allows read-only access for authenticated users;
    restricts creation/update/deletion to Admins.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.role == 'admin' or request.user.is_staff)
        )


class CanManageBeds(permissions.BasePermission):
    """
    Allows Admins and Doctors to update bed status (e.g. mark cleaning/occupied).
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role in ['admin', 'doctor'] or request.user.is_staff


# ─────────────────────────────────────────────
# 1. Ward Views
# ─────────────────────────────────────────────
class WardListCreateView(generics.ListCreateAPIView):
    """
    GET: List all wards (with optional ?ward_type= filter)
    POST: Create new ward (Admin only)
    """
    serializer_class = WardSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Ward.objects.prefetch_related('beds').all()
        ward_type = self.request.query_params.get('ward_type')
        if ward_type:
            queryset = queryset.filter(ward_type=ward_type)
        return queryset


class WardDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve ward details
    PUT/PATCH: Update ward (Admin only)
    DELETE: Delete ward (Admin only)
    """
    queryset = Ward.objects.prefetch_related('beds').all()
    serializer_class = WardSerializer
    permission_classes = [IsAdminOrReadOnly]


# ─────────────────────────────────────────────
# 2. Bed Views
# ─────────────────────────────────────────────
class BedListCreateView(generics.ListCreateAPIView):
    """
    GET: List beds. Supports filtering by ward (?ward=1), status (?status=available), ward_type (?ward_type=icu)
    POST: Create a single bed or batch of beds (Admin only)
    """
    serializer_class = BedSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Bed.objects.select_related('ward').prefetch_related('admissions__patient__user').all()
        ward_id = self.request.query_params.get('ward')
        status_param = self.request.query_params.get('status')
        ward_type = self.request.query_params.get('ward_type')

        if ward_id:
            queryset = queryset.filter(ward_id=ward_id)
        if status_param:
            queryset = queryset.filter(status=status_param)
        if ward_type:
            queryset = queryset.filter(ward__ward_type=ward_type)

        return queryset

    def create(self, request, *args, **kwargs):
        """Support creating a single bed or batch creating multiple beds (e.g. B-101 to B-110)."""
        data = request.data

        # If data is a list, support batch creation
        if isinstance(data, list):
            serializer = self.get_serializer(data=data, many=True)
            serializer.is_valid(raise_exception=True)
            self.perform_bulk_create(serializer)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return super().create(request, *args, **kwargs)

    def perform_bulk_create(self, serializer):
        serializer.save()


class BedDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve single bed
    PUT/PATCH: Update bed attributes (Admin or Doctor)
    DELETE: Delete bed (Admin only)
    """
    queryset = Bed.objects.select_related('ward').all()
    serializer_class = BedSerializer
    permission_classes = [CanManageBeds]


class BedQuickStatusUpdateView(APIView):
    """
    PATCH /api/beds/<pk>/status/
    Fast status update for live bed dashboard.
    Accepts: { "status": "available" | "occupied" | "cleaning" | "maintenance" }
    """
    permission_classes = [CanManageBeds]

    def patch(self, request, pk):
        bed = get_object_or_404(Bed, pk=pk)
        new_status = request.data.get('status')

        valid_choices = [c[0] for c in Bed.STATUS_CHOICES]
        if new_status not in valid_choices:
            return Response(
                {"error": f"Invalid status '{new_status}'. Allowed: {valid_choices}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        bed.status = new_status
        bed.save()

        serializer = BedSerializer(bed)
        return Response({
            "message": f"Bed {bed.bed_number} status updated to {bed.get_status_display()}.",
            "bed": serializer.data
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 3. Live Dashboard Overview View
# ─────────────────────────────────────────────
class BedLiveOverviewView(APIView):
    """
    GET /api/beds/overview/
    Returns live bed availability summary with color-coded counts:
      - total_beds
      - available_beds (Green)
      - occupied_beds (Red)
      - cleaning_beds (Amber)
      - occupancy_percentage
      - wards list with nested beds and ward-level stats
      - breakdown by ward type (General, ICU, Private)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wards = Ward.objects.prefetch_related('beds__admissions__patient__user').all()

        total_beds = Bed.objects.count()
        available_beds = Bed.objects.filter(status='available').count()
        occupied_beds = Bed.objects.filter(status='occupied').count()
        cleaning_beds = Bed.objects.filter(status='cleaning').count()
        maintenance_beds = Bed.objects.filter(status__in=['maintenance', 'reserved']).count()

        occupancy_rate = round((occupied_beds / total_beds * 100), 1) if total_beds > 0 else 0.0

        # Group by ward type (General, ICU, Private, etc.)
        ward_types_summary = {
            'general': {'total': 0, 'available': 0, 'occupied': 0, 'cleaning': 0},
            'icu': {'total': 0, 'available': 0, 'occupied': 0, 'cleaning': 0},
            'private': {'total': 0, 'available': 0, 'occupied': 0, 'cleaning': 0},
            'other': {'total': 0, 'available': 0, 'occupied': 0, 'cleaning': 0},
        }

        wards_data = []
        for ward in wards:
            w_serializer = WardSerializer(ward)
            w_data = w_serializer.data
            wards_data.append(w_data)

            category = ward.ward_type if ward.ward_type in ['general', 'icu', 'private'] else 'other'
            ward_types_summary[category]['total'] += w_data['total_beds_count']
            ward_types_summary[category]['available'] += w_data['available_beds_count']
            ward_types_summary[category]['occupied'] += w_data['occupied_beds_count']
            ward_types_summary[category]['cleaning'] += w_data['cleaning_beds_count']

        return Response({
            "summary": {
                "total_beds": total_beds,
                "available_beds": available_beds,
                "occupied_beds": occupied_beds,
                "cleaning_beds": cleaning_beds,
                "maintenance_beds": maintenance_beds,
                "occupancy_rate": occupancy_rate,
            },
            "ward_types": ward_types_summary,
            "wards": wards_data,
            "timestamp": timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# 4. Inpatient Admission, Auto-Admit & Discharge Views
# ─────────────────────────────────────────────
class AutoAdmitPatientView(APIView):
    """
    POST /api/beds/admissions/auto-admit/
    Doctor / Admin admits a patient (from an OPD token or directly).
    System automatically assigns the first available bed of the chosen ward_type.
    """
    permission_classes = [CanManageBeds]

    def post(self, request):
        serializer = AutoAdmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        token_id = data.get('token_id')
        patient_id = data.get('patient_id')
        ward_type = data.get('ward_type')
        diagnosis = data.get('diagnosis')
        attending_doctor_id = data.get('attending_doctor_id')
        preferred_ward_id = data.get('preferred_ward_id')

        # 1. Resolve Patient
        token = None
        patient = None
        if token_id:
            token = get_object_or_404(Token, pk=token_id)
            patient = token.patient
            if not attending_doctor_id and token.doctor:
                attending_doctor_id = token.doctor.id
        elif patient_id:
            patient = get_object_or_404(Patient, pk=patient_id)
        else:
            return Response(
                {"error": "Either token_id or patient_id must be provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Check if patient is already actively admitted
        existing_admission = Admission.objects.filter(patient=patient, status='admitted').first()
        if existing_admission:
            return Response(
                {
                    "error": f"Patient {patient.user.get_full_name() or patient.user.username} is already admitted to Bed {existing_admission.bed.bed_number} in {existing_admission.bed.ward.name}."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Resolve Doctor
        attending_doctor = None
        if attending_doctor_id:
            attending_doctor = Doctor.objects.filter(pk=attending_doctor_id).first()
        elif hasattr(request.user, 'doctor_profile'):
            attending_doctor = request.user.doctor_profile

        # 4. Auto-assign first available bed of selected type
        available_beds_qs = Bed.objects.filter(
            ward__ward_type=ward_type,
            ward__is_active=True,
            status='available'
        ).select_related('ward').order_by('ward__floor_number', 'bed_number')

        if preferred_ward_id:
            assigned_bed = available_beds_qs.filter(ward_id=preferred_ward_id).first() or available_beds_qs.first()
        else:
            assigned_bed = available_beds_qs.first()

        if not assigned_bed:
            total_beds_count = Bed.objects.filter(ward__ward_type=ward_type).count()
            occupied_count = Bed.objects.filter(ward__ward_type=ward_type, status='occupied').count()
            return Response({
                "error": f"No available beds in {ward_type.upper()} wards. All {total_beds_count} beds are currently occupied or being cleaned.",
                "ward_type": ward_type,
                "total_beds": total_beds_count,
                "occupied_beds": occupied_count,
            }, status=status.HTTP_400_BAD_REQUEST)

        # 5. Mark Bed Occupied
        assigned_bed.status = 'occupied'
        assigned_bed.save()

        # 6. Create Admission record
        admission = Admission.objects.create(
            patient=patient,
            bed=assigned_bed,
            attending_doctor=attending_doctor,
            token=token,
            diagnosis=diagnosis,
            status='admitted',
        )

        # 7. Update Token status if linked
        if token:
            token.status = 'admitted'
            token.save()

        admission_serializer = AdmissionSerializer(admission)
        return Response({
            "message": f"Patient {patient.user.get_full_name() or patient.user.username} admitted successfully! Auto-assigned Bed {assigned_bed.bed_number} in {assigned_bed.ward.name}.",
            "admission": admission_serializer.data,
            "assigned_bed": {
                "id": assigned_bed.id,
                "bed_number": assigned_bed.bed_number,
                "ward_name": assigned_bed.ward.name,
                "ward_type": assigned_bed.ward.ward_type,
                "floor_number": assigned_bed.ward.floor_number,
            }
        }, status=status.HTTP_201_CREATED)


class ActiveAdmissionsListView(generics.ListAPIView):
    """
    GET /api/beds/admissions/active/
    Lists all patients currently admitted to hospital beds.
    """
    serializer_class = AdmissionSerializer
    permission_classes = [CanManageBeds]

    def get_queryset(self):
        queryset = Admission.objects.filter(status='admitted').select_related(
            'patient__user', 'bed__ward', 'attending_doctor__user', 'token'
        ).order_by('-admission_date')

        # Filter by doctor (my_patients)
        my_patients = self.request.query_params.get('my_patients')
        if my_patients and hasattr(self.request.user, 'doctor_profile'):
            queryset = queryset.filter(attending_doctor=self.request.user.doctor_profile)

        doctor_id = self.request.query_params.get('doctor')
        if doctor_id:
            queryset = queryset.filter(attending_doctor_id=doctor_id)

        ward_type = self.request.query_params.get('ward_type')
        if ward_type:
            queryset = queryset.filter(bed__ward__ward_type=ward_type)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(patient__user__first_name__icontains=search) |
                Q(patient__user__last_name__icontains=search) |
                Q(bed__bed_number__icontains=search) |
                Q(bed__ward__name__icontains=search)
            )

        return queryset


class AdmissionListCreateView(generics.ListCreateAPIView):
    """
    GET: List active admissions
    POST: Admit a patient to a bed (bed becomes 'occupied')
    """
    serializer_class = AdmissionSerializer
    permission_classes = [CanManageBeds]

    def get_queryset(self):
        return Admission.objects.select_related('patient__user', 'bed__ward', 'attending_doctor__user').all()

    def perform_create(self, serializer):
        bed = serializer.validated_data.get('bed')
        bed.status = 'occupied'
        bed.save()
        serializer.save(status='admitted')


class AdmissionDischargeView(APIView):
    """
    POST /api/beds/admissions/<id>/discharge/
    Discharges a patient.
    Prompt requirement: On Discharge, bed becomes Available again.
    """
    permission_classes = [CanManageBeds]

    def post(self, request, pk):
        admission = get_object_or_404(Admission, pk=pk)

        if admission.status == 'discharged':
            return Response(
                {"error": "Patient has already been discharged."},
                status=status.HTTP_400_BAD_REQUEST
            )

        discharge_notes = request.data.get('discharge_notes', '')

        admission.status = 'discharged'
        admission.discharge_date = timezone.now()
        admission.discharge_notes = discharge_notes
        admission.save()

        # Update bed status back to 'available' again!
        bed = admission.bed
        bed.status = 'available'
        bed.save()

        return Response({
            "message": f"Patient {admission.patient.user.get_full_name() or admission.patient.user.username} discharged successfully. Bed {bed.bed_number} is now Available again.",
            "admission": AdmissionSerializer(admission).data,
            "bed": BedSerializer(bed).data,
        }, status=status.HTTP_200_OK)
