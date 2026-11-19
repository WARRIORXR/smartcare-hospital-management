"""
smartcare/urls.py
------------------
Root URL configuration for SmartCare.
All app-specific URLs are included here with /api/ prefix.
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from apps.accounts.views import CustomLoginView

urlpatterns = [
    # Django Admin panel
    path('admin/', admin.site.urls),

    # ---- JWT AUTH ENDPOINTS ----
    path('api/auth/login/', CustomLoginView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # ---- APP ENDPOINTS ----
    path('api/accounts/', include('apps.accounts.urls')),   # Register, profile, departments
    path('api/opd/', include('apps.opd.urls')),             # OPD Token Queue
    path('api/beds/', include('apps.beds.urls')),           # Bed Management
    path('api/bloodbank/', include('apps.bloodbank.urls')), # Blood Bank
]
