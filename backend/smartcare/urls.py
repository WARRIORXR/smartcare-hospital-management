"""
smartcare/urls.py
------------------
Root URL configuration for SmartCare HMS.
Includes JWT auth, all hospital module endpoints, health ping, and Swagger API documentation.
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import CustomLoginView, LogoutView


@extend_schema(responses={200: OpenApiTypes.OBJECT})
@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok', 'service': 'smartcare-hms-api'})


urlpatterns = [
    path('admin/', admin.site.urls),

    # ---- HEALTH CHECK ----
    path('api/health/', health_check, name='api_health'),

    # ---- SWAGGER / OPENAPI DOCS ----
    path('api/schema/', SpectacularAPIView.as_view(permission_classes=[AllowAny]), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema', permission_classes=[AllowAny]), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema', permission_classes=[AllowAny]), name='redoc'),

    # ---- JWT AUTH ENDPOINTS ----
    path('api/auth/login/', CustomLoginView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', LogoutView.as_view(), name='token_logout'),

    # ---- MODULE ENDPOINTS ----
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/opd/', include('apps.opd.urls')),
    path('api/beds/', include('apps.beds.urls')),
    path('api/bloodbank/', include('apps.bloodbank.urls')),
    path('api/records/', include('apps.records.urls')),
    path('api/billing/', include('apps.billing.urls')),
]
