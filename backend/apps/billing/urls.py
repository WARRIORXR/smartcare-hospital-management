"""
apps/billing/urls.py
====================
"""

from django.urls import path
from .views import (
    InvoiceDetailView,
    InvoiceGenerateView,
    InvoiceListView,
    InvoicePDFReceiptView,
    InvoicePayView,
)

urlpatterns = [
    path('invoices/', InvoiceListView.as_view(), name='invoice_list'),
    path('invoices/generate/', InvoiceGenerateView.as_view(), name='invoice_generate'),
    path('invoices/<int:pk>/', InvoiceDetailView.as_view(), name='invoice_detail'),
    path('invoices/<int:pk>/pay/', InvoicePayView.as_view(), name='invoice_pay'),
    path('invoices/<int:pk>/pdf/', InvoicePDFReceiptView.as_view(), name='invoice_pdf_receipt'),
]
