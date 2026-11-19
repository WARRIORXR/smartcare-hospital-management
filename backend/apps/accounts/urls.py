"""
apps/accounts/urls.py
======================
Routing for accounts app: Auth, Departments, Doctors.
"""

from django.urls import path
from .views import (
    CustomLoginView,
    RegisterView,
    UserProfileView,
    DepartmentListCreateView,
    DepartmentDetailView,
    DoctorListCreateView,
    DoctorDetailView,
    PatientJourneyView,
    AdminAnalyticsDashboardView,
)

urlpatterns = [
    # Auth endpoints
    path('login/', CustomLoginView.as_view(), name='account_login'),
    path('register/', RegisterView.as_view(), name='account_register'),
    path('profile/', UserProfileView.as_view(), name='account_profile'),

    # Admin Hospital Analytics Dashboard (Step 14)
    path('admin/analytics/', AdminAnalyticsDashboardView.as_view(), name='admin_analytics'),

    # Patient Journey (Unified across Module 1, 2, 3)
    path('patients/<int:pk>/journey/', PatientJourneyView.as_view(), name='patient_journey'),

    # Department CRUD endpoints (Admin Add/Edit/Delete, Public List)
    path('departments/', DepartmentListCreateView.as_view(), name='department_list_create'),
    path('departments/<int:pk>/', DepartmentDetailView.as_view(), name='department_detail'),

    # Doctor CRUD endpoints (Admin Add/Edit/Delete, Public/Patient List)
    path('doctors/', DoctorListCreateView.as_view(), name='doctor_list_create'),
    path('doctors/<int:pk>/', DoctorDetailView.as_view(), name='doctor_detail'),
]
