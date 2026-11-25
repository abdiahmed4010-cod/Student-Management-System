"""
Comprehensive Stage 3.7 Business Logic, Payment Engine, Idempotency,
and RBAC Security Boundary Tests.

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.6)
- documentation/phase-2/MYSQL_DEADLOCK_RETRY_POLICY.md
- documentation/phase-1/BUSINESS_RULES_SPECIFICATION.md (Section 8)
- documentation/phase-1/FRONTEND_API_MAPPING.md (Section 2.11 & 2.12)
"""

import datetime
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.academics.models import Classroom
from apps.accounts.models import UserPermission
from apps.accounts.rbac import provision_user_permissions
from apps.finances.models import (
    Expense,
    FeeStructure,
    Income,
    InvoiceItem,
    StudentInvoice,
    StudentPayment,
)
from apps.finances.services import (
    IdempotencyConflictError,
    cancel_student_invoice,
    create_fee_structure,
    derive_cash_transaction_ref,
    generate_invoice_number,
    generate_receipt_number,
    generate_student_invoice,
    get_financial_overview,
    get_student_fee_ledger,
    process_payment,
    refund_payment,
    reverse_payment,
)
from apps.students.models import Student

User = get_user_model()


class Stage37BusinessLogicTests(TestCase):
    def setUp(self):
        # 1. Setup Users
        self.admin_user = User.objects.create_superuser(
            email="superadmin@studently.edu",
            password="Str0ng!AdminPass#2026",
            full_name="Super Admin",
        )
        self.bursar_user = User.objects.create_user(
            email="bursar@studently.edu",
            password="Str0ng!BursarPass#2026",
            full_name="Head Bursar",
            role="ADMIN",
            is_superuser=False,
        )
        provision_user_permissions(self.bursar_user, "bursar")

        self.teacher_user = User.objects.create_user(
            email="teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Subject Teacher",
            role="TEACHER",
            is_superuser=False,
        )

        # 2. Setup Classroom & Students
        self.classroom = Classroom.objects.create(
            name="Grade 1",
            section="A",
            academic_year="2026-2027",
        )
        self.student_1 = Student.objects.create(
            admission_number="STD-3001",
            full_name="Amina Warsame",
            gender="Female",
            date_of_birth=datetime.date(2015, 5, 12),
            parent_phone="063-4112233",
            classroom=self.classroom,
            registration_date=datetime.date(2026, 9, 1),
        )
        self.student_2 = Student.objects.create(
            admission_number="STD-3002",
            full_name="Hassan Jama",
            gender="Male",
            date_of_birth=datetime.date(2015, 8, 20),
            parent_phone="063-4445566",
            classroom=self.classroom,
            registration_date=datetime.date(2026, 9, 1),
        )

        # 3. Setup Fee Structures
        self.class_fee = FeeStructure.objects.create(
            name="Monthly Class Tuition",
            code="CLASS_FEE_G1",
            fee_category="Class Fee",
            default_amount=Decimal("50.00"),
            currency="$",
            billing_frequency="Monthly",
        )
        self.school_fee = FeeStructure.objects.create(
            name="General School Maintenance",
            code="SCH_FEE_GEN",
            fee_category="School Fee",
            default_amount=Decimal("30.00"),
            currency="$",
            billing_frequency="Monthly",
        )

        # 4. Setup Invoices
        self.invoice_1 = generate_student_invoice(
            student=self.student_1,
            month="2026-11",
            due_date=datetime.date(2026, 11, 30),
            fee_items=[
                {"fee_structure": self.class_fee, "amount": Decimal("50.00")},
                {"fee_structure": self.school_fee, "amount": Decimal("30.00")},
            ],
        )

        self.client = APIClient()

    # =========================================================================
    # 1. Option A (Invoice Required) & Cross-Entity Boundaries
    # =========================================================================

    def test_process_payment_without_invoice_raises_validation_error(self):
        """Option A mandate: operational payments cannot be created without an active invoice."""
        with self.assertRaises(ValidationError) as ctx:
            process_payment(
                student=self.student_1,
                invoice=None,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("50.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440000",
            )
        self.assertIn("active invoice is required", str(ctx.exception))

    def test_process_payment_with_wrong_student_invoice_rejected(self):
        """Cross-entity ownership check: cannot pay against an invoice belonging to another student."""
        with self.assertRaises(ValidationError) as ctx:
            process_payment(
                student=self.student_2,  # mismatched student
                invoice=self.invoice_1,   # invoice belongs to student_1
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("50.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440001",
            )
        self.assertIn("does not belong to this student", str(ctx.exception))

    def test_process_payment_against_cancelled_invoice_rejected(self):
        """Cannot post payments against a Cancelled invoice."""
        self.invoice_1 = cancel_student_invoice(self.invoice_1, self.admin_user)
        self.assertEqual(self.invoice_1.status, "Cancelled")

        with self.assertRaises(ValidationError) as ctx:
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("50.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440002",
            )
        self.assertIn("Cancelled invoice", str(ctx.exception))

    # =========================================================================
    # 2. Durable Cash Idempotency (MEDIUM-02-A)
    # =========================================================================

    def test_derive_cash_transaction_ref_formats(self):
        """Cash transaction_ref derivation: canonical UUID (46 chars) or SHA-256 (74 chars)."""
        # UUID key
        uuid_key = "550E8400-E29B-41D4-A716-446655440000"
        ref_uuid = derive_cash_transaction_ref(uuid_key)
        self.assertEqual(ref_uuid, "CASH-IDEM-550e8400-e29b-41d4-a716-446655440000")
        self.assertEqual(len(ref_uuid), 46)

        # Printable ASCII string key
        ascii_key = "CLIENT_PAYMENT_SESSION_2026_11_ALPHA"
        ref_ascii = derive_cash_transaction_ref(ascii_key)
        self.assertTrue(ref_ascii.startswith("CASH-IDEM-"))
        self.assertEqual(len(ref_ascii), 74)

        # Invalid keys (< 8 chars, non-ascii)
        with self.assertRaises(ValidationError):
            derive_cash_transaction_ref("short")
        with self.assertRaises(ValidationError):
            derive_cash_transaction_ref("invalid\x00nonprintable")

    def test_cash_payment_idempotent_replay_returns_existing(self):
        """Replaying identical cash payment payload returns (existing_payment, False)."""
        idem_key = "550e8400-e29b-41d4-a716-446655440003"
        payment1, created1 = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("40.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key=idem_key,
        )
        self.assertTrue(created1)
        self.assertEqual(payment1.amount_paid, Decimal("40.00"))
        self.assertEqual(payment1.transaction_type, "Payment")

        # Replay identical payload
        payment2, created2 = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("40.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key=idem_key,
        )
        self.assertFalse(created2)
        self.assertEqual(payment1.id, payment2.id)
        self.assertEqual(payment1.receipt_number, payment2.receipt_number)

    def test_cash_payment_idempotency_conflict_raises_409(self):
        """Reusing cash idempotency key with conflicting payload raises IdempotencyConflictError."""
        idem_key = "550e8400-e29b-41d4-a716-446655440004"
        process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("40.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key=idem_key,
        )

        # Attempt to reuse same key with different amount
        with self.assertRaises(IdempotencyConflictError):
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("50.00"),  # conflicting amount
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key=idem_key,
            )

    # =========================================================================
    # 3. Mobile Money (ZAAD / eDahab) Idempotency
    # =========================================================================

    def test_mobile_money_payment_and_replay(self):
        """ZAAD payment processing, external ref validation, and idempotent replay."""
        tx_ref = "ZAAD-TX-99881122"
        payment1, created1 = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="ZAAD",
            user=self.bursar_user,
            transaction_ref=tx_ref,
        )
        self.assertTrue(created1)
        self.assertEqual(payment1.transaction_ref, tx_ref)

        # Idempotent replay
        payment2, created2 = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="ZAAD",
            user=self.bursar_user,
            transaction_ref=tx_ref,
        )
        self.assertFalse(created2)
        self.assertEqual(payment1.id, payment2.id)

        # Conflict on same ref with different fee_category
        with self.assertRaises(IdempotencyConflictError):
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="School Fee",  # conflicting category
                month="2026-11",
                amount=Decimal("50.00"),
                payment_method="ZAAD",
                user=self.bursar_user,
                transaction_ref=tx_ref,
            )

    # =========================================================================
    # 4. Partial Payments & Invoice Reconciliation
    # =========================================================================

    def test_partial_payments_and_balance_ceiling(self):
        """
        Total invoice due is $80.00.
        Payment 1 ($30) -> Partially Paid, balance $50.00.
        Payment 2 ($50) -> Paid, balance $0.00.
        Payment 3 ($10) -> Rejected: exceeds balance.
        """
        self.assertEqual(self.invoice_1.total_amount_due, Decimal("80.00"))
        self.assertEqual(self.invoice_1.outstanding_balance, Decimal("80.00"))

        # Payment 1: $30.00
        p1, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("30.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440010",
        )
        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("30.00"))
        self.assertEqual(self.invoice_1.status, "Partially Paid")
        self.assertEqual(self.invoice_1.outstanding_balance, Decimal("50.00"))

        # Payment 2: $50.00
        p2, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="School Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="ZAAD",
            user=self.bursar_user,
            transaction_ref="ZAAD-TX-334455",
        )
        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("80.00"))
        self.assertEqual(self.invoice_1.status, "Paid")
        self.assertEqual(self.invoice_1.outstanding_balance, Decimal("0.00"))

        # Payment 3: $10.00 exceeds remaining balance ($0.00)
        with self.assertRaises(ValidationError) as ctx:
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("10.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440011",
            )
        self.assertIn("no remaining outstanding balance", str(ctx.exception))

    def test_two_stage_lookup_replay_on_paid_off_invoice(self):
        """
        CONC-01 invariant: replaying the payment that paid off an invoice
        MUST return the existing payment, not fail with 'no remaining balance'.
        """
        p, created = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("80.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440012",
        )
        self.assertTrue(created)
        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.status, "Paid")
        self.assertEqual(self.invoice_1.outstanding_balance, Decimal("0.00"))

        # Replay the exact same $80 payment
        replayed, created2 = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("80.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440012",
        )
        self.assertFalse(created2)
        self.assertEqual(replayed.id, p.id)

    # =========================================================================
    # 5. Append-Only Ledger: Immutability, Reversals & Refunds
    # =========================================================================

    def test_direct_update_and_delete_prohibited_by_ledger(self):
        """Direct UPDATE and DELETE on StudentPayment raise PermissionDenied (ORM + Trigger)."""
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440020",
        )

        with self.assertRaises(PermissionDenied):
            p.amount_paid = Decimal("60.00")
            p.save()

        with self.assertRaises(PermissionDenied):
            p.delete()

        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.filter(id=p.id).update(amount_paid=Decimal("60.00"))

        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.filter(id=p.id).delete()

    def test_full_payment_reversal(self):
        """100% full reversal voids payment and restores invoice outstanding balance."""
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440021",
        )
        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("50.00"))
        self.assertEqual(self.invoice_1.status, "Partially Paid")

        # Execute Reversal
        rev = reverse_payment(
            original_payment=p,
            user=self.bursar_user,
            reason="Cheque bounced / entered in error",
        )
        self.assertEqual(rev.transaction_type, "Reversal")
        self.assertTrue(rev.is_reversal)
        self.assertEqual(rev.amount_paid, Decimal("50.00"))
        self.assertEqual(rev.reversed_payment, p)

        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("0.00"))
        self.assertEqual(self.invoice_1.status, "Unpaid")
        self.assertEqual(self.invoice_1.outstanding_balance, Decimal("80.00"))

        # Cannot reverse an already reversed payment
        with self.assertRaises(ValidationError) as ctx:
            reverse_payment(
                original_payment=p,
                user=self.bursar_user,
                reason="Second reversal attempt",
            )
        self.assertIn("already been reversed", str(ctx.exception))

    def test_partial_and_full_refunds(self):
        """Supports multiple partial refunds up to net unrefunded payment amount."""
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440022",
        )

        # Refund 1: $20.00
        ref1 = refund_payment(
            original_payment=p,
            amount=Decimal("20.00"),
            user=self.bursar_user,
            reason="Partial scholarship awarded",
        )
        self.assertEqual(ref1.transaction_type, "Refund")
        self.assertFalse(ref1.is_reversal)
        self.assertEqual(ref1.amount_paid, Decimal("20.00"))

        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("30.00"))

        # Refund 2: $30.00 (remaining balance)
        ref2 = refund_payment(
            original_payment=p,
            amount=Decimal("30.00"),
            user=self.bursar_user,
            reason="Remaining refund",
        )
        self.assertEqual(ref2.amount_paid, Decimal("30.00"))
        self.invoice_1.refresh_from_db()
        self.assertEqual(self.invoice_1.total_amount_paid, Decimal("0.00"))

        # Refund 3: Exceeds max refundable balance ($0.00 remaining)
        with self.assertRaises(ValidationError) as ctx:
            refund_payment(
                original_payment=p,
                amount=Decimal("5.00"),
                user=self.bursar_user,
                reason="Excess refund",
            )
        self.assertIn("exceeds maximum refundable balance", str(ctx.exception))

    # =========================================================================
    # 6. General Ledger (Incomes & Expenses) and Reporting
    # =========================================================================

    def test_general_ledger_incomes_and_expenses(self):
        """Incomes and expenses are recorded and aggregate cleanly."""
        inc = Income.objects.create(
            title="Bookshop Sales",
            category="Bookshop",
            amount=Decimal("150.00"),
            payment_method="Cash",
            date=datetime.date(2026, 11, 15),
            reference_number="INC-2026-11-01",
            recorded_by=self.bursar_user,
        )
        exp = Expense.objects.create(
            title="Classroom Electricity",
            category="Utilities",
            amount=Decimal("85.50"),
            payment_method="ZAAD",
            date=datetime.date(2026, 11, 16),
            reference_number="EXP-2026-11-01",
            recorded_by=self.bursar_user,
        )

        overview = get_financial_overview(month="2026-11")
        self.assertEqual(overview["other_income"], Decimal("150.00"))
        self.assertEqual(overview["total_expenses"], Decimal("85.50"))

    def test_financial_overview_no_double_counting(self):
        """Financial overview separates tuition payments from non-tuition incomes."""
        # 1. Post $50 tuition payment
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440030",
        )
        # 2. Post $100 donation
        Income.objects.create(
            title="Community Donation",
            category="Donation",
            amount=Decimal("100.00"),
            payment_method="ZAAD",
            date=datetime.date(2026, 11, 20),
            reference_number="INC-2026-11-02",
            recorded_by=self.bursar_user,
        )
        # 3. Post $40 expense
        Expense.objects.create(
            title="Office Stationery",
            category="Supplies",
            amount=Decimal("40.00"),
            payment_method="Cash",
            date=datetime.date(2026, 11, 21),
            reference_number="EXP-2026-11-02",
            recorded_by=self.bursar_user,
        )

        overview = get_financial_overview(month="2026-11")
        self.assertEqual(overview["student_fee_collections"], Decimal("50.00"))
        self.assertEqual(overview["other_income"], Decimal("100.00"))
        self.assertEqual(overview["total_income"], Decimal("150.00"))
        self.assertEqual(overview["total_expenses"], Decimal("40.00"))
        self.assertEqual(overview["net_balance"], Decimal("110.00"))

    # =========================================================================
    # 7. DRF API Endpoints & RBAC Security Boundaries
    # =========================================================================

    def test_bursar_can_access_finances_and_process_payments(self):
        """Bursar role can access payments, create payments, and view ledger."""
        self.client.force_authenticate(user=self.bursar_user)

        # 1. Post payment via API
        url = "/api/v1/payments/transactions/"
        payload = {
            "student_id": str(self.student_1.id),
            "invoice_id": str(self.invoice_1.id),
            "fee_category": "Class Fee",
            "month": "2026-11",
            "amount": "45.00",
            "payment_method": "Cash",
            "idempotency_key": "550e8400-e29b-41d4-a716-446655440040",
            "notes": "API test payment",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(res.data["amount_paid"]), Decimal("45.00"))

        # 2. Replay with same key -> 200 OK
        res2 = self.client.post(url, payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], res2.data["id"])

        # 3. Access Ledger
        ledger_res = self.client.get("/api/v1/payments/ledger/?month=2026-11")
        self.assertEqual(ledger_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(ledger_res.data["count"], 1)

        # 4. Access Overview
        overview_res = self.client.get("/api/v1/finances/overview/?month=2026-11")
        self.assertEqual(overview_res.status_code, status.HTTP_200_OK)

    def test_teacher_hard_safety_ceiling_on_financial_endpoints(self):
        """
        Teacher Hard Safety Ceiling: TEACHER role is unconditionally blocked (403 Forbidden)
        from accessing fee structures, invoices, payments, income, and expenses.
        """
        self.client.force_authenticate(user=self.teacher_user)

        forbidden_endpoints = [
            ("/api/v1/finances/fee-structures/", "GET"),
            ("/api/v1/finances/invoices/", "GET"),
            ("/api/v1/payments/transactions/", "GET"),
            ("/api/v1/payments/ledger/", "GET"),
            ("/api/v1/finances/incomes/", "GET"),
            ("/api/v1/finances/expenses/", "GET"),
            ("/api/v1/finances/overview/", "GET"),
        ]

        for endpoint, method in forbidden_endpoints:
            if method == "GET":
                res = self.client.get(endpoint)
            else:
                res = self.client.post(endpoint, {})
            self.assertEqual(
                res.status_code,
                status.HTTP_403_FORBIDDEN,
                f"Teacher was not blocked from financial endpoint: {endpoint}",
            )

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated requests to financial endpoints return 401 Unauthorized."""
        self.client.force_authenticate(user=None)
        res = self.client.get("/api/v1/payments/transactions/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_api_reversal_and_refund_endpoints(self):
        """Tests POST /reverse and POST /refund endpoints via DRF API."""
        self.client.force_authenticate(user=self.bursar_user)

        # 1. Create a payment
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440050",
        )

        # 2. Refund $15 via API
        refund_res = self.client.post(
            f"/api/v1/payments/transactions/{p.id}/refund/",
            {"amount": "15.00", "reason": "Overpayment discount"},
            format="json",
        )
        self.assertEqual(refund_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(refund_res.data["transaction_type"], "Refund")
        self.assertEqual(Decimal(refund_res.data["amount_paid"]), Decimal("15.00"))

        # 3. Create another fresh payment for reversal
        p2, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="School Fee",
            month="2026-11",
            amount=Decimal("30.00"),
            payment_method="ZAAD",
            user=self.bursar_user,
            transaction_ref="ZAAD-REV-TEST-01",
        )

        # 4. Reverse via API
        rev_res = self.client.post(
            f"/api/v1/payments/transactions/{p2.id}/reverse/",
            {"reason": "Entry error on wrong account"},
            format="json",
        )
        self.assertEqual(rev_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(rev_res.data["transaction_type"], "Reversal")
        self.assertTrue(rev_res.data["is_reversal"])

    def test_api_receipt_lookup_endpoint(self):
        """Receipt data can be retrieved by receipt number."""
        self.client.force_authenticate(user=self.bursar_user)
        p, _ = process_payment(
            student=self.student_1,
            invoice=self.invoice_1,
            fee_category="Class Fee",
            month="2026-11",
            amount=Decimal("50.00"),
            payment_method="Cash",
            user=self.bursar_user,
            idempotency_key="550e8400-e29b-41d4-a716-446655440051",
        )

        res = self.client.get(f"/api/v1/payments/receipt/{p.receipt_number}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["receipt_number"], p.receipt_number)
        self.assertEqual(res.data["student_admission_number"], self.student_1.admission_number)

    def test_api_idempotency_conflict_returns_409(self):
        """API returns HTTP 409 Conflict when an idempotency key is reused with a conflicting payload."""
        self.client.force_authenticate(user=self.bursar_user)
        url = "/api/v1/payments/transactions/"
        payload = {
            "student_id": str(self.student_1.id),
            "invoice_id": str(self.invoice_1.id),
            "fee_category": "Class Fee",
            "month": "2026-11",
            "amount": "40.00",
            "payment_method": "Cash",
            "idempotency_key": "550e8400-e29b-41d4-a716-446655440052",
        }
        res1 = self.client.post(url, payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Same key, conflicting amount
        conflict_payload = dict(payload)
        conflict_payload["amount"] = "50.00"
        res2 = self.client.post(url, conflict_payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res2.data.get("code"), "idempotency_conflict")

    def test_negative_or_zero_payment_amount_rejected(self):
        """Zero and negative payment amounts are rejected at both service and API levels."""
        with self.assertRaises(ValidationError):
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("0.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440053",
            )

        with self.assertRaises(ValidationError):
            process_payment(
                student=self.student_1,
                invoice=self.invoice_1,
                fee_category="Class Fee",
                month="2026-11",
                amount=Decimal("-15.00"),
                payment_method="Cash",
                user=self.bursar_user,
                idempotency_key="550e8400-e29b-41d4-a716-446655440054",
            )
