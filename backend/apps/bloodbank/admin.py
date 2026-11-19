"""
apps/bloodbank/admin.py
------------------------
Registers BloodStock, Donor, BloodRequest in Django Admin.
"""
from django.contrib import admin
from .models import BloodStock, Donor, BloodRequest


@admin.register(BloodStock)
class BloodStockAdmin(admin.ModelAdmin):
    list_display = ('blood_group', 'units_available', 'units_reserved', 'minimum_threshold', 'is_low', 'last_updated')
    list_filter = ('blood_group',)

    def is_low(self, obj):
        return obj.is_low
    is_low.boolean = True           # Shows as green/red icon in admin
    is_low.short_description = 'Low Stock?'


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
