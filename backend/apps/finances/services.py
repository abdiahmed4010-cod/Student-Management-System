"""
Financial Domain Services Layer for STUDENTLY (Stage 3.7).

Implements:
1. Canonical Option A (Invoice Required) payment processing engine with two-stage
   idempotency lookups (CONC-01) and inner-savepoint race recovery (CONC-02).
2. Deterministic Cash idempotency reference derivation (MEDIUM-02-A).
3. Append-only ledger compliance: Reversals (100% void) and Refunds (full/partial).
4. MySQL InnoDB deadlock (1213) retry policy and lock timeout (1205) handling.
5. Invoicing services: FeeStructure catalog, StudentInvoice generation, cancellation.
6. Incomes, Expenses, Student Fee Ledger, and Financial Overview services.

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- documentation/phase-2/MYSQL_DEADLOCK_RETRY_POLICY.md
- documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md
- documentation/phase-1/BUSINESS_RULES_SPECIFICATION.md (Section 8)
- documentation/phase-1/FRONTEND_API_MAPPING.md (Section 2.11 & 2.12)
"""

import hashlib
import random
import time
import uuid
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, OperationalError, connection, models, transaction
from django.utils import timezone

from apps.finances.models import (
    Expense,
    FeeStructure,
    Income,
    InvoiceItem,
    StudentInvoice,
    StudentPayment,
)
from apps.students.models import Student

# =========================================================================
# Custom Exceptions & Constants
# =========================================================================

MAX_DEADLOCK_RETRIES = 3
MYSQL_ERR_LOCK_DEADLOCK = 1213
MYSQL_ERR_LOCK_WAIT_TIMEOUT = 1205


class IdempotencyConflictError(ValidationError):
    """Raised when an Idempotency-Key or transaction_ref is reused with a different logical payload (HTTP 409 Conflict)."""


class PaymentConcurrencyError(Exception):
    """Controlled concurrency failure (HTTP 503) on MySQL 1205 timeout or 1213 retry exhaustion."""


# =========================================================================
# Idempotency & Reference Derivation Helpers
# =========================================================================


def derive_cash_transaction_ref(idempotency_key: str) -> str:
    """
    Deterministically derives the canonical persistent Cash transaction reference
    from the client-supplied Idempotency-Key BEFORE duplicate checking or insertion.

    Canonical format: CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>
    - Valid UUID key -> lowercase canonical UUID (36 chars) -> total length 46 chars.
    - Other valid printable ASCII key (8..255 chars) -> SHA-256 hex digest (64 chars) -> total length 74 chars.
    Always fits comfortably within StudentPayment.transaction_ref VARCHAR(100), including REV-/REF- suffixes.
    """
    if not isinstance(idempotency_key, str):
        raise ValidationError("Idempotency-Key is required for Cash payments.")
    raw = idempotency_key.strip()
    if len(raw) < 8 or len(raw) > 255 or not raw.isascii() or not raw.isprintable():
        raise ValidationError("Idempotency-Key must be 8-255 printable ASCII characters.")
    try:
        normalized = str(uuid.UUID(raw)).lower()  # 36 chars -> 46 chars total
    except ValueError:
        normalized = hashlib.sha256(raw.encode("utf-8")).hexdigest()  # 64 chars -> 74 chars total
    return f"CASH-IDEM-{normalized}"


def _build_logical_payment_fingerprint(
    *, student, invoice, fee_category, month, amount, payment_method
) -> tuple:
    """
    Constructs the canonical logical payload tuple for idempotency consistency checks.
    STUDENTLY operates in single-currency USD; if multi-currency is added later, include currency.
    """
    return (
        str(student.id),
        str(invoice.id),
        Decimal(str(amount)),
        payment_method,
        fee_category,
        month,
        "Payment",
    )


def _matches_logical_payment_payload(existing, payload_fingerprint: tuple) -> bool:
    """Compares an incoming canonical payload fingerprint against a persisted StudentPayment."""
    existing_fingerprint = (
        str(existing.student_id),
        str(existing.invoice_id),
        Decimal(str(existing.amount_paid)),
        existing.payment_method,
        existing.fee_category,
        existing.month,
        existing.transaction_type,
    )
    return existing_fingerprint == payload_fingerprint


