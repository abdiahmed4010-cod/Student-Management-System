"""
Financial & Payment URL Routing for STUDENTLY (Stage 3.7).

Authoritative Specifications:
- documentation/phase-1/FRONTEND_API_MAPPING.md (Sections 2.11 & 2.12)
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.finances.views import (
    ExpenseViewSet,
    FeeStructureViewSet,
    FinancialOverviewView,
    IncomeViewSet,
    ReceiptLookupView,
    StudentFeeLedgerView,
    StudentInvoiceViewSet,
    StudentPaymentViewSet,
)

router = DefaultRouter()
router.register(r"fee-structures", FeeStructureViewSet, basename="fee-structure")
router.register(r"invoices", StudentInvoiceViewSet, basename="student-invoice")
router.register(r"transactions", StudentPaymentViewSet, basename="payment-transaction")
router.register(r"payments", StudentPaymentViewSet, basename="student-payment")
router.register(r"incomes", IncomeViewSet, basename="income")
router.register(r"expenses", ExpenseViewSet, basename="expense")

urlpatterns = [
    path("ledger/", StudentFeeLedgerView.as_view(), name="student-fee-ledger"),
    path("overview/", FinancialOverviewView.as_view(), name="financial-overview"),
    path("receipt/<str:identifier>/", ReceiptLookupView.as_view(), name="receipt-lookup"),
    path("", include(router.urls)),
]
