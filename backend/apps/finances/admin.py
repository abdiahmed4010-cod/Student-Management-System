"""
Django Admin Configuration for Financial Models (Stage 3.7).

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- Payment Ledger Immutability: Prohibits changes and deletions on StudentPayment via Admin.
"""

from django.contrib import admin
from apps.finances.models import (
    FeeStructure,
    StudentInvoice,
    InvoiceItem,
    StudentPayment,
    Income,
    Expense,
)


@admin.register(FeeStructure)
class FeeStructureAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "code",
        "fee_category",
        "default_amount",
        "currency",
        "billing_frequency",
        "is_active",
    ]
    list_filter = ["fee_category", "billing_frequency", "is_active"]
    search_fields = ["name", "code"]
    readonly_fields = ["id", "created_at", "updated_at"]


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    readonly_fields = ["id", "created_at"]


@admin.register(StudentInvoice)
class StudentInvoiceAdmin(admin.ModelAdmin):
    inlines = [InvoiceItemInline]
    list_display = [
        "invoice_number",
        "student",
        "month",
        "total_amount_due",
        "total_amount_paid",
        "status",
        "due_date",
    ]
    list_filter = ["status", "month"]
    search_fields = ["invoice_number", "student__admission_number", "student__full_name"]
    readonly_fields = ["id", "invoice_number", "total_amount_paid", "created_at", "updated_at"]


@admin.register(StudentPayment)
class StudentPaymentAdmin(admin.ModelAdmin):
    """
    Admin configuration for the append-only StudentPayment ledger.
    Strictly prohibits change and delete operations.
    """

    list_display = [
        "receipt_number",
        "student",
        "invoice",
        "fee_category",
        "month",
        "amount_paid",
        "payment_method",
        "payment_date",
        "transaction_type",
        "is_reversal",
    ]
    list_filter = [
        "payment_method",
        "transaction_type",
        "is_reversal",
        "month",
        "payment_date",
    ]
    search_fields = [
        "receipt_number",
        "transaction_ref",
        "student__admission_number",
        "student__full_name",
    ]
    readonly_fields = [
        "id",
        "receipt_number",
        "invoice",
        "student",
        "fee_category",
        "month",
        "amount_due",
        "amount_paid",
        "payment_method",
        "payment_date",
        "transaction_ref",
        "recorded_by",
        "transaction_type",
        "is_reversal",
        "reversed_payment",
        "reversal_reason",
        "notes",
        "created_at",
    ]

    def has_change_permission(self, request, obj=None):
        # Immutable ledger records cannot be edited in Django Admin
        return False

    def has_delete_permission(self, request, obj=None):
        # Immutable ledger records cannot be deleted in Django Admin
        return False


@admin.register(Income)
class IncomeAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "category",
        "amount",
        "payment_method",
        "date",
        "reference_number",
        "recorded_by",
    ]
    list_filter = ["category", "payment_method", "date"]
    search_fields = ["title", "reference_number", "category"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "category",
        "amount",
        "payment_method",
        "date",
        "reference_number",
        "recorded_by",
    ]
    list_filter = ["category", "payment_method", "date"]
    search_fields = ["title", "reference_number", "category"]
    readonly_fields = ["id", "created_at", "updated_at"]