def _validate_and_return_existing(existing, payload_fingerprint: tuple, *, cause=None):
    """
    Validates logical payload consistency for a matched idempotent payment.
    Returns (existing, False) on exact match; raises IdempotencyConflictError (HTTP 409) on mismatch.
    """
    if _matches_logical_payment_payload(existing, payload_fingerprint):
        return existing, False
    error = IdempotencyConflictError(
        "Idempotency key / transaction reference was already used with a different payment payload."
    )
    if cause is not None:
        raise error from cause
    raise error


def _find_existing_payment(*, payment_method: str, transaction_ref: str):
    """
    Initial non-locking persistent duplicate lookup executed prior to acquiring the invoice row lock.
    """
    return StudentPayment.objects.filter(
        payment_method=payment_method,
        transaction_ref=transaction_ref,
    ).first()


def _find_existing_payment_current_read(*, payment_method: str, transaction_ref: str):
    """
    Current/locking read used inside transaction.atomic() for:
      1. The mandatory post-invoice-lock duplicate lookup (BEFORE balance validation).
      2. Post-IntegrityError unique-constraint race recovery.
    """
    return (
        StudentPayment.objects.select_for_update()
        .filter(
            payment_method=payment_method,
            transaction_ref=transaction_ref,
        )
        .first()
    )


def _is_payment_ref_unique_violation(exc: IntegrityError) -> bool:
    """
    Verifies whether a caught IntegrityError corresponds specifically to the expected
    UNIQUE(payment_method, transaction_ref) constraint ('unique_payment_method_transaction_ref').
    """
    msg = str(exc).lower()
    if "unique_payment_method_transaction_ref" in msg:
        return True
    if "payment_method" in msg and "transaction_ref" in msg and ("duplicate" in msg or "unique" in msg):
        return True
    return False


# =========================================================================
# Receipt & Invoice Number Generators
# =========================================================================


def generate_receipt_number(payment_date=None) -> str:
    """
    Generates a sequential human-readable receipt number formatted as REC-YYYY-MM-XXXX.
    Guarantees uniqueness across all student payments.
    """
    if payment_date is None:
        payment_date = timezone.now().date()
    prefix = f"REC-{payment_date.strftime('%Y-%m')}-"

    last_payment = (
        StudentPayment.objects.filter(receipt_number__startswith=prefix)
        .order_by("-receipt_number")
        .first()
    )
    if last_payment:
        try:
            last_seq = int(last_payment.receipt_number.split("-")[-1])
            seq = last_seq + 1
        except (ValueError, IndexError):
            seq = StudentPayment.objects.filter(receipt_number__startswith=prefix).count() + 1
    else:
        seq = 1

    candidate = f"{prefix}{seq:04d}"
    while StudentPayment.objects.filter(receipt_number=candidate).exists():
        seq += 1
        candidate = f"{prefix}{seq:04d}"
    return candidate


def generate_invoice_number(month: str) -> str:
    """
    Generates a sequential human-readable invoice number formatted as INV-YYYY-MM-XXXX.
    Guarantees uniqueness across all student invoices.
    """
    prefix = f"INV-{month}-"
    last_invoice = (
        StudentInvoice.objects.filter(invoice_number__startswith=prefix)
        .order_by("-invoice_number")
        .first()
    )
    if last_invoice:
        try:
            last_seq = int(last_invoice.invoice_number.split("-")[-1])
            seq = last_seq + 1
        except (ValueError, IndexError):
            seq = StudentInvoice.objects.filter(invoice_number__startswith=prefix).count() + 1
    else:
        seq = 1

    candidate = f"{prefix}{seq:04d}"
    while StudentInvoice.objects.filter(invoice_number=candidate).exists():
        seq += 1
        candidate = f"{prefix}{seq:04d}"
    return candidate


# =========================================================================
# Core Payment Engine: process_payment (Option A, CONC-01, CONC-02)
# =========================================================================


