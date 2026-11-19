"""
apps/accounts/urls.py
======================
Routing for accounts app.
"""

from django.urls import path
from .views import (
    CustomLoginView,
    RegisterView,
    UserProfileView,
    DepartmentListView,
)

urlpatterns = [
    path('login/', CustomLoginView.as_view(), name='account_login'),
    path('register/', RegisterView.as_view(), name='account_register'),
    path('profile/', UserProfileView.as_view(), name='account_profile'),
    path('departments/', DepartmentListView.as_view(), name='department_list'),
]
