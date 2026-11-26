"""
apps/bloodbank/views.py
=======================
API Views for Blood Bank Stock, Batches, Donors, and Blood Requests (Module 3).

Endpoints:
  - GET   /api/bloodbank/stock/         -> Live blood stock for all 8 blood groups
  - POST  /api/bloodbank/stock/update/  -> Staff Add/Update units with Expiry Date
  - GET   /api/bloodbank/batches/       -> List logged blood batches
  - POST  /api/bloodbank/batches/       -> Add new blood batch
  - GET, POST /api/bloodbank/donors/    -> Donor management
  - GET, POST /api/bloodbank/requests/  -> Blood requests
"""

from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from apps.accounts.audit import record_audit_log
from .models import (
    BloodStock,
    BloodBatch,
    Donor,
    BloodRequest,
    BLOOD_GROUP_CHOICES,
)
from .serializers import (
    BloodStockSerializer,
    BloodStockUpdateSerializer,
    BloodBatchSerializer,
    DonorSerializer,
    BloodRequestSerializer,
)


ALL_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']


class CanManageBloodBank(permissions.BasePermission):
    """
    Allows Blood Bank Staff and Administrators to modify blood inventory.
    All authenticated users can read the live inventory.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return (
            request.user.role in ['bloodbank_staff', 'admin'] or
            request.user.is_staff or
            request.user.is_superuser
        )


class CanViewDonors(permissions.BasePermission):
    """
    Protects donor privacy: Only hospital staff, doctors, and blood bank admins
    can view or register donors. Regular patients are blocked from donor PII.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return (
            request.user.role in ['bloodbank_staff', 'admin', 'doctor'] or
            request.user.is_staff or
            request.user.is_superuser
        )


