"""
apps/accounts/admin.py
-----------------------
Registers User, Department, Doctor, Patient models
in the Django Admin panel (accessible at /admin/)
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Department, Doctor, Patient


# Custom User Admin — extends default to show 'role' field
@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # Columns shown in list view
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_active')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('username', 'email', 'first_name', 'last_name')

    # Add 'role' and 'phone' to the user edit form
    fieldsets = BaseUserAdmin.fieldsets + (
        ('SmartCare Info', {'fields': ('role', 'phone')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('SmartCare Info', {'fields': ('role', 'phone')}),
    )


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('user', 'department', 'specialization', 'room_number', 'avg_consult_minutes', 'experience_years', 'is_available')
    list_filter = ('department', 'is_available')
    search_fields = ('user__first_name', 'user__last_name', 'specialization', 'room_number')


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('user', 'patient_id', 'blood_group', 'gender', 'created_at')
    list_filter = ('blood_group', 'gender')
    search_fields = ('user__first_name', 'user__last_name', 'patient_id')