def process_payment(
    *,
    student,
    invoice,
    fee_category,
    month,
    amount,
    payment_method,
    user,
    idempotency_key=None,
    transaction_ref=None,
    notes=None,
):
    """
    Processes a positive student payment voucher under OPTION A (Invoice Required) and
    atomically reconciles the linked invoice with durable database-enforced idempotency.

    Returns:
        tuple[StudentPayment, bool]: (payment_instance, created)
        - (payment, True)  -> Newly created payment (HTTP 201 Created).
        - (payment, False) -> Idempotent replay with matching payload (HTTP 200 OK).
    """
    # 1. Option A — Mandatory Invoice & Positive Amount Validation
    if invoice is None:
        raise ValidationError("An active invoice is required for all new operational payments (Option A).")

    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise ValidationError("Payment amount must be strictly positive.")

    # 2. Validate Idempotency-Key & Resolve Canonical Persistent transaction_ref BEFORE Lookups
    if payment_method == "Cash":
        resolved_ref = derive_cash_transaction_ref(idempotency_key)
    elif payment_method in ("ZAAD", "eDahab"):
        if not transaction_ref or not str(transaction_ref).strip():
            raise ValidationError(f"A non-empty external transaction_ref is required for {payment_method} payments.")
        resolved_ref = str(transaction_ref).strip()
        if len(resolved_ref) > 90:
            raise ValidationError("transaction_ref must not exceed 90 characters to allow reversal/refund prefixing.")
    else:
        raise ValidationError(f"Unsupported payment_method: '{payment_method}'.")

    # 3. Compute Canonical Logical Payload Fingerprint
    payload_fingerprint = _build_logical_payment_fingerprint(
        student=student,
        invoice=invoice,
        fee_category=fee_category,
        month=month,
        amount=amount,
        payment_method=payment_method,
    )

    # 4. Initial Persistent Duplicate Lookup (Fast-path before acquiring invoice lock)
    existing = _find_existing_payment(
        payment_method=payment_method,
        transaction_ref=resolved_ref,
    )
    if existing is not None:
        return _validate_and_return_existing(existing, payload_fingerprint)

    # 5. Begin Atomic Transaction & Lock Target Invoice Row
    with transaction.atomic():
        invoice_obj = StudentInvoice.objects.select_for_update().get(id=invoice.id)

        # 6. Validate Cross-Entity Invoice Ownership
        if str(invoice_obj.student_id) != str(student.id):
            raise ValidationError("The selected invoice does not belong to this student.")

        # 7. MANDATORY SECOND DUPLICATE LOOKUP (Current/Locking Read)
        # MUST occur after invoice lock & ownership check, and BEFORE balance calculation/validation.
        existing = _find_existing_payment_current_read(
            payment_method=payment_method,
            transaction_ref=resolved_ref,
        )
        if existing is not None:
            return _validate_and_return_existing(existing, payload_fingerprint)

        # 8. Validate Invoice Status & Outstanding Balance Ceiling (Only if no duplicate exists)
        if invoice_obj.status == "Cancelled":
            raise ValidationError("Cannot post payment to a Cancelled invoice.")
        remaining_balance = invoice_obj.total_amount_due - invoice_obj.total_amount_paid
        if remaining_balance <= Decimal("0.00"):
            raise ValidationError("This invoice has no remaining outstanding balance.")
        if amount > remaining_balance:
            raise ValidationError(
                f"Payment amount (${amount}) exceeds remaining invoice balance (${remaining_balance})."
            )

        # 9. Atomic Insert inside Nested Savepoint for Concurrent Unique-Constraint Race Recovery
        payment = StudentPayment(
            receipt_number=generate_receipt_number(),
            invoice=invoice_obj,
            student=student,
            fee_category=fee_category,
            month=month,
            amount_due=invoice_obj.total_amount_due,
            amount_paid=amount,
            payment_method=payment_method,
            payment_date=timezone.now().date(),
            transaction_ref=resolved_ref,
            recorded_by=user,
            transaction_type="Payment",
            is_reversal=False,
            notes=notes,
        )
        try:
            with transaction.atomic():  # Inner savepoint isolates failed insert
                payment.save()  # full_clean() executed automatically
        except IntegrityError as exc:
            if not _is_payment_ref_unique_violation(exc):
                raise

            raced_existing = _find_existing_payment_current_read(
                payment_method=payment_method,
                transaction_ref=resolved_ref,
            )
            if raced_existing is not None:
                return _validate_and_return_existing(
                    raced_existing,
                    payload_fingerprint,
                    cause=exc,
                )
            raise

        # 10. Reconcile Invoice ONLY for the Single Winning Insert
        invoice_obj.total_amount_paid += amount
        invoice_obj.reconcile_status()
        invoice_obj.save(update_fields=["total_amount_paid", "status", "updated_at"])

        return payment, True


