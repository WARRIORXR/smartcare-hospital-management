"""
apps/accounts/urls.py
======================
Routing for accounts app: Auth, Password Reset, Departments, Doctors, Leave, Feedback,
Patient Directory/Journey, Audit Logs, and Admin Analytics/Exports.
"""

from django.urls import path
from .views import (
    AdminAnalyticsDashboardView,
    AdminAnalyticsExportView,
    AdminStaffListCreateView,
    AuditLogListView,
    CustomLoginView,
    DepartmentDetailView,
    DepartmentListCreateView,
    DoctorAvailabilityToggleView,
    DoctorDetailView,
    DoctorFeedbackListCreateView,
    DoctorLeaveDetailView,
    DoctorLeaveListCreateView,
    DoctorListCreateView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PatientJourneyView,
    PatientListView,
    RegisterView,
    UserProfileView,
)

urlpatterns = [
    # Auth endpoints
    path('login/', CustomLoginView.as_view(), name='account_login'),
    path('logout/', LogoutView.as_view(), name='account_logout'),
    path('register/', RegisterView.as_view(), name='account_register'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('profile/', UserProfileView.as_view(), name='account_profile'),

    # Admin Staff & Audit Logs
    path('staff/', AdminStaffListCreateView.as_view(), name='admin_staff_list_create'),
    path('audit-logs/', AuditLogListView.as_view(), name='audit_logs'),

    # Admin Hospital Analytics Dashboard & CSV/PDF Export
    path('admin/analytics/', AdminAnalyticsDashboardView.as_view(), name='admin_analytics'),
    path('admin/analytics/export/<str:export_format>/', AdminAnalyticsExportView.as_view(), name='admin_analytics_export'),

    # Patient Directory & Journey
    path('patients/', PatientListView.as_view(), name='patient_list'),
    path('patients/<int:pk>/journey/', PatientJourneyView.as_view(), name='patient_journey'),

    # Departments & Doctors CRUD + Availability / Leave / Feedback
    path('departments/', DepartmentListCreateView.as_view(), name='department_list_create'),
    path('departments/<int:pk>/', DepartmentDetailView.as_view(), name='department_detail'),
    path('doctors/', DoctorListCreateView.as_view(), name='doctor_list_create'),
    path('doctors/<int:pk>/', DoctorDetailView.as_view(), name='doctor_detail'),
    path('doctors/toggle-availability/', DoctorAvailabilityToggleView.as_view(), name='doctor_toggle_availability'),
    path('leaves/', DoctorLeaveListCreateView.as_view(), name='doctor_leaves'),
    path('leaves/<int:pk>/', DoctorLeaveDetailView.as_view(), name='doctor_leave_detail'),
    path('feedback/', DoctorFeedbackListCreateView.as_view(), name='doctor_feedback'),
]
