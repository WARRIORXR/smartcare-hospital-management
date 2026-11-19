"""
apps/beds/urls.py
=================
URL Routing for Bed Management (Module 2).
Prefix: /api/beds/
"""

from django.urls import path
from .views import (
    WardListCreateView,
    WardDetailView,
    BedListCreateView,
    BedDetailView,
    BedQuickStatusUpdateView,
    BedLiveOverviewView,
    AdmissionListCreateView,
    AdmissionDischargeView,
)

urlpatterns = [
    # Live Overview for Dashboard
    path('overview/', BedLiveOverviewView.as_view(), name='bed_live_overview'),

    # Ward Endpoints
    path('wards/', WardListCreateView.as_view(), name='ward_list_create'),
    path('wards/<int:pk>/', WardDetailView.as_view(), name='ward_detail'),

    # Bed Endpoints
    path('', BedListCreateView.as_view(), name='bed_list_create'),
    path('<int:pk>/', BedDetailView.as_view(), name='bed_detail'),
    path('<int:pk>/status/', BedQuickStatusUpdateView.as_view(), name='bed_quick_status_update'),

    # Admission & Discharge
    path('admissions/', AdmissionListCreateView.as_view(), name='admission_list_create'),
    path('admissions/<int:pk>/discharge/', AdmissionDischargeView.as_view(), name='admission_discharge'),
]
