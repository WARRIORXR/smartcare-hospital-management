"""
apps/opd/urls.py
=================
Routing for OPD Tokens, Advance Slots, Notifications, Doctor Live Queue, and Display Screen.
"""

from django.urls import path
from .views import (
    DoctorAvailableSlotsView,
    DoctorCallNextView,
    DoctorCompleteView,
    DoctorQueueView,
    DoctorSkipView,
    MyNotificationsView,
    MyTokensView,
    NotificationMarkReadView,
    PublicDisplayQueueView,
    TokenCancelView,
    TokenDetailView,
    TokenGenerateView,
    TokenListView,
)

urlpatterns = [
    # Role-protected Clinical TV Display Screen (no PII)
    path('public/display/<int:doctor_id>/', PublicDisplayQueueView.as_view(), name='public_display_queue'),

    # Patient token generation, slots & tracking
    path('doctors/<int:doctor_id>/slots/', DoctorAvailableSlotsView.as_view(), name='doctor_available_slots'),
    path('tokens/', TokenListView.as_view(), name='token_list'),
    path('tokens/generate/', TokenGenerateView.as_view(), name='token_generate'),
    path('tokens/my-tokens/', MyTokensView.as_view(), name='my_tokens'),
    path('tokens/<int:pk>/', TokenDetailView.as_view(), name='token_detail'),
    path('tokens/<int:pk>/cancel/', TokenCancelView.as_view(), name='token_cancel'),

    # Queue proximity notifications (SMS / WhatsApp / In-App)
    path('notifications/', MyNotificationsView.as_view(), name='my_notifications'),
    path('notifications/read-all/', NotificationMarkReadView.as_view(), name='notifications_read_all'),
    path('notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification_mark_read'),

    # Doctor queue controls
    path('doctor/queue/', DoctorQueueView.as_view(), name='doctor_queue'),
    path('doctor/call-next/', DoctorCallNextView.as_view(), name='doctor_call_next'),
    path('doctor/complete/', DoctorCompleteView.as_view(), name='doctor_complete'),
    path('doctor/skip/', DoctorSkipView.as_view(), name='doctor_skip'),
]
