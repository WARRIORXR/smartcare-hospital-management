"""
apps/beds/admin.py
-------------------
Registers Ward, Bed, Admission in Django Admin.
"""
from django.contrib import admin
from .models import Ward, Bed, Admission


@admin.register(Ward)
class WardAdmin(admin.ModelAdmin):
    list_display = ('name', 'ward_type', 'department', 'total_beds', 'available_beds', 'is_active')
    list_filter = ('ward_type', 'is_active', 'floor_number')
    search_fields = ('name',)

    # 'available_beds' is a computed property, not a DB field
    def available_beds(self, obj):
        return obj.available_beds
    available_beds.short_description = 'Available Beds'


@admin.register(Bed)
class BedAdmin(admin.ModelAdmin):
    list_display = ('bed_number', 'ward', 'status', 'has_oxygen', 'has_ventilator')
    list_filter = ('status', 'ward', 'has_oxygen', 'has_ventilator')
    search_fields = ('bed_number', 'ward__name')


@admin.register(Admission)
class AdmissionAdmin(admin.ModelAdmin):
    list_display = ('patient', 'bed', 'attending_doctor', 'admission_date', 'discharge_date', 'status')
    list_filter = ('status', 'admission_date')
    search_fields = ('patient__user__first_name', 'patient__user__last_name')
