"""
apps/opd/urls.py
=================
Routing for OPD Token generation and queue tracking.
"""

from django.urls import path
from .views import (
    TokenGenerateView,
    MyTokensView,
    TokenDetailView,
    TokenCancelView,
)

urlpatterns = [
    # Generate token
    path('tokens/generate/', TokenGenerateView.as_view(), name='token_generate'),

    # Patient's tokens
    path('tokens/my-tokens/', MyTokensView.as_view(), name='my_tokens'),

    # Token detail & cancel
    path('tokens/<int:pk>/', TokenDetailView.as_view(), name='token_detail'),
    path('tokens/<int:pk>/cancel/', TokenCancelView.as_view(), name='token_cancel'),
]
