"""
apps/opd/urls.py
=================
Routing for OPD Token generation, Patient tracking, and Doctor live queue.
"""

from django.urls import path
from .views import (
    TokenGenerateView,
    MyTokensView,
    TokenListView,
    TokenDetailView,
    TokenCancelView,
    DoctorQueueView,
    DoctorCallNextView,
    DoctorCompleteView,
    DoctorSkipView,
    PublicDisplayQueueView,
)

urlpatterns = [
    # Public TV Display Screen (no login required)
    path('public/display/<int:doctor_id>/', PublicDisplayQueueView.as_view(), name='public_display_queue'),

    # Patient token generation & tracking
    path('tokens/', TokenListView.as_view(), name='token_list'),
    path('tokens/generate/', TokenGenerateView.as_view(), name='token_generate'),
    path('tokens/my-tokens/', MyTokensView.as_view(), name='my_tokens'),
    path('tokens/<int:pk>/', TokenDetailView.as_view(), name='token_detail'),
    path('tokens/<int:pk>/cancel/', TokenCancelView.as_view(), name='token_cancel'),

    # Doctor queue controls (Call Next, Complete, Skip)
    path('doctor/queue/', DoctorQueueView.as_view(), name='doctor_queue'),
    path('doctor/call-next/', DoctorCallNextView.as_view(), name='doctor_call_next'),
    path('doctor/complete/', DoctorCompleteView.as_view(), name='doctor_complete'),
    path('doctor/skip/', DoctorSkipView.as_view(), name='doctor_skip'),
]
