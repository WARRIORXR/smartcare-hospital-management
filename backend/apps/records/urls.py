"""
apps/records/urls.py
====================
"""

from django.urls import path
from .views import (
    MedicalRecordDetailView,
    MedicalRecordDownloadView,
    MedicalRecordListCreateView,
)

urlpatterns = [
    path('', MedicalRecordListCreateView.as_view(), name='medical_record_list_create'),
    path('<int:pk>/', MedicalRecordDetailView.as_view(), name='medical_record_detail'),
    path('<int:pk>/download/', MedicalRecordDownloadView.as_view(), name='medical_record_download'),
]
