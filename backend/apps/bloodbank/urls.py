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
    BloodRequestListCreateView,
)

urlpatterns = [
    # Live Inventory & Staff Stock Update
    path('stock/', BloodStockLiveView.as_view(), name='blood_stock_live'),
    path('stock/update/', BloodStockUpdateView.as_view(), name='blood_stock_update'),

    # Batches
    path('batches/', BloodBatchListView.as_view(), name='blood_batches'),

    # Donors & Requests
    path('donors/', DonorListCreateView.as_view(), name='donor_list_create'),
    path('requests/', BloodRequestListCreateView.as_view(), name='blood_requests'),
]