class BloodStockLiveView(APIView):
    """
    GET /api/bloodbank/stock/
    Returns live inventory across all 8 blood groups (A+, A-, B+, B-, O+, O-, AB+, AB-).
    Guarantees all 8 groups are seeded and returned.
    Computes critical low stock (< 3 units) summary for red alerts.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        # Ensure all 8 groups exist in DB
        existing_groups = set(BloodStock.objects.values_list('blood_group', flat=True))
        default_expiry = timezone.now().date() + timedelta(days=35)

        for bg in ALL_BLOOD_GROUPS:
            if bg not in existing_groups:
                BloodStock.objects.create(
                    blood_group=bg,
                    units_available=0,
                    minimum_threshold=3,
                    expiry_date=default_expiry,
                )

        stocks = BloodStock.objects.all().order_by('blood_group')
        serializer = BloodStockSerializer(stocks, many=True)

        total_units = sum(s.units_available for s in stocks)
        critical_groups = [s.blood_group for s in stocks if s.units_available < 3]

        return Response({
            "summary": {
                "total_units": total_units,
                "critical_count": len(critical_groups),
                "critical_groups": critical_groups,
                "has_red_alert": len(critical_groups) > 0,
                "threshold_rule": "Red Alert triggered when stock is less than 3 units",
            },
            "stock": serializer.data,
            "timestamp": timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class BloodStockUpdateView(APIView):
    """
    POST /api/bloodbank/stock/update/
    Blood Bank Staff can add or update blood units with an expiry date.
    Actions:
      - 'set': set exact quantity
      - 'add': add new units (+)
      - 'deduct': deduct consumed units (-)
    """
    permission_classes = [CanManageBloodBank]
    serializer_class = BloodStockUpdateSerializer

    @extend_schema(request=BloodStockUpdateSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = BloodStockUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        blood_group = data['blood_group']
        units = data['units']
        action = data['action']
        expiry_date = data['expiry_date']
        notes = data.get('notes', '')
        donor_name = data.get('donor_name', '')

        with transaction.atomic():
            # Find or create locked stock record
            stock = BloodStock.objects.select_for_update().filter(blood_group=blood_group).first()
            if not stock:
                stock = BloodStock.objects.create(
                    blood_group=blood_group,
                    minimum_threshold=3,
                    expiry_date=expiry_date,
                )

            previous_units = stock.units_available

            if action == 'set':
                stock.units_available = units
            elif action == 'add':
                stock.units_available += units
            elif action == 'deduct':
                if stock.units_available < units:
                    return Response(
                        {"error": f"Cannot deduct {units} units. Only {stock.units_available} units of {blood_group} are available in stock."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                stock.units_available -= units

            stock.expiry_date = expiry_date
            stock.save()

            # Log batch entry if units were added
            if action in ['add', 'set'] and units > 0:
                batch_num = f"BB-{blood_group.replace('+', 'P').replace('-', 'N')}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
                BloodBatch.objects.create(
                    blood_group=blood_group,
                    units=units if action == 'add' else max(1, units),
                    batch_number=batch_num,
                    expiry_date=expiry_date,
                    donor_name=donor_name,
                    recorded_by=request.user,
                    notes=notes,
                )

        updated_serializer = BloodStockSerializer(stock)

        return Response({
            "message": f"Successfully updated {blood_group} stock: {previous_units} → {stock.units_available} units (Expiry: {expiry_date}).",
            "stock": updated_serializer.data,
            "is_critical": stock.units_available < 3,
        }, status=status.HTTP_200_OK)


class BloodBatchListView(generics.ListCreateAPIView):
    """
    GET: List all blood batches
    POST: Log a new batch with batch number and expiry date
    """
    queryset = BloodBatch.objects.all().order_by('expiry_date', '-created_at')
    serializer_class = BloodBatchSerializer
    permission_classes = [CanManageBloodBank]

    def perform_create(self, serializer):
        batch = serializer.save(recorded_by=self.request.user)
        # Also increment stock
        stock, _ = BloodStock.objects.get_or_create(
            blood_group=batch.blood_group,
            defaults={'minimum_threshold': 3, 'expiry_date': batch.expiry_date}
        )
        stock.units_available += batch.units
        # Update expiry to earlier of current or batch expiry
        if not stock.expiry_date or batch.expiry_date < stock.expiry_date:
            stock.expiry_date = batch.expiry_date
        stock.save()


COMPATIBLE_DONORS = {
    'O-':  ['O-'],
    'O+':  ['O+', 'O-'],
    'A-':  ['A-', 'O-'],
    'A+':  ['A+', 'A-', 'O+', 'O-'],
    'B-':  ['B-', 'O-'],
    'B+':  ['B+', 'B-', 'O+', 'O-'],
    'AB-': ['AB-', 'A-', 'B-', 'O-'],
    'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
}


class DonorListCreateView(generics.ListCreateAPIView):
    """
    GET: List registered donors (searchable by ?blood_group= and ?city=)
    POST: Register a new blood donor (Name, Blood Group, Phone, City, Last Donation Date)
    """
    serializer_class = DonorSerializer
    permission_classes = [CanViewDonors]

    def get_queryset(self):
        queryset = Donor.objects.all().order_by('-created_at')
        blood_group = self.request.query_params.get('blood_group')
        city = self.request.query_params.get('city')
        can_donate = self.request.query_params.get('can_donate')

        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)
        if city:
            queryset = queryset.filter(city__icontains=city)
        if can_donate == 'true':
            queryset = queryset.filter(is_eligible=True)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(recorded_by=user)


class MatchingDonorsView(APIView):
    """
    GET /api/bloodbank/donors/matching/?blood_group=O-&city=Mumbai
    Returns matching donors compatible with requested blood group.
    """
    permission_classes = [CanViewDonors]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        blood_group = request.query_params.get('blood_group', '').strip().upper()
        city = request.query_params.get('city', '').strip()

        if not blood_group:
            return Response(
                {"error": "blood_group parameter is required (e.g. ?blood_group=O-)"},
                status=status.HTTP_400_BAD_REQUEST
            )

        compatible_groups = COMPATIBLE_DONORS.get(blood_group, [blood_group])

        donors_qs = Donor.objects.filter(
            blood_group__in=compatible_groups,
            is_eligible=True
        )

        if city:
            # Sort donors from same city first
            donors_qs = sorted(
                donors_qs,
                key=lambda d: (0 if city.lower() in (d.city or '').lower() else 1, d.created_at),
                reverse=False
            )
        else:
            donors_qs = donors_qs.order_by('-created_at')

        serializer = DonorSerializer(donors_qs[:20], many=True)

        # Check current stock
        stock = BloodStock.objects.filter(blood_group=blood_group).first()
        available_units = stock.units_available if stock else 0

        return Response({
            "requested_blood_group": blood_group,
            "compatible_blood_groups": compatible_groups,
            "available_stock_units": available_units,
            "is_stock_low": available_units < 3,
            "matching_donors_count": len(serializer.data),
            "donors": serializer.data,
        }, status=status.HTTP_200_OK)


class BloodRequestListCreateView(APIView):
    """
    GET: List blood requests (filtered by user role)
    POST: Submit a blood request with urgency Normal/Urgent/Emergency.
          If stock is low (< 3 units or < requested units), automatically returns matching donors!
    """
    permission_classes = [IsAuthenticated]
    serializer_class = BloodRequestSerializer

    @extend_schema(responses={200: BloodRequestSerializer(many=True)})
    def get(self, request):
        user = request.user
        queryset = BloodRequest.objects.select_related(
            'patient__user', 'requested_by', 'reviewed_by'
        ).all().order_by('-created_at')

        # Patients see only their own requests
        if user.role == 'patient' and not (user.is_staff or user.is_superuser):
            queryset = queryset.filter(patient__user=user)

        priority = request.query_params.get('priority')
        status_param = request.query_params.get('status')
        blood_group = request.query_params.get('blood_group')

        if priority:
            queryset = queryset.filter(priority=priority)
        if status_param:
            queryset = queryset.filter(status=status_param)
        if blood_group:
            queryset = queryset.filter(blood_group=blood_group)

        serializer = BloodRequestSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = BloodRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        blood_group = serializer.validated_data.get('blood_group')
        units_required = serializer.validated_data.get('units_required', 1)
        priority = serializer.validated_data.get('priority', 'normal')
        patient_name = serializer.validated_data.get('patient_name', '')

        # Resolve Patient (linked by patient ID); enforce Anti-IDOR for patients
        patient = None
        patient_id = request.data.get('patient_id') or request.data.get('patient')
        is_staff_caller = (
            request.user.role in ['doctor', 'reception', 'bloodbank_staff', 'admin']
            or request.user.is_staff
            or request.user.is_superuser
        )

        if request.user.role == 'patient' and not (request.user.is_staff or request.user.is_superuser):
            if not hasattr(request.user, 'patient_profile'):
                return Response({'detail': 'Patient profile required.'}, status=status.HTTP_403_FORBIDDEN)
            own_profile = request.user.patient_profile
            if patient_id and str(patient_id) != str(own_profile.id):
                return Response(
                    {'detail': 'Access denied. Patients can only request blood for their own profile.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            patient = own_profile
            if not patient_name:
                patient_name = request.user.get_full_name() or request.user.username
        elif patient_id:
            from apps.accounts.models import Patient
            patient = Patient.objects.filter(pk=patient_id).first()
            if patient and not patient_name:
                patient_name = patient.user.get_full_name() or patient.user.username
        elif hasattr(request.user, 'patient_profile'):
            patient = request.user.patient_profile
            if not patient_name:
                patient_name = request.user.get_full_name() or request.user.username

        # Save Blood Request
        blood_request = serializer.save(
            requested_by=request.user,
            patient=patient,
            patient_name=patient_name or 'Patient',
            status='pending',
        )

        record_audit_log(
            request,
            action='CREATE',
            resource_type='BloodRequest',
            resource_id=blood_request.id,
            patient=patient,
            details=f"Requested {units_required}u of {blood_group} ({priority}).",
        )

        # Check Stock Level
        stock = BloodStock.objects.filter(blood_group=blood_group).first()
        available_units = stock.units_available if stock else 0
        is_stock_low = available_units < 3 or available_units < units_required

        # Never expose voluntary donor phone numbers/PII to non-staff callers (patients)
        matching_donors_data = []
        if is_stock_low and is_staff_caller:
            compatible_groups = COMPATIBLE_DONORS.get(blood_group, [blood_group])
            matching_donors = Donor.objects.filter(
                blood_group__in=compatible_groups,
                is_eligible=True
            ).order_by('-created_at')[:15]
            matching_donors_data = DonorSerializer(matching_donors, many=True).data

        return Response({
            "message": f"Blood request #{blood_request.id} for {units_required} unit(s) of {blood_group} submitted with {priority.upper()} priority.",
            "request": BloodRequestSerializer(blood_request).data,
            "stock_status": {
                "blood_group": blood_group,
                "units_available": available_units,
                "units_required": units_required,
                "is_stock_low": is_stock_low,
                "alert_message": (
                    f"⚠️ ATTENTION: {blood_group} stock is critically low! (Available: {available_units} units, Required: {units_required} units). Matching donors listed below for immediate outreach."
                    if is_stock_low
                    else f"✅ Stock sufficient ({available_units} units available in blood bank)."
                ),
            },
            "matching_donors": matching_donors_data,
        }, status=status.HTTP_201_CREATED)


class BloodRequestStatusUpdateView(APIView):
    """
    PATCH /api/bloodbank/requests/<id>/status/
    Staff or Doctor can approve, fulfill, or reject blood requests.
    On approval/fulfillment, units are decremented from BloodStock.
    """
    permission_classes = [CanManageBloodBank]

    @extend_schema(request={'application/json': {'type': 'object', 'properties': {'status': {'type': 'string'}, 'rejection_reason': {'type': 'string'}}}}, responses={200: OpenApiTypes.OBJECT})
    def patch(self, request, pk):
        from django.shortcuts import get_object_or_404

        new_status = request.data.get('status')
        rejection_reason = request.data.get('rejection_reason', '')

        valid_statuses = ['approved', 'rejected', 'fulfilled', 'cancelled']
        if new_status not in valid_statuses:
            return Response(
                {"error": f"Invalid status '{new_status}'. Allowed: {valid_statuses}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            blood_request = get_object_or_404(BloodRequest.objects.select_for_update(), pk=pk)

            # Terminal states cannot be re-fulfilled or reverted (prevents double stock deduction)
            if blood_request.status in ['fulfilled', 'rejected', 'cancelled']:
                return Response(
                    {"error": f"Request #{blood_request.id} is already {blood_request.status} and cannot be modified."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if new_status == 'fulfilled':
                stock = BloodStock.objects.select_for_update().filter(blood_group=blood_request.blood_group).first()
                if not stock or stock.units_available < blood_request.units_required:
                    return Response(
                        {"error": f"Insufficient {blood_request.blood_group} blood units in stock to fulfill this request."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                stock.units_available -= blood_request.units_required
                stock.save()
                blood_request.units_provided = blood_request.units_required

            blood_request.status = new_status
            blood_request.reviewed_by = request.user
            if rejection_reason:
                blood_request.rejection_reason = rejection_reason
            blood_request.save()

        record_audit_log(
            request,
            action='UPDATE',
            resource_type='BloodRequestStatus',
            resource_id=blood_request.id,
            patient=blood_request.patient,
            details=f"BloodRequest #{blood_request.id} updated to {new_status}.",
        )

        return Response({
            "message": f"Blood Request #{blood_request.id} status updated to {new_status.upper()}.",
            "request": BloodRequestSerializer(blood_request).data,
        }, status=status.HTTP_200_OK)
