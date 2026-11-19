"""
apps/bloodbank/urls.py
======================
URL Routing for Blood Bank (Module 3).
Prefix: /api/bloodbank/
"""

from django.urls import path
from .views import (
    BloodStockLiveView,
    BloodStockUpdateView,
    BloodBatchListView,
    DonorListCreateView,
    MatchingDonorsView,
    BloodRequestListCreateView,
    BloodRequestStatusUpdateView,
)

urlpatterns = [
    # Live Inventory & Staff Stock Update
    path('stock/', BloodStockLiveView.as_view(), name='blood_stock_live'),
    path('stock/update/', BloodStockUpdateView.as_view(), name='blood_stock_update'),

    # Batches
    path('batches/', BloodBatchListView.as_view(), name='blood_batches'),

    # Donors & Matching
    path('donors/', DonorListCreateView.as_view(), name='donor_list_create'),
    path('donors/matching/', MatchingDonorsView.as_view(), name='matching_donors'),

    # Requests
    path('requests/', BloodRequestListCreateView.as_view(), name='blood_requests'),
    path('requests/<int:pk>/status/', BloodRequestStatusUpdateView.as_view(), name='blood_request_status_update'),
]
