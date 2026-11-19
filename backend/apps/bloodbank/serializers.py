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
    class Meta:
        model = Donor
        fields = '__all__'
        read_only_fields = ['created_at']


class BloodRequestSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BloodRequest
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_patient_name(self, obj):
        if obj.patient and obj.patient.user:
            return obj.patient.user.get_full_name() or obj.patient.user.username
        return 'Unknown'

    def get_requested_by_name(self, obj):
        if obj.requested_by:
            return obj.requested_by.get_full_name() or obj.requested_by.username
        return 'Staff'
