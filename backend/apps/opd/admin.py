"""
apps/opd/admin.py
------------------
Registers Token and Queue in Django Admin.
"""
from django.contrib import admin
from .models import Token, Queue


@admin.register(Token)
class TokenAdmin(admin.ModelAdmin):
    list_display = ('token_number', 'patient', 'doctor', 'appointment_date', 'status', 'is_emergency')
    list_filter = ('status', 'appointment_date', 'is_emergency', 'department')
    search_fields = ('patient__user__first_name', 'patient__user__last_name')
    ordering = ('appointment_date', 'token_number')


@admin.register(Queue)
class QueueAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'queue_date', 'current_token', 'total_tokens', 'is_active')
    list_filter = ('is_active', 'queue_date')
    search_fields = ('doctor__user__last_name',)
