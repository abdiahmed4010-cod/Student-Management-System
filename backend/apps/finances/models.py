"""
Financial invoicing, immutable payment ledger, and general ledger models
for STUDENTLY (Stage 3.4).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- documentation/phase-2/DATA_DICTIONARY.md (Sections 2.14–2.19)
- documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md
- documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md (Option A adopted)

Note: Payment processing services (`process_payment`, `reverse_payment`,
`refund_payment`, deadlock retry) are intentionally excluded from Stage 3.4.
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class FeeStructure(models.Model):
    CATEGORY_CHOICES = [
        ("Class Fee", "Class Fee"),
        ("School Fee", "School Fee"),
        ("Registration", "Registration Fee"),
        ("Other", "Other Fee"),
    ]
    FREQUENCY_CHOICES = [
        ("Monthly", "Monthly"),
        ("Termly", "Termly"),
        ("Annually", "Annually"),
        ("One-Time", "One-Time"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, unique=True)
    fee_category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    default_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    currency = models.CharField(max_length=10, default="$")
    billing_frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default="Monthly",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_fee_structures"
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    fee_category__in=["Class Fee", "School Fee", "Registration", "Other"]
                ),
                name="chk_fee_category",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    billing_frequency__in=["Monthly", "Termly", "Annually", "One-Time"]
                ),
                name="chk_fee_billing_frequency",
            ),
            models.CheckConstraint(
                condition=models.Q(default_amount__gte=Decimal("0.00")),
                name="chk_fee_default_amount",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.code}): {self.currency}{self.default_amount}"


class StudentInvoice(models.Model):
    STATUS_CHOICES = [
        ("Unpaid", "Unpaid"),
        ("Partially Paid", "Partially Paid"),
        ("Paid", "Paid"),
        ("Cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=50, unique=True)
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.RESTRICT,
        related_name="invoices",
        db_column="student_id",
    )
    month = models.CharField(max_length=7, db_index=True)  # YYYY-MM
    total_amount_due = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    total_amount_paid = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Unpaid",
        db_index=True,
    )
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_student_invoices"
        ordering = ["-month", "invoice_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "month"],
                name="unique_student_month_invoice",
            ),
            models.CheckConstraint(
                condition=models.Q(total_amount_due__gte=Decimal("0.00"))
                & models.Q(total_amount_paid__gte=Decimal("0.00")),
                name="chk_invoice_amounts",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    status__in=["Unpaid", "Partially Paid", "Paid", "Cancelled"]
                ),
                name="chk_invoice_status",
            ),
        ]
        indexes = [
            models.Index(
                fields=["student", "status"],
                name="idx_invoice_student_status",
            ),
        ]

    def __str__(self):
        return (
            f"{self.invoice_number} ({self.student.admission_number}) "
            f"- {self.month} [{self.status}]"
        )

    @property
    def outstanding_balance(self):
        return max(Decimal("0.00"), self.total_amount_due - self.total_amount_paid)

    def reconcile_status(self):
        if self.status == "Cancelled":
            return
        if self.total_amount_paid >= self.total_amount_due:
            self.status = "Paid"
        elif self.total_amount_paid > Decimal("0.00"):
            self.status = "Partially Paid"
        else:
            self.status = "Unpaid"


class InvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        related_name="items",
        db_column="invoice_id",
    )
    fee_structure = models.ForeignKey(
        FeeStructure,
        on_delete=models.RESTRICT,
        related_name="invoiced_items",
        db_column="fee_structure_id",
    )
    description = models.CharField(max_length=150)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "studently_invoice_items"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=Decimal("0.00")),
                name="chk_invoice_item_amount",
            ),
        ]

    def __str__(self):
        return f"{self.invoice.invoice_number} — {self.description}: ${self.amount}"


class StudentPaymentQuerySet(models.QuerySet):
    """
    Append-only QuerySet guard for StudentPayment.
    Blocks QuerySet-level updates, deletions, bulk updates, and upserts so
    immutable financial ledger records cannot be modified or removed via the ORM.
    """

    def update(self, **kwargs):
        raise PermissionDenied(
            "Payment ledger records are append-only and cannot be updated via QuerySet.update()."
        )

    async def aupdate(self, **kwargs):
        raise PermissionDenied(
            "Payment ledger records are append-only and cannot be updated via QuerySet.aupdate()."
        )

    def delete(self):
        raise PermissionDenied(
            "Payment ledger records are immutable and cannot be deleted via QuerySet.delete()."
        )

    async def adelete(self):
        raise PermissionDenied(
            "Payment ledger records are immutable and cannot be deleted via QuerySet.adelete()."
        )

    def bulk_update(self, objs, fields, batch_size=None):
        raise PermissionDenied(
            "Payment ledger records are append-only and cannot be modified via bulk_update()."
        )

    async def abulk_update(self, objs, fields, batch_size=None):
        raise PermissionDenied(
            "Payment ledger records are append-only and cannot be modified via abulk_update()."
        )

    def update_or_create(self, defaults=None, create_defaults=None, **kwargs):
        raise PermissionDenied(
            "Payment ledger records are append-only and do not support update_or_create()."
        )

    async def aupdate_or_create(self, defaults=None, create_defaults=None, **kwargs):
        raise PermissionDenied(
            "Payment ledger records are append-only and do not support aupdate_or_create()."
        )

    def bulk_create(self, objs, *args, update_conflicts=False, **kwargs):
        if update_conflicts:
            raise PermissionDenied(
                "Payment ledger records are append-only and do not allow bulk_create(update_conflicts=True)."
            )
        objs_list = list(objs)
        for obj in objs_list:
            obj.full_clean()
        return super().bulk_create(objs_list, *args, update_conflicts=False, **kwargs)


class StudentPayment(models.Model):
    """
    Immutable financial payment ledger (Option A adopted).
    - `invoice` FK is DB-nullable strictly for historical Phase 1 legacy migration
      compatibility; operational API & services enforce `invoice NOT NULL`.
    - Records are strictly append-only; updates and deletions raise PermissionDenied.
    """

    PAYMENT_METHOD_CHOICES = [
        ("Cash", "Cash"),
        ("ZAAD", "ZAAD Mobile Money"),
        ("eDahab", "eDahab Mobile Money"),
    ]
    TRANSACTION_TYPE_CHOICES = [
        ("Payment", "Payment"),
        ("Reversal", "Reversal"),
        ("Refund", "Refund"),
    ]
    FEE_CATEGORY_CHOICES = [
        ("Class Fee", "Class Fee"),
        ("School Fee", "School Fee"),
        ("Registration", "Registration Fee"),
        ("Other", "Other Fee"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt_number = models.CharField(max_length=50, unique=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="payments",
        db_column="invoice_id",
    )
    student = models.ForeignKey(
        "students.Student",
        on_delete=models.RESTRICT,
        related_name="payments",
        db_column="student_id",
    )
    fee_category = models.CharField(max_length=30, choices=FEE_CATEGORY_CHOICES)
    month = models.CharField(max_length=7, db_index=True)  # YYYY-MM
    amount_due = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    amount_paid = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    payment_date = models.DateField(db_index=True)
    transaction_ref = models.CharField(max_length=100)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.RESTRICT,
        related_name="payments_recorded",
        db_column="recorded_by_user_id",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=TRANSACTION_TYPE_CHOICES,
        default="Payment",
        db_index=True,
    )
    is_reversal = models.BooleanField(default=False)
    reversed_payment = models.ForeignKey(
        "self",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="reversal_transactions",
        db_column="reversed_payment_id",
    )
    reversal_reason = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = StudentPaymentQuerySet.as_manager()

    class Meta:
        db_table = "studently_student_payments"
        ordering = ["-payment_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["payment_method", "transaction_ref"],
                name="unique_payment_method_transaction_ref",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paid__gt=Decimal("0.00")),
                name="chk_payment_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(payment_method__in=["Cash", "ZAAD", "eDahab"]),
                name="chk_payment_method",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    transaction_type__in=["Payment", "Reversal", "Refund"]
                ),
                name="chk_payment_transaction_type",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    fee_category__in=["Class Fee", "School Fee", "Registration", "Other"]
                ),
                name="chk_payment_fee_category",
            ),
            models.CheckConstraint(
                condition=(
                    (
                        models.Q(transaction_type="Payment")
                        & models.Q(is_reversal=False)
                        & models.Q(reversed_payment__isnull=True)
                    )
                    | (
                        models.Q(transaction_type="Reversal")
                        & models.Q(is_reversal=True)
                        & models.Q(reversed_payment__isnull=False)
                    )
                    | (
                        models.Q(transaction_type="Refund")
                        & models.Q(is_reversal=False)
                        & models.Q(reversed_payment__isnull=False)
                    )
                ),
                name="chk_payment_reversal_state",
            ),
        ]
        indexes = [
            models.Index(
                fields=["student", "payment_date"],
                name="idx_payment_student_date",
            ),
        ]

    def __str__(self):
        return (
            f"{self.receipt_number} [{self.transaction_type}] — "
            f"{self.student.admission_number}: ${self.amount_paid} ({self.payment_method})"
        )

    def clean(self):
        # Cross-entity invoice ownership, cancellation, and balance ceiling validation
        if self.invoice_id and self.student_id:
            if self.invoice.student_id != self.student_id:
                raise ValidationError(
                    "The selected invoice does not belong to this student."
                )
            if self.invoice.status == "Cancelled":
                raise ValidationError("Cannot post payment to a Cancelled invoice.")
            if (
                self.transaction_type == "Payment"
                and self.amount_paid is not None
                and self.amount_paid > self.invoice.outstanding_balance
            ):
                raise ValidationError(
                    f"Payment amount (${self.amount_paid}) exceeds remaining "
                    f"invoice balance (${self.invoice.outstanding_balance})."
                )

        # Enforce consistency between transaction_type, is_reversal, and reversed_payment
        if self.transaction_type == "Reversal":
            self.is_reversal = True
            if not self.reversed_payment_id:
                raise ValidationError(
                    "Reversals must reference an original payment record."
                )
            if self.reversed_payment.transaction_type != "Payment":
                raise ValidationError(
                    "Cannot reverse an entry that is itself a reversal or refund."
                )
            if not (self.reversal_reason and self.reversal_reason.strip()):
                raise ValidationError(
                    "Reversals require a documented reversal_reason."
                )
            if self.amount_paid != self.reversed_payment.amount_paid:
                raise ValidationError(
                    "Reversal amount must match 100% of the original payment amount."
                )
        elif self.transaction_type == "Refund":
            self.is_reversal = False
            if not self.reversed_payment_id:
                raise ValidationError(
                    "Refunds must reference an original payment record."
                )
            if self.reversed_payment.transaction_type != "Payment":
                raise ValidationError(
                    "Cannot refund an entry that is itself a reversal or refund."
                )
            if not (self.reversal_reason and self.reversal_reason.strip()):
                raise ValidationError(
                    "Refunds require a documented reversal_reason."
                )
        else:
            self.is_reversal = False
            if self.reversed_payment_id:
                raise ValidationError(
                    "Standard payments cannot reference a reversed payment."
                )

    def delete(self, *args, **kwargs):
        raise PermissionDenied(
            "Payment ledger records are immutable and cannot be deleted."
        )

    def save(self, *args, **kwargs):
        if self.pk and not self._state.adding:
            raise PermissionDenied(
                "Payment ledger records are append-only and cannot be updated."
            )
        self.full_clean()
        super().save(*args, **kwargs)


class Income(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ("Cash", "Cash"),
        ("ZAAD", "ZAAD Mobile Money"),
        ("eDahab", "eDahab Mobile Money"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, db_index=True)
    description = models.TextField(null=True, blank=True)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="Cash",
    )
    date = models.DateField(db_index=True)
    reference_number = models.CharField(max_length=100)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incomes_recorded",
        db_column="recorded_by_user_id",
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_incomes"
        ordering = ["-date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=Decimal("0.00")),
                name="chk_income_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(payment_method__in=["Cash", "ZAAD", "eDahab"]),
                name="chk_income_payment_method",
            ),
        ]
        indexes = [
            models.Index(
                fields=["category", "date"],
                name="idx_income_cat_date",
            ),
        ]

    def __str__(self):
        return f"{self.title} (${self.amount}) — {self.date}"


class Expense(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ("Cash", "Cash"),
        ("ZAAD", "ZAAD Mobile Money"),
        ("eDahab", "eDahab Mobile Money"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, db_index=True)
    description = models.TextField(null=True, blank=True)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default="Cash",
    )
    date = models.DateField(db_index=True)
    reference_number = models.CharField(max_length=100)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses_recorded",
        db_column="recorded_by_user_id",
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "studently_expenses"
        ordering = ["-date", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=Decimal("0.00")),
                name="chk_expense_amount",
            ),
            models.CheckConstraint(
                condition=models.Q(payment_method__in=["Cash", "ZAAD", "eDahab"]),
                name="chk_expense_payment_method",
            ),
        ]

    def __str__(self):
        return f"{self.title} (${self.amount}) — {self.date}"
