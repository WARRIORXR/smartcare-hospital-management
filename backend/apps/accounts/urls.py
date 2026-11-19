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
)

urlpatterns = [
    # Auth endpoints
    path('login/', CustomLoginView.as_view(), name='account_login'),
    path('register/', RegisterView.as_view(), name='account_register'),
    path('profile/', UserProfileView.as_view(), name='account_profile'),

    # Department CRUD endpoints (Admin Add/Edit/Delete, Public List)
    path('departments/', DepartmentListCreateView.as_view(), name='department_list_create'),
    path('departments/<int:pk>/', DepartmentDetailView.as_view(), name='department_detail'),

    # Doctor CRUD endpoints (Admin Add/Edit/Delete, Public/Patient List)
    path('doctors/', DoctorListCreateView.as_view(), name='doctor_list_create'),
    path('doctors/<int:pk>/', DoctorDetailView.as_view(), name='doctor_detail'),
]
