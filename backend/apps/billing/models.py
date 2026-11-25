"""
apps/billing/models.py
======================
Hospital Billing & Invoices for OPD Consultation Fees, Ward/Bed Charges,
Lab Tests, and Blood Bank Charges with PDF Receipt generation.
"""

from decimal import Decimal
from django.db import models
from django.utils import timezone
from apps.accounts.models import Patient, User


WARD_DAILY_RATES = {
    'general': Decimal('1500.00'),
    'semi': Decimal('2500.00'),
    'private': Decimal('4500.00'),
    'icu': Decimal('8000.00'),
    'emergency': Decimal('3500.00'),
    'pediatric': Decimal('2000.00'),
    'maternity': Decimal('3000.00'),
}


class Invoice(models.Model):
    STATUS_CHOICES = [
        ('unpaid',    'Unpaid'),
        ('paid',      'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('cash',      'Cash'),
        ('card',      'Debit / Credit Card'),
        ('upi',       'UPI'),
        ('insurance', 'Insurance'),
        ('',          'Not Paid'),
    ]

    invoice_number = models.CharField(max_length=35, unique=True, blank=True)
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name='invoices'
    )
    token = models.ForeignKey(
        'opd.Token',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices'
    )
    admission = models.ForeignKey(
        'beds.Admission',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_invoices'
    )
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='unpaid')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True, default='')
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    notes = models.TextField(blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'billing_invoices'
        ordering = ['-created_at']

    def recalculate_totals(self):
        items_total = sum((item.line_total for item in self.items.all()), Decimal('0.00'))
        self.subtotal = items_total
        # Healthcare services in India OPD/IPD are exempt or standard 0% GST by default unless tax set
        self.total_amount = max(Decimal('0.00'), self.subtotal + self.tax_amount - self.discount_amount)
        self.save()

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if not self.invoice_number:
            date_str = timezone.now().strftime('%Y%m%d')
            self.invoice_number = f"INV-{date_str}-{self.pk:04d}"
            super().save(update_fields=['invoice_number'])

    def __str__(self):
        return f"{self.invoice_number} | {self.patient} | INR {self.total_amount} ({self.status})"


class InvoiceItem(models.Model):
    CATEGORY_CHOICES = [
        ('opd_fee',     'OPD Consultation Fee'),
        ('ward_charge', 'Ward / Bed Charge'),
        ('blood_bank',  'Blood Bank Processing'),
        ('lab_test',    'Lab Investigation'),
        ('medicine',    'Pharmacy / Medication'),
        ('other',       'Other Charge'),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='items'
    )
    description = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='opd_fee')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))

    class Meta:
        db_table = 'billing_invoice_items'

    def save(self, *args, **kwargs):
        self.line_total = Decimal(self.quantity) * Decimal(self.unit_price)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.description} x{self.quantity} = {self.line_total}"
