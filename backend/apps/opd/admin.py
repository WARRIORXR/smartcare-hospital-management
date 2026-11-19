"""
apps/opd/admin.py
------------------
Registers Token and Queue in Django Admin.
"""
from django.contrib import admin
from .models import Token, Queue


@admin.register(Token)
class TokenAdmin(admin.ModelAdmin):
    list_display = ('token_code', 'token_number', 'patient', 'doctor', 'priority', 'appointment_date', 'status')
    list_filter = ('status', 'priority', 'appointment_date', 'department')
    search_fields = ('token_code', 'patient__user__first_name', 'patient__user__last_name', 'doctor__user__last_name')
    ordering = ('appointment_date', 'token_number')


@admin.register(Queue)
class QueueAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'queue_date', 'current_token', 'total_tokens', 'is_active')
    list_filter = ('is_active', 'queue_date')
    search_fields = ('doctor__user__last_name',)