# =========================================================================
# MySQL Deadlock & Transaction Retry Policy
# =========================================================================


def process_payment_with_deadlock_retry(**kwargs):
    """
    Outer bounded full-transaction retry wrapper around process_payment() strictly for
    MySQL InnoDB error 1213 (ER_LOCK_DEADLOCK).
    """
    for attempt in range(1, MAX_DEADLOCK_RETRIES + 1):
        try:
            return process_payment(**kwargs)
        except OperationalError as exc:
            orig = getattr(exc, "__cause__", None) or exc
            args = getattr(orig, "args", ())
            err_code = (
                args[0]
                if (connection.vendor == "mysql" and args and isinstance(args[0], int))
                else None
            )

            if err_code == MYSQL_ERR_LOCK_DEADLOCK:
                if attempt >= MAX_DEADLOCK_RETRIES:
                    raise PaymentConcurrencyError(
                        "Payment failed after maximum MySQL deadlock retries (1213). "
                        "Retry safely with the same Idempotency-Key."
                    ) from exc
                time.sleep((0.025 * (2 ** (attempt - 1))) + random.uniform(0.0, 0.025))
                continue

            if err_code == MYSQL_ERR_LOCK_WAIT_TIMEOUT:
                raise PaymentConcurrencyError(
                    "Payment lock wait timed out (MySQL 1205). "
                    "Retry safely with the same Idempotency-Key."
                ) from exc

            raise


# =========================================================================
# Append-Only Ledger: Reversals & Refunds
# =========================================================================


def reverse_payment(*, original_payment, user, reason):
    """
    Executes a 100% full reversal of an erroneous or bounced payment voucher.
    Reversal amount matches original payment exactly. Cannot be partial.
    """
    if not (reason and reason.strip()):
        raise ValidationError("Reversals require a documented reason.")

    with transaction.atomic():
        orig = StudentPayment.objects.select_for_update().get(id=original_payment.id)
        if orig.transaction_type != "Payment":
            raise ValidationError("Only standard payments can be reversed.")
        if orig.reversal_transactions.filter(transaction_type="Reversal").exists():
            raise ValidationError("This payment voucher has already been reversed.")
        if orig.reversal_transactions.filter(transaction_type="Refund").exists():
            raise ValidationError("Cannot reverse a payment that already has refund transactions.")

        invoice_obj = None
        if orig.invoice_id:
            invoice_obj = StudentInvoice.objects.select_for_update().get(id=orig.invoice_id)
            if invoice_obj.status == "Cancelled":
                raise ValidationError("Cannot adjust a Cancelled invoice.")

        # Construct reference ensuring length <= 100
        rev_ref = f"REV-{orig.transaction_ref}"
        if len(rev_ref) > 100:
            rev_ref = f"REV-{orig.transaction_ref[:60]}-{hashlib.md5(orig.transaction_ref.encode()).hexdigest()[:30]}"

        rev_rec = f"REV-{orig.receipt_number}"
        if len(rev_rec) > 50:
            rev_rec = f"REV-{orig.receipt_number[:40]}"

        reversal = StudentPayment(
            receipt_number=rev_rec,
            invoice=invoice_obj,
            student=orig.student,
            fee_category=orig.fee_category,
            month=orig.month,
            amount_due=invoice_obj.total_amount_due if invoice_obj else Decimal("0.00"),
            amount_paid=orig.amount_paid,  # Strictly positive, matches 100% of original
            payment_method=orig.payment_method,
            payment_date=timezone.now().date(),
            transaction_ref=rev_ref,
            recorded_by=user,
            transaction_type="Reversal",
            is_reversal=True,
            reversed_payment=orig,
            reversal_reason=reason.strip(),
        )
        reversal.save()

        if invoice_obj:
            invoice_obj.total_amount_paid = max(
                Decimal("0.00"), invoice_obj.total_amount_paid - orig.amount_paid
            )
            invoice_obj.reconcile_status()
            invoice_obj.save(update_fields=["total_amount_paid", "status", "updated_at"])

        return reversal


