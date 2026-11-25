"""
apps/billing/serializers.py
===========================
Serializers for Invoices and Invoice Line Items.
"""

from decimal import Decimal
from rest_framework import serializers
from .models import Invoice, InvoiceItem


class InvoiceItemSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'description', 'category', 'category_display',
            'quantity', 'unit_price', 'line_total'
        ]
        read_only_fields = ['id', 'line_total']


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_code = serializers.CharField(source='patient.patient_id', read_only=True)
    token_code = serializers.CharField(source='token.token_code', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'patient', 'patient_name', 'patient_code',
            'token', 'token_code', 'admission', 'status', 'status_display',
            'payment_method', 'subtotal', 'tax_amount', 'discount_amount',
            'total_amount', 'notes', 'paid_at', 'items', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'invoice_number', 'subtotal', 'total_amount',
            'paid_at', 'created_at', 'updated_at',
        ]

    def get_patient_name(self, obj):
        return obj.patient.user.get_full_name() or obj.patient.user.username


class InvoiceGenerateItemInputSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    category = serializers.ChoiceField(choices=InvoiceItem.CATEGORY_CHOICES, default='other')
    quantity = serializers.IntegerField(min_value=1, default=1)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'))


class InvoiceGenerateSerializer(serializers.Serializer):
    patient_id = serializers.IntegerField(required=False, allow_null=True)
    token_id = serializers.IntegerField(required=False, allow_null=True)
    admission_id = serializers.IntegerField(required=False, allow_null=True)
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'), default=Decimal('0.00'))
    tax_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'), default=Decimal('0.00'))
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    extra_items = InvoiceGenerateItemInputSerializer(many=True, required=False, default=list)
