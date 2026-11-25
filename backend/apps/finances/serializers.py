"""
Serializers for Financial Models, Payment Engine & Invoicing (Stage 3.7).

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- documentation/phase-1/FRONTEND_API_MAPPING.md (Section 2.11 & 2.12)
- documentation/phase-1/BUSINESS_RULES_SPECIFICATION.md (Section 8)
"""

from decimal import Decimal

from rest_framework import serializers

from apps.finances.models import (
    Expense,
    FeeStructure,
    Income,
    InvoiceItem,
    StudentInvoice,
    StudentPayment,
)
from apps.finances.services import (
    generate_student_invoice,
    process_payment,
    refund_payment,
    reverse_payment,
)
from apps.students.models import Student


# =========================================================================
# Fee Structure Serializers
# =========================================================================


class FeeStructureSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeStructure
        fields = [
            "id",
            "name",
            "code",
            "fee_category",
            "default_amount",
            "currency",
            "billing_frequency",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_code(self, value):
        return value.strip().upper()

    def validate_default_amount(self, value):
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Default amount cannot be negative.")
        return value


# =========================================================================
# Invoice Item Serializers
# =========================================================================


class InvoiceItemSerializer(serializers.ModelSerializer):
    fee_structure_name = serializers.ReadOnlyField(source="fee_structure.name")
    fee_structure_code = serializers.ReadOnlyField(source="fee_structure.code")

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "invoice",
            "fee_structure",
            "fee_structure_name",
            "fee_structure_code",
            "description",
            "amount",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InvoiceItemInputSerializer(serializers.Serializer):
    fee_structure_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.00"))
    description = serializers.CharField(max_length=150, required=False, allow_blank=True)


# =========================================================================
# Student Invoice Serializers
# =========================================================================


class StudentInvoiceSerializer(serializers.ModelSerializer):
    student_admission_number = serializers.ReadOnlyField(source="student.admission_number")
    student_full_name = serializers.ReadOnlyField(source="student.full_name")
    outstanding_balance = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    items = InvoiceItemSerializer(many=True, read_only=True)

    class Meta:
        model = StudentInvoice
        fields = [
            "id",
            "invoice_number",
            "student",
            "student_admission_number",
            "student_full_name",
            "month",
            "total_amount_due",
            "total_amount_paid",
            "outstanding_balance",
            "status",
            "due_date",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice_number",
            "total_amount_paid",
            "outstanding_balance",
            "status",
            "created_at",
            "updated_at",
        ]


class StudentInvoiceCreateSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    month = serializers.RegexField(regex=r"^\d{4}-\d{2}$")
    due_date = serializers.DateField()
    items = InvoiceItemInputSerializer(many=True, min_length=1)

    def validate_student_id(self, value):
        try:
            return Student.objects.get(id=value)
        except Student.DoesNotExist:
            raise serializers.ValidationError("Student not found.")

    def create(self, validated_data):
        student = validated_data["student_id"]
        month = validated_data["month"]
        due_date = validated_data["due_date"]
        raw_items = validated_data["items"]

        fee_items = []
        for item in raw_items:
            try:
                fee_struct = FeeStructure.objects.get(id=item["fee_structure_id"])
            except FeeStructure.DoesNotExist:
                raise serializers.ValidationError(f"FeeStructure {item['fee_structure_id']} does not exist.")
            fee_items.append({
                "fee_structure": fee_struct,
                "amount": item["amount"],
                "description": item.get("description") or f"{fee_struct.name} — {month}",
            })

        return generate_student_invoice(
            student=student,
            month=month,
            due_date=due_date,
            fee_items=fee_items,
        )


# =========================================================================
# Student Payment Serializers (Immutable Ledger)
# =========================================================================


class StudentPaymentSerializer(serializers.ModelSerializer):
    student_admission_number = serializers.ReadOnlyField(source="student.admission_number")
    student_full_name = serializers.ReadOnlyField(source="student.full_name")
    invoice_number = serializers.ReadOnlyField(source="invoice.invoice_number")
    recorded_by_name = serializers.ReadOnlyField(source="recorded_by.full_name")
    reversed_payment_receipt = serializers.ReadOnlyField(
        source="reversed_payment.receipt_number"
    )

    class Meta:
        model = StudentPayment
        fields = [
            "id",
            "receipt_number",
            "invoice",
            "invoice_number",
            "student",
            "student_admission_number",
            "student_full_name",
            "fee_category",
            "month",
            "amount_due",
            "amount_paid",
            "payment_method",
            "payment_date",
            "transaction_ref",
            "recorded_by",
            "recorded_by_name",
            "transaction_type",
            "is_reversal",
            "reversed_payment",
            "reversed_payment_receipt",
            "reversal_reason",
            "notes",
            "created_at",
        ]
        read_only_fields = fields  # All fields read-only on the immutable ledger model serializer


class PaymentProcessSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    invoice_id = serializers.UUIDField()
    fee_category = serializers.ChoiceField(choices=StudentPayment.FEE_CATEGORY_CHOICES)
    month = serializers.RegexField(regex=r"^\d{4}-\d{2}$")
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(choices=StudentPayment.PAYMENT_METHOD_CHOICES)
    idempotency_key = serializers.CharField(
        required=False, allow_blank=True, max_length=255, min_length=8
    )
    transaction_ref = serializers.CharField(
        required=False, allow_blank=True, max_length=100
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        # Resolve idempotency key from payload or request header
        request = self.context.get("request")
        header_key = None
        if request:
            header_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")

        if attrs.get("payment_method") == "Cash":
            idem_key = attrs.get("idempotency_key") or header_key
            if not idem_key or not str(idem_key).strip():
                raise serializers.ValidationError({
                    "idempotency_key": "Idempotency-Key (header or body) is required for Cash payments."
                })
            attrs["idempotency_key"] = str(idem_key).strip()

        elif attrs.get("payment_method") in ("ZAAD", "eDahab"):
            ref = attrs.get("transaction_ref")
            if not ref or not str(ref).strip():
                raise serializers.ValidationError({
                    "transaction_ref": f"A non-empty external transaction_ref is required for {attrs.get('payment_method')} payments."
                })
            attrs["transaction_ref"] = str(ref).strip()

        # Validate Student existence
        try:
            attrs["student_instance"] = Student.objects.get(id=attrs["student_id"])
        except Student.DoesNotExist:
            raise serializers.ValidationError({"student_id": "Student does not exist."})

        # Validate Invoice existence
        try:
            attrs["invoice_instance"] = StudentInvoice.objects.get(id=attrs["invoice_id"])
        except StudentInvoice.DoesNotExist:
            raise serializers.ValidationError({"invoice_id": "Invoice does not exist."})

        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        payment, created = process_payment(
            student=validated_data["student_instance"],
            invoice=validated_data["invoice_instance"],
            fee_category=validated_data["fee_category"],
            month=validated_data["month"],
            amount=validated_data["amount"],
            payment_method=validated_data["payment_method"],
            user=user,
            idempotency_key=validated_data.get("idempotency_key"),
            transaction_ref=validated_data.get("transaction_ref"),
            notes=validated_data.get("notes"),
        )
        self.context["created"] = created
        return payment


class PaymentReversalSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5, max_length=500)

    def save(self, original_payment):
        user = self.context["request"].user
        return reverse_payment(
            original_payment=original_payment,
            user=user,
            reason=self.validated_data["reason"],
        )


class PaymentRefundSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    reason = serializers.CharField(min_length=5, max_length=500)

    def save(self, original_payment):
        user = self.context["request"].user
        return refund_payment(
            original_payment=original_payment,
            amount=self.validated_data["amount"],
            user=user,
            reason=self.validated_data["reason"],
        )


# =========================================================================
# Incomes & Expenses Serializers
# =========================================================================


class IncomeSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.ReadOnlyField(source="recorded_by.full_name")

    class Meta:
        model = Income
        fields = [
            "id",
            "title",
            "category",
            "description",
            "amount",
            "payment_method",
            "date",
            "reference_number",
            "recorded_by",
            "recorded_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]

    def validate_amount(self, value):
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Income amount cannot be negative.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["recorded_by"] = user
        return super().create(validated_data)


class ExpenseSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.ReadOnlyField(source="recorded_by.full_name")

    class Meta:
        model = Expense
        fields = [
            "id",
            "title",
            "category",
            "description",
            "amount",
            "payment_method",
            "date",
            "reference_number",
            "recorded_by",
            "recorded_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]

    def validate_amount(self, value):
        if value < Decimal("0.00"):
            raise serializers.ValidationError("Expense amount cannot be negative.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["recorded_by"] = user
        return super().create(validated_data)