def refund_payment(*, original_payment, amount, user, reason):
    """
    Executes a full or partial refund voucher back to student/payer.
    Supports multiple partial refunds up to the net un-refunded payment amount.
    """
    if not (reason and reason.strip()):
        raise ValidationError("Refunds require a documented reason.")

    amount = Decimal(str(amount))
    if amount <= Decimal("0.00"):
        raise ValidationError("Refund amount must be strictly positive.")

    with transaction.atomic():
        orig = StudentPayment.objects.select_for_update().get(id=original_payment.id)
        if orig.transaction_type != "Payment":
            raise ValidationError("Only standard payments can be refunded.")
        if orig.reversal_transactions.filter(transaction_type="Reversal").exists():
            raise ValidationError("Cannot refund a payment that has been completely reversed.")

        already_refunded = (
            orig.reversal_transactions.filter(transaction_type="Refund").aggregate(
                total=models.Sum("amount_paid")
            )["total"]
            or Decimal("0.00")
        )

        max_refundable = orig.amount_paid - already_refunded
        if amount > max_refundable:
            raise ValidationError(
                f"Requested refund (${amount}) exceeds maximum refundable balance (${max_refundable})."
            )

        invoice_obj = None
        if orig.invoice_id:
            invoice_obj = StudentInvoice.objects.select_for_update().get(id=orig.invoice_id)
            if invoice_obj.status == "Cancelled":
                raise ValidationError("Cannot adjust a Cancelled invoice.")

        refund_seq = orig.reversal_transactions.filter(transaction_type="Refund").count() + 1
        ref_rec = f"REF-{orig.receipt_number}-{refund_seq}"
        if len(ref_rec) > 50:
            ref_rec = f"REF-{orig.receipt_number[:35]}-{refund_seq}"

        ref_ref = f"REF-{orig.transaction_ref}-{refund_seq}"
        if len(ref_ref) > 100:
            ref_ref = f"REF-{orig.transaction_ref[:60]}-{refund_seq}"

        refund = StudentPayment(
            receipt_number=ref_rec,
            invoice=invoice_obj,
            student=orig.student,
            fee_category=orig.fee_category,
            month=orig.month,
            amount_due=invoice_obj.total_amount_due if invoice_obj else Decimal("0.00"),
            amount_paid=amount,  # Strictly positive
            payment_method=orig.payment_method,
            payment_date=timezone.now().date(),
            transaction_ref=ref_ref,
            recorded_by=user,
            transaction_type="Refund",
            is_reversal=False,
            reversed_payment=orig,
            reversal_reason=reason.strip(),
        )
        refund.save()

        if invoice_obj:
            invoice_obj.total_amount_paid = max(
                Decimal("0.00"), invoice_obj.total_amount_paid - amount
            )
            invoice_obj.reconcile_status()
            invoice_obj.save(update_fields=["total_amount_paid", "status", "updated_at"])

        return refund


# =========================================================================
# Invoicing Services: FeeStructure, StudentInvoice, InvoiceItem
# =========================================================================


def create_fee_structure(
    *,
    name: str,
    code: str,
    fee_category: str,
    default_amount: Decimal,
    currency: str = "$",
    billing_frequency: str = "Monthly",
    is_active: bool = True,
) -> FeeStructure:
    """Creates a new institutional fee structure definition."""
    fee = FeeStructure(
        name=name.strip(),
        code=code.strip().upper(),
        fee_category=fee_category,
        default_amount=Decimal(str(default_amount)),
        currency=currency,
        billing_frequency=billing_frequency,
        is_active=is_active,
    )
    fee.full_clean()
    fee.save()
    return fee


