"""
apps/bloodbank/serializers.py
=============================
Serializers for Blood Bank Stock, Batches, Donors, and Requests (Module 3).
"""

from rest_framework import serializers
from django.utils import timezone
from .models import BloodStock, BloodBatch, Donor, BloodRequest, BLOOD_GROUP_CHOICES


class BloodStockSerializer(serializers.ModelSerializer):
    """
    Serializer for Blood Stock inventory per blood group.
    Includes is_critical (< 3 units) and days_until_expiry calculations.
    """
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)
    is_critical = serializers.BooleanField(read_only=True)
    is_low = serializers.BooleanField(read_only=True)
    total_usable = serializers.IntegerField(read_only=True)
    days_until_expiry = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = BloodStock
        fields = [
            'id',
            'blood_group',
            'blood_group_display',
            'units_available',
            'units_reserved',
            'total_usable',
            'minimum_threshold',
            'expiry_date',
            'is_critical',
            'is_low',
            'days_until_expiry',
            'is_expired',
            'last_updated',
        ]
        read_only_fields = ['last_updated']

    def get_days_until_expiry(self, obj):
        if not obj.expiry_date:
            return None
        today = timezone.now().date()
        return (obj.expiry_date - today).days

    def get_is_expired(self, obj):
        if not obj.expiry_date:
            return False
        return obj.expiry_date < timezone.now().date()


class BloodStockUpdateSerializer(serializers.Serializer):
    """
    Serializer for Staff adding/updating blood units with an expiry date.
    Supports actions: 'set' (override total), 'add' (increase stock), 'deduct' (consume stock).
    """
    ACTION_CHOICES = [
        ('set', 'Set Exact Quantity'),
        ('add', 'Add Units (+)'),
        ('deduct', 'Deduct Units (-)'),
    ]

    blood_group = serializers.ChoiceField(choices=BLOOD_GROUP_CHOICES)
    units = serializers.IntegerField(min_value=0)
    action = serializers.ChoiceField(choices=ACTION_CHOICES, default='set')
    expiry_date = serializers.DateField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    donor_name = serializers.CharField(required=False, allow_blank=True, default='')


class BloodBatchSerializer(serializers.ModelSerializer):
    """
    Serializer for individual blood batches with batch numbers and expiration dates.
    """
    recorded_by_name = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()

    class Meta:
        model = BloodBatch
        fields = [
            'id',
            'blood_group',
            'units',
            'batch_number',
            'donor_name',
            'collection_date',
            'expiry_date',
            'recorded_by',
            'recorded_by_name',
            'is_disposed',
            'notes',
            'days_until_expiry',
            'created_at',
        ]
        read_only_fields = ['collection_date', 'created_at']

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return obj.recorded_by.get_full_name() or obj.recorded_by.username
        return 'System Staff'

    def get_days_until_expiry(self, obj):
        if not obj.expiry_date:
            return None
        return (obj.expiry_date - timezone.now().date()).days


class DonorSerializer(serializers.ModelSerializer):
    """
    Serializer for Blood Donors (Name, Blood Group, Phone, City, Last Donation Date).
    """
    can_donate_now = serializers.BooleanField(read_only=True)
    days_since_last_donation = serializers.IntegerField(read_only=True)
    blood_group_display = serializers.CharField(source='get_blood_group_display', read_only=True)

    class Meta:
        model = Donor
        fields = [
            'id',
            'name',
            'blood_group',
            'blood_group_display',
            'phone',
            'city',
            'age',
            'gender',
            'address',
            'last_donation_date',
            'is_eligible',
            'can_donate_now',
            'days_since_last_donation',
            'notes',
            'created_at',
        ]
        read_only_fields = ['created_at']


class BloodRequestSerializer(serializers.ModelSerializer):
    """
    Serializer for Blood Unit Requests (Patient/Doctor with Urgency Normal/Urgent/Emergency).
    """
    patient_name = serializers.CharField(required=False, allow_blank=True)
    requested_by_name = serializers.SerializerMethodField()
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    available_units_now = serializers.SerializerMethodField()
    is_stock_low = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = [
            'id',
            'patient',
            'patient_name',
            'hospital_ward',
            'requested_by',
            'requested_by_name',
            'blood_group',
            'units_required',
            'units_provided',
            'purpose',
            'priority',
            'priority_display',
            'status',
            'status_display',
            'required_by_date',
            'notes',
            'available_units_now',
            'is_stock_low',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'requested_by']

    def get_patient_name(self, obj):
        if obj.patient_name:
            return obj.patient_name
        if obj.patient and obj.patient.user:
            return obj.patient.user.get_full_name() or obj.patient.user.username
        return 'Patient'

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return 'Medical Staff'

    def get_available_units_now(self, obj):
        stock = BloodStock.objects.filter(blood_group=obj.blood_group).first()
        return stock.units_available if stock else 0

    def get_is_stock_low(self, obj):
        stock = BloodStock.objects.filter(blood_group=obj.blood_group).first()
        if not stock:
            return True
        return stock.units_available < 3 or stock.units_available < obj.units_required
