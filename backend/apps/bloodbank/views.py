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
from django.utils import timezone
from datetime import timedelta

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


class BloodStockLiveView(APIView):
    """
    GET /api/bloodbank/stock/
    Returns live inventory across all 8 blood groups (A+, A-, B+, B-, O+, O-, AB+, AB-).
    Guarantees all 8 groups are seeded and returned.
    Computes critical low stock (< 3 units) summary for red alerts.
    """
    permission_classes = [IsAuthenticated]

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

        # Find or create stock record
        stock, _ = BloodStock.objects.get_or_create(
            blood_group=blood_group,
            defaults={'minimum_threshold': 3, 'expiry_date': expiry_date}
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


class DonorListCreateView(generics.ListCreateAPIView):
    """
    GET: List registered donors
    POST: Register a new donor and donation
    """
    queryset = Donor.objects.all().order_by('-donation_date')
    serializer_class = DonorSerializer
    permission_classes = [CanManageBloodBank]


class BloodRequestListCreateView(generics.ListCreateAPIView):
    """
    GET: List blood requests
    POST: Submit a new blood request
    """
    queryset = BloodRequest.objects.select_related('patient__user', 'requested_by', 'reviewed_by').all().order_by('-created_at')
    serializer_class = BloodRequestSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)
