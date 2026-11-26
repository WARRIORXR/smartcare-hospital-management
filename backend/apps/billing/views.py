"""
apps/billing/views.py
=====================
Views for Generating OPD/Ward Invoices, Viewing Bills, Paying Invoices,
and Downloading Formatted PDF Receipts with strict Anti-IDOR checks.
"""

import math
from decimal import Decimal
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.audit import record_audit_log
from apps.accounts.models import Patient
from apps.beds.models import Admission
from apps.opd.models import Token
from .models import WARD_DAILY_RATES, Invoice, InvoiceItem
from .pdf_receipt import build_invoice_pdf_response
from .serializers import InvoiceGenerateSerializer, InvoiceSerializer


def _is_billing_staff(user):
    return bool(
        user.role in ['reception', 'admin', 'doctor']
        or user.is_staff
        or user.is_superuser
    )


def _check_invoice_access(user, invoice):
    if _is_billing_staff(user):
        return True
    if user.role == 'patient' and hasattr(user, 'patient_profile'):
        return invoice.patient_id == user.patient_profile.id
    return False


class InvoiceListView(generics.ListAPIView):
    """GET /api/billing/invoices/ -> List patient's own invoices (or all for billing staff)."""

    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Invoice.objects.select_related('patient__user', 'token', 'admission__bed__ward').prefetch_related('items').all()

        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            if hasattr(user, 'patient_profile'):
                return qs.filter(patient=user.patient_profile)
            return qs.none()

        if not _is_billing_staff(user):
            return qs.none()

        patient_id = self.request.query_params.get('patient')
        status_param = self.request.query_params.get('status')
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class InvoiceDetailView(generics.RetrieveAPIView):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        invoice = get_object_or_404(
            Invoice.objects.select_related('patient__user', 'token', 'admission__bed__ward').prefetch_related('items'),
            pk=self.kwargs['pk']
        )
        if not _check_invoice_access(self.request.user, invoice):
            raise PermissionDenied("You do not have permission to view another patient's invoice.")
        return invoice


class InvoiceGenerateView(APIView):
    """POST /api/billing/invoices/generate/ -> Generate OPD & Ward invoice (Staff/Admin/Doctor)."""

    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceGenerateSerializer

    @extend_schema(request=InvoiceGenerateSerializer, responses={201: InvoiceSerializer})
    def post(self, request):
        if not _is_billing_staff(request.user):
            return Response(
                {"detail": "Only reception, doctors, or administrators can generate hospital invoices."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = InvoiceGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        token = None
        admission = None
        patient = None

        if data.get('token_id'):
            token = get_object_or_404(Token.objects.select_related('patient', 'doctor__user'), pk=data['token_id'])
            patient = token.patient

        if data.get('admission_id'):
            admission = get_object_or_404(Admission.objects.select_related('patient', 'bed__ward'), pk=data['admission_id'])
            patient = patient or admission.patient

        if data.get('patient_id'):
            patient = get_object_or_404(Patient, pk=data['patient_id'])

        if not patient:
            return Response(
                {"detail": "Provide patient_id, token_id, or admission_id to generate an invoice."},
                status=status.HTTP_400_BAD_REQUEST
            )

        invoice = Invoice.objects.create(
            patient=patient,
            token=token,
            admission=admission,
            created_by=request.user,
            discount_amount=data.get('discount_amount', Decimal('0.00')),
            tax_amount=data.get('tax_amount', Decimal('0.00')),
            notes=data.get('notes', ''),
        )

        # Auto-add OPD Consultation Fee item
        if token:
            fee = token.doctor.consultation_fee if (token.doctor and token.doctor.consultation_fee > 0) else Decimal('500.00')
            doc_label = f"Dr. {token.doctor.user.get_full_name() or token.doctor.user.username}" if token.doctor else "OPD Specialist"
            InvoiceItem.objects.create(
                invoice=invoice,
                description=f"OPD Consultation ({token.token_code}) — {doc_label}",
                category='opd_fee',
                quantity=1,
                unit_price=fee,
            )

        # Auto-add Ward / Bed Stay Charge item
        if admission:
            end_time = admission.discharge_date or timezone.now()
            hours = max(1.0, (end_time - admission.admission_date).total_seconds() / 3600.0)
            days = max(1, math.ceil(hours / 24.0))
            ward_type = admission.bed.ward.ward_type if admission.bed and admission.bed.ward else 'general'
            daily_rate = WARD_DAILY_RATES.get(ward_type, Decimal('1500.00'))
            InvoiceItem.objects.create(
                invoice=invoice,
                description=f"{admission.bed.ward.name} ({admission.bed.bed_number}) — {days} day(s)",
                category='ward_charge',
                quantity=days,
                unit_price=daily_rate,
            )

        # Custom extra line items
        for extra in data.get('extra_items', []):
            InvoiceItem.objects.create(
                invoice=invoice,
                description=extra['description'],
                category=extra.get('category', 'other'),
                quantity=extra.get('quantity', 1),
                unit_price=extra['unit_price'],
            )

        # Ensure at least one default line item if none generated
        if not invoice.items.exists():
            InvoiceItem.objects.create(
                invoice=invoice,
                description="General OPD Consultation & Registration",
                category='opd_fee',
                quantity=1,
                unit_price=Decimal('500.00'),
            )

        invoice.recalculate_totals()
        record_audit_log(
            request,
            action='CREATE',
            resource_type='Invoice',
            resource_id=invoice.id,
            patient=patient,
            details=f"Generated {invoice.invoice_number} for INR {invoice.total_amount}.",
        )
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class InvoicePayView(APIView):
    """POST /api/billing/invoices/<pk>/pay/ -> Record payment for an invoice."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'payment_method': {'type': 'string'}}}}, responses={200: InvoiceSerializer})
    def post(self, request, pk):
        method = (request.data.get('payment_method') or 'upi').lower()
        if method not in ['cash', 'card', 'upi', 'insurance']:
            return Response({"detail": "Invalid payment method."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            invoice = get_object_or_404(Invoice.objects.select_for_update(), pk=pk)
            if not _check_invoice_access(request.user, invoice):
                return Response({"detail": "Not authorized to pay this invoice."}, status=status.HTTP_403_FORBIDDEN)

            if invoice.status == 'paid':
                return Response({"detail": "Invoice is already paid."}, status=status.HTTP_400_BAD_REQUEST)

            invoice.status = 'paid'
            invoice.payment_method = method
            invoice.paid_at = timezone.now()
            invoice.save()

        record_audit_log(
            request,
            action='UPDATE',
            resource_type='InvoicePayment',
            resource_id=invoice.id,
            patient=invoice.patient,
            details=f"Marked {invoice.invoice_number} PAID via {method.upper()}.",
        )
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_200_OK)


class InvoicePDFReceiptView(APIView):
    """GET /api/billing/invoices/<pk>/pdf/ -> Download official PDF receipt."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.BINARY})
    def get(self, request, pk):
        invoice = get_object_or_404(
            Invoice.objects.select_related('patient__user', 'token', 'admission__bed__ward').prefetch_related('items'),
            pk=pk
        )
        if not _check_invoice_access(request.user, invoice):
            return Response(
                {"detail": "Access denied. You cannot download another patient's receipt."},
                status=status.HTTP_403_FORBIDDEN
            )

        record_audit_log(
            request,
            action='EXPORT',
            resource_type='InvoicePDFReceipt',
            resource_id=invoice.id,
            patient=invoice.patient,
            details=f"Downloaded PDF receipt {invoice.invoice_number}.",
        )
        return build_invoice_pdf_response(invoice)
