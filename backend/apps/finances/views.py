"""
API Views and ViewSets for Finances and Payments (Stage 3.7).

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- documentation/phase-1/FRONTEND_API_MAPPING.md (Section 2.11 & 2.12)
- documentation/phase-1/BUSINESS_RULES_SPECIFICATION.md (Section 8)
- RBAC Stage 3.6: HasModulePermission enforcement across all modules.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import HasModulePermission
from apps.finances.models import (
    Expense,
    FeeStructure,
    Income,
    InvoiceItem,
    StudentInvoice,
    StudentPayment,
)
from apps.finances.serializers import (
    ExpenseSerializer,
    FeeStructureSerializer,
    IncomeSerializer,
    PaymentProcessSerializer,
    PaymentRefundSerializer,
    PaymentReversalSerializer,
    StudentInvoiceCreateSerializer,
    StudentInvoiceSerializer,
    StudentPaymentSerializer,
)
from apps.finances.services import (
    IdempotencyConflictError,
    PaymentConcurrencyError,
    cancel_student_invoice,
    get_financial_overview,
    get_student_fee_ledger,
)


# =========================================================================
# Fee Structure ViewSet
# =========================================================================


class FeeStructureViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for institutional Fee Structures.
    Protected by RBAC: module 'fees'.
    """

    module_name = "fees"
    permission_classes = [HasModulePermission]
    queryset = FeeStructure.objects.all().order_by("name")
    serializer_class = FeeStructureSerializer
    filterset_fields = ["fee_category", "billing_frequency", "is_active"]
    search_fields = ["name", "code"]


# =========================================================================
# Student Invoice ViewSet
# =========================================================================


class StudentInvoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for materialized student billing invoices (Option A).
    Protected by RBAC: module 'fees'.
    """

    module_name = "fees"
    permission_classes = [HasModulePermission]
    queryset = (
        StudentInvoice.objects.select_related("student")
        .prefetch_related("items__fee_structure")
        .all()
        .order_by("-month", "invoice_number")
    )

    def get_serializer_class(self):
        if self.action == "create":
            return StudentInvoiceCreateSerializer
        return StudentInvoiceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            qs = qs.filter(student_id=student_id)
        month = self.request.query_params.get("month")
        if month:
            qs = qs.filter(month=month)
        inv_status = self.request.query_params.get("status")
        if inv_status:
            qs = qs.filter(status=inv_status)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invoice = serializer.save()
            output_serializer = StudentInvoiceSerializer(invoice)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED)
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else (
                exc.messages if hasattr(exc, "messages") else str(exc)
            )
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        reason = request.data.get("reason", "")
        try:
            cancelled_inv = cancel_student_invoice(invoice, request.user, reason=reason)
            return Response(StudentInvoiceSerializer(cancelled_inv).data)
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


# =========================================================================
# Student Payment ViewSet (Append-Only Ledger)
# =========================================================================


class StudentPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Append-only payment ledger ViewSet.
    - list / retrieve: inspect historical payments
    - create: atomic payment processing via process_payment()
    - reverse: 100% full reversal voucher
    - refund: full or partial refund voucher
    - receipt: formatted printable receipt data
    Protected by RBAC: module 'payments'.
    """

    module_name = "payments"
    permission_classes = [HasModulePermission]
    queryset = (
        StudentPayment.objects.select_related(
            "student", "invoice", "recorded_by", "reversed_payment"
        )
        .all()
        .order_by("-payment_date", "-created_at")
    )
    serializer_class = StudentPaymentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        student_id = self.request.query_params.get("student_id")
        if student_id:
            qs = qs.filter(student_id=student_id)
        month = self.request.query_params.get("month")
        if month:
            qs = qs.filter(month=month)
        payment_method = self.request.query_params.get("payment_method")
        if payment_method:
            qs = qs.filter(payment_method=payment_method)
        transaction_type = self.request.query_params.get("transaction_type")
        if transaction_type:
            qs = qs.filter(transaction_type=transaction_type)
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(payment_date__gte=start_date)
        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(payment_date__lte=end_date)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = PaymentProcessSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        try:
            payment = serializer.save()
            is_created = serializer.context.get("created", True)
            output_serializer = StudentPaymentSerializer(payment)
            response_status = (
                status.HTTP_201_CREATED if is_created else status.HTTP_200_OK
            )
            return Response(output_serializer.data, status=response_status)
        except IdempotencyConflictError as exc:
            return Response(
                {"detail": str(exc), "code": "idempotency_conflict"},
                status=status.HTTP_409_CONFLICT,
            )
        except PaymentConcurrencyError as exc:
            return Response(
                {"detail": str(exc), "code": "concurrency_error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else (
                exc.messages if hasattr(exc, "messages") else str(exc)
            )
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="reverse")
    def reverse(self, request, pk=None):
        original_payment = self.get_object()
        serializer = PaymentReversalSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            reversal = serializer.save(original_payment)
            return Response(
                StudentPaymentSerializer(reversal).data, status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="refund")
    def refund(self, request, pk=None):
        original_payment = self.get_object()
        serializer = PaymentRefundSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            refund = serializer.save(original_payment)
            return Response(
                StudentPaymentSerializer(refund).data, status=status.HTTP_201_CREATED
            )
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"], url_path="receipt")
    def receipt(self, request, pk=None):
        payment = self.get_object()
        receipt_data = {
            "receipt_number": payment.receipt_number,
            "transaction_type": payment.transaction_type,
            "payment_date": str(payment.payment_date),
            "amount_paid": str(payment.amount_paid),
            "payment_method": payment.payment_method,
            "transaction_ref": payment.transaction_ref,
            "student_admission_number": payment.student.admission_number,
            "student_full_name": payment.student.full_name,
            "classroom": payment.student.classroom.name if payment.student.classroom else None,
            "fee_category": payment.fee_category,
            "month": payment.month,
            "invoice_number": payment.invoice.invoice_number if payment.invoice else None,
            "recorded_by": payment.recorded_by.full_name if payment.recorded_by else None,
            "is_reversal": payment.is_reversal,
            "reversal_reason": payment.reversal_reason,
            "notes": payment.notes,
        }
        return Response(receipt_data)