def generate_student_invoice(
    *,
    student: Student,
    month: str,
    due_date,
    fee_items: list[dict],
) -> StudentInvoice:
    """
    Generates a materialized StudentInvoice and linked InvoiceItems atomically.
    fee_items is a list of dicts: [{'fee_structure': FeeStructure, 'amount': Decimal, 'description': str}]
    """
    if not fee_items:
        raise ValidationError("At least one fee item is required to generate an invoice.")

    with transaction.atomic():
        if StudentInvoice.objects.filter(student=student, month=month).exists():
            raise ValidationError(f"An invoice for student {student.admission_number} for month {month} already exists.")

        invoice_number = generate_invoice_number(month)
        total_due = Decimal("0.00")

        # Create invoice shell with 0 due, will update after items
        invoice = StudentInvoice.objects.create(
            invoice_number=invoice_number,
            student=student,
            month=month,
            total_amount_due=Decimal("0.00"),
            total_amount_paid=Decimal("0.00"),
            status="Unpaid",
            due_date=due_date,
        )

        for item_data in fee_items:
            item_fee = item_data["fee_structure"]
            item_amount = Decimal(str(item_data.get("amount", item_fee.default_amount)))
            item_desc = item_data.get("description") or f"{item_fee.name} — {month}"

            if item_amount < Decimal("0.00"):
                raise ValidationError("Invoice item amount cannot be negative.")

            InvoiceItem.objects.create(
                invoice=invoice,
                fee_structure=item_fee,
                description=item_desc,
                amount=item_amount,
            )
            total_due += item_amount

        invoice.total_amount_due = total_due
        invoice.full_clean()
        invoice.save(update_fields=["total_amount_due", "updated_at"])

        return invoice


def cancel_student_invoice(invoice: StudentInvoice, user, reason: str = None) -> StudentInvoice:
    """
    Cancels an active invoice. Prohibits cancellation if payments have been posted.
    """
    with transaction.atomic():
        inv = StudentInvoice.objects.select_for_update().get(id=invoice.id)
        if inv.status == "Cancelled":
            raise ValidationError("Invoice is already cancelled.")
        if inv.total_amount_paid > Decimal("0.00") or inv.payments.filter(transaction_type="Payment").exists():
            raise ValidationError("Cannot cancel an invoice with recorded payments. Reverse payments first.")

        inv.status = "Cancelled"
        inv.save(update_fields=["status", "updated_at"])
        return inv


# =========================================================================
# General Ledger: Incomes & Expenses
# =========================================================================


def record_income(
    *,
    title: str,
    category: str,
    amount: Decimal,
    payment_method: str,
    date,
    reference_number: str,
    user,
    description: str = None,
    notes: str = None,
) -> Income:
    """Records non-tuition revenue in studently_incomes."""
    income = Income(
        title=title.strip(),
        category=category.strip(),
        description=description,
        amount=Decimal(str(amount)),
        payment_method=payment_method,
        date=date,
        reference_number=reference_number.strip(),
        recorded_by=user,
        notes=notes,
    )
    income.full_clean()
    income.save()
    return income


def record_expense(
    *,
    title: str,
    category: str,
    amount: Decimal,
    payment_method: str,
    date,
    reference_number: str,
    user,
    description: str = None,
    notes: str = None,
) -> Expense:
    """Records operational disbursements in studently_expenses."""
    expense = Expense(
        title=title.strip(),
        category=category.strip(),
        description=description,
        amount=Decimal(str(amount)),
        payment_method=payment_method,
        date=date,
        reference_number=reference_number.strip(),
        recorded_by=user,
        notes=notes,
    )
    expense.full_clean()
    expense.save()
    return expense


# =========================================================================
# Ledger Views & Financial Overview Reporting
# =========================================================================


