"""
apps/records/views.py
=====================
Views for Clinical Medical Records (Visit Notes, Prescriptions, Lab Report File Upload/Download)
with strict object-level Anti-IDOR checks and AuditLog recording.
"""

import os
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.audit import record_audit_log
from .models import MedicalRecord
from .serializers import MedicalRecordSerializer


class IsDoctorOrAdminOrPatientReadOnly(permissions.BasePermission):
    """
    - GET: Patients can view own records; Doctors & Admins can view records.
    - POST / PUT / PATCH / DELETE: Doctors & Admins only.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return (
                request.user.role in ['patient', 'doctor', 'admin']
                or request.user.is_staff
                or request.user.is_superuser
            )
        return (
            request.user.role in ['doctor', 'admin']
            or request.user.is_staff
            or request.user.is_superuser
        )


def _check_record_object_access(user, record, write=False):
    if user.role in ['admin', 'doctor'] or user.is_staff or user.is_superuser:
        return True
    if not write and user.role == 'patient':
        if hasattr(user, 'patient_profile') and record.patient_id == user.patient_profile.id:
            return True
    return False


class MedicalRecordListCreateView(generics.ListCreateAPIView):
    serializer_class = MedicalRecordSerializer
    permission_classes = [IsDoctorOrAdminOrPatientReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        qs = MedicalRecord.objects.select_related('patient__user', 'doctor__user').all()

        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if hasattr(user, 'patient_profile'):
                qs = qs.filter(patient=user.patient_profile)
            else:
                return qs.none()
        elif user.role not in ['doctor', 'admin'] and not user.is_staff:
            return qs.none()

        patient_id = self.request.query_params.get('patient')
        if patient_id and (user.role in ['doctor', 'admin'] or user.is_staff):
            qs = qs.filter(patient_id=patient_id)

        record_type = self.request.query_params.get('record_type')
        if record_type:
            qs = qs.filter(record_type=record_type)

        return qs

    def perform_create(self, serializer):
        doctor = getattr(self.request.user, 'doctor_profile', None)
        record = serializer.save(
            doctor=doctor,
            created_by=self.request.user,
        )
        record_audit_log(
            self.request,
            action='CREATE',
            resource_type='MedicalRecord',
            resource_id=record.id,
            patient=record.patient,
            details=f"Created {record.record_type}: {record.title}",
        )


class MedicalRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MedicalRecordSerializer
    permission_classes = [IsDoctorOrAdminOrPatientReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        record = get_object_or_404(
            MedicalRecord.objects.select_related('patient__user', 'doctor__user'),
            pk=self.kwargs['pk']
        )
        is_write = self.request.method not in permissions.SAFE_METHODS
        if not _check_record_object_access(self.request.user, record, write=is_write):
            record_audit_log(
                self.request,
                action='VIEW',
                resource_type='MedicalRecordDenied',
                resource_id=record.id,
                details='Blocked unauthorized access to medical record.',
            )
            raise PermissionDenied("You do not have permission to access this medical record.")

        if not is_write:
            record_audit_log(
                self.request,
                action='VIEW',
                resource_type='MedicalRecord',
                resource_id=record.id,
                patient=record.patient,
                details=f"Viewed {record.record_type} #{record.id}.",
            )
        return record

    def perform_update(self, serializer):
        record = serializer.save()
        record_audit_log(
            self.request,
            action='UPDATE',
            resource_type='MedicalRecord',
            resource_id=record.id,
            patient=record.patient,
            details=f"Updated {record.record_type} #{record.id}.",
        )

    def perform_destroy(self, instance):
        record_audit_log(
            self.request,
            action='DELETE',
            resource_type='MedicalRecord',
            resource_id=instance.id,
            patient=instance.patient,
            details=f"Deleted {instance.record_type}: {instance.title}",
        )
        instance.delete()


class MedicalRecordDownloadView(APIView):
    """GET /api/records/<pk>/download/ -> Authenticated, permission-checked file download."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, pk):
        record = get_object_or_404(MedicalRecord, pk=pk)
        if not _check_record_object_access(request.user, record, write=False):
            return Response(
                {"detail": "Access denied. You cannot download another patient's lab report."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not record.attachment:
            raise Http404("No attachment found for this medical record.")

        record_audit_log(
            request,
            action='VIEW',
            resource_type='LabReportDownload',
            resource_id=record.id,
            patient=record.patient,
            details=f"Downloaded lab report attachment '{os.path.basename(record.attachment.name)}'.",
        )
        filename = os.path.basename(record.attachment.name)
        return FileResponse(record.attachment.open('rb'), as_attachment=True, filename=filename)
