"""
apps/bloodbank/admin.py
------------------------
Registers BloodStock, Donor, BloodRequest in Django Admin.
"""
from django.contrib import admin
from .models import BloodStock, BloodBatch, Donor, BloodRequest


@admin.register(BloodStock)
class BloodStockAdmin(admin.ModelAdmin):
    list_display = ('blood_group', 'units_available', 'minimum_threshold', 'is_critical', 'expiry_date', 'last_updated')
    list_filter = ('blood_group',)

    def is_critical(self, obj):
        return obj.is_critical
    is_critical.boolean = True
    is_critical.short_description = 'Critical Alert (<3)?'


@admin.register(BloodBatch)
class BloodBatchAdmin(admin.ModelAdmin):
    list_display = ('batch_number', 'blood_group', 'units', 'expiry_date', 'collection_date', 'recorded_by')
    list_filter = ('blood_group', 'expiry_date')
    search_fields = ('batch_number', 'donor_name')


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display = ('name', 'blood_group', 'units_donated', 'donation_date', 'is_eligible')
    list_filter = ('blood_group', 'is_eligible', 'donation_date')
    search_fields = ('name', 'phone')


@admin.register(BloodRequest)
class BloodRequestAdmin(admin.ModelAdmin):
    list_display = ('patient', 'blood_group', 'units_required', 'priority', 'status', 'created_at')
    list_filter = ('status', 'priority', 'blood_group')
    search_fields = ('patient__user__first_name', 'patient__user__last_name')