def get_student_fee_ledger(*, month: str = None, class_id: str = None) -> list[dict]:
    """
    Returns monthly student ledger overview per student (Option A).
    Each student item includes:
      - student info (id, admission_number, full_name, classroom)
      - total_due, total_paid, outstanding_balance, status
      - invoices, payments
    """
    students_qs = Student.objects.select_related("classroom").all()
    if class_id:
        students_qs = students_qs.filter(classroom_id=class_id)

    ledger_rows = []
    for student in students_qs:
        invoices_qs = student.invoices.all()
        if month:
            invoices_qs = invoices_qs.filter(month=month)

        total_due = invoices_qs.aggregate(total=models.Sum("total_amount_due"))["total"] or Decimal("0.00")
        total_paid = invoices_qs.aggregate(total=models.Sum("total_amount_paid"))["total"] or Decimal("0.00")
        outstanding = max(Decimal("0.00"), total_due - total_paid)

        if total_paid >= total_due and total_due > Decimal("0.00"):
            status = "Paid"
        elif total_paid > Decimal("0.00"):
            status = "Partially Paid"
        else:
            status = "Unpaid"

        payments_qs = student.payments.filter(transaction_type="Payment")
        if month:
            payments_qs = payments_qs.filter(month=month)

        ledger_rows.append({
            "student_id": str(student.id),
            "admission_number": student.admission_number,
            "full_name": student.full_name,
            "class_id": str(student.classroom_id) if student.classroom_id else None,
            "class_name": student.classroom.name if student.classroom else None,
            "total_amount_due": total_due,
            "total_amount_paid": total_paid,
            "outstanding_balance": outstanding,
            "status": status,
            "invoice_count": invoices_qs.count(),
            "payment_count": payments_qs.count(),
        })

    return ledger_rows


def get_financial_overview(*, month: str = None, start_date=None, end_date=None) -> dict:
    """
    Computes overall financial summary metrics without double-counting:
    - studentFeeCollections ($): net tuition payments (Payments minus Reversals/Refunds)
    - otherIncome ($): general non-tuition revenues from Income table
    - totalIncome ($): studentFeeCollections + otherIncome
    - totalExpenses ($): expenditures from Expense table
    - netBalance ($): totalIncome - totalExpenses
    """
    payments_qs = StudentPayment.objects.all()
    incomes_qs = Income.objects.all()
    expenses_qs = Expense.objects.all()

    if month:
        payments_qs = payments_qs.filter(month=month)
        incomes_qs = incomes_qs.filter(date__startswith=month)
        expenses_qs = expenses_qs.filter(date__startswith=month)
    else:
        if start_date:
            payments_qs = payments_qs.filter(payment_date__gte=start_date)
            incomes_qs = incomes_qs.filter(date__gte=start_date)
            expenses_qs = expenses_qs.filter(date__gte=start_date)
        if end_date:
            payments_qs = payments_qs.filter(payment_date__lte=end_date)
            incomes_qs = incomes_qs.filter(date__lte=end_date)
            expenses_qs = expenses_qs.filter(date__lte=end_date)

    # Net student fee collections: Payments - (Reversals + Refunds)
    gross_payments = (
        payments_qs.filter(transaction_type="Payment").aggregate(
            total=models.Sum("amount_paid")
        )["total"]
        or Decimal("0.00")
    )
    total_reversals = (
        payments_qs.filter(transaction_type="Reversal").aggregate(
            total=models.Sum("amount_paid")
        )["total"]
        or Decimal("0.00")
    )
    total_refunds = (
        payments_qs.filter(transaction_type="Refund").aggregate(
            total=models.Sum("amount_paid")
        )["total"]
        or Decimal("0.00")
    )
    net_student_fees = max(Decimal("0.00"), gross_payments - total_reversals - total_refunds)

    other_income = incomes_qs.aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")
    total_income = net_student_fees + other_income
    total_expenses = expenses_qs.aggregate(total=models.Sum("amount"))["total"] or Decimal("0.00")
    net_balance = total_income - total_expenses

    return {
        "student_fee_collections": net_student_fees,
        "gross_student_fees": gross_payments,
        "total_reversals": total_reversals,
        "total_refunds": total_refunds,
        "other_income": other_income,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_balance": net_balance,
    }