# =========================================================================
# Ledger & Reporting Views
# =========================================================================


class StudentFeeLedgerView(APIView):
    """
    Endpoint for student fee ledger breakdown by month and class.
    Protected by RBAC: module 'payments'.
    """

    module_name = "payments"
    permission_classes = [HasModulePermission]

    def get(self, request):
        month = request.query_params.get("month")
        class_id = request.query_params.get("class_id")
        ledger_data = get_student_fee_ledger(month=month, class_id=class_id)
        return Response({"ledger": ledger_data, "count": len(ledger_data)})


class FinancialOverviewView(APIView):
    """
    Endpoint for school-wide financial overview (fee collections, income, expenses, net balance).
    Protected by RBAC: module 'payments'.
    """

    module_name = "payments"
    permission_classes = [HasModulePermission]

    def get(self, request):
        month = request.query_params.get("month")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        overview = get_financial_overview(
            month=month, start_date=start_date, end_date=end_date
        )
        return Response(overview)


class ReceiptLookupView(APIView):
    """
    Direct lookup of receipt by receipt_number or ID for receipt printing.
    Protected by RBAC: module 'payments'.
    """

    module_name = "payments"
    permission_classes = [HasModulePermission]

    def get(self, request, identifier):
        payment = StudentPayment.objects.filter(receipt_number=identifier).first()
        if not payment:
            try:
                payment = StudentPayment.objects.filter(id=identifier).first()
            except Exception:
                payment = None
        if not payment:
            return Response(
                {"detail": "Receipt not found."}, status=status.HTTP_404_NOT_FOUND
            )

        receipt_data = {
            "receipt_number": payment.receipt_number,
            "transaction_type": payment.transaction_type,
            "payment_date": str(payment.payment_date),
            "amount_paid": str(payment.amount_paid),
            "payment_method": payment.payment_method,
            "transaction_ref": payment.transaction_ref,
            "student_admission_number": payment.student.admission_number,
            "student_full_name": payment.student.full_name,
            "classroom": payment.student.classroom.name if payment.student.classroom else None,
            "fee_category": payment.fee_category,
            "month": payment.month,
            "invoice_number": payment.invoice.invoice_number if payment.invoice else None,
            "recorded_by": payment.recorded_by.full_name if payment.recorded_by else None,
            "is_reversal": payment.is_reversal,
            "reversal_reason": payment.reversal_reason,
            "notes": payment.notes,
        }
        return Response(receipt_data)


# =========================================================================
# General Ledger: Incomes & Expenses ViewSets
# =========================================================================


class IncomeViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for non-tuition revenue (Incomes).
    Protected by RBAC: module 'income'.
    """

    module_name = "income"
    permission_classes = [HasModulePermission]
    queryset = Income.objects.select_related("recorded_by").all().order_by("-date", "-created_at")
    serializer_class = IncomeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for institutional expenditures (Expenses).
    Protected by RBAC: module 'expenses'.
    """

    module_name = "expenses"
    permission_classes = [HasModulePermission]
    queryset = Expense.objects.select_related("recorded_by").all().order_by("-date", "-created_at")
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs
