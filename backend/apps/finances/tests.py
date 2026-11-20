"""
Automated model, financial invariant, immutability, decimal precision,
and database constraint tests for apps.finances.
"""

import datetime
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import RestrictedError
from django.test import TestCase

from apps.academics.models import Classroom
from apps.finances.models import (
    Expense,
    FeeStructure,
    Income,
    InvoiceItem,
    StudentInvoice,
    StudentPayment,
)
from apps.students.models import Student

User = get_user_model()


class FinancesModelsTests(TestCase):
    def setUp(self):
        self.bursar = User.objects.create_user(
            email="bursar@studently.edu",
            password="Str0ng!BursarPass#2026",
            full_name="School Bursar",
            role="ADMIN",
        )
        self.classroom = Classroom.objects.create(
            name="Grade 1",
            section="A",
            academic_year="2026-2027",
        )
        self.student_1 = Student.objects.create(
            admission_number="STD-2001",
            full_name="Halima Nur",
            gender="Female",
            date_of_birth=datetime.date(2015, 3, 10),
            parent_phone="063-4223344",
            classroom=self.classroom,
            registration_date=datetime.date(2026, 9, 1),
        )
        self.student_2 = Student.objects.create(
            admission_number="STD-2002",
            full_name="Abdi Farah",
            gender="Male",
            date_of_birth=datetime.date(2015, 7, 19),
            parent_phone="063-4556677",
            classroom=self.classroom,
            registration_date=datetime.date(2026, 9, 1),
        )
        self.fee = FeeStructure.objects.create(
            name="Class Monthly Tuition",
            code="CLASS_FEE",
            fee_category="Class Fee",
            default_amount=Decimal("45.00"),
            billing_frequency="Monthly",
        )
        self.invoice = StudentInvoice.objects.create(
            invoice_number="INV-2026-11-0001",
            student=self.student_1,
            month="2026-11",
            total_amount_due=Decimal("80.00"),
            total_amount_paid=Decimal("0.00"),
            status="Unpaid",
            due_date=datetime.date(2026, 11, 30),
        )
        self.item = InvoiceItem.objects.create(
            invoice=self.invoice,
            fee_structure=self.fee,
            description="Class Fee — Nov 2026",
            amount=Decimal("45.00"),
        )

    def test_invoice_decimal_precision_and_status_reconciliation(self):
        self.assertIsInstance(self.invoice.id, uuid.UUID)
        self.assertEqual(self.invoice.outstanding_balance, Decimal("80.00"))
        self.invoice.total_amount_paid = Decimal("35.50")
        self.invoice.reconcile_status()
        self.assertEqual(self.invoice.status, "Partially Paid")
        self.assertEqual(self.invoice.outstanding_balance, Decimal("44.50"))
        self.invoice.total_amount_paid = Decimal("80.00")
        self.invoice.reconcile_status()
        self.assertEqual(self.invoice.status, "Paid")
        self.assertEqual(self.invoice.outstanding_balance, Decimal("0.00"))

        # Duplicate (student, month) rejected
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StudentInvoice.objects.create(
                    invoice_number="INV-2026-11-9999",
                    student=self.student_1,
                    month="2026-11",
                    total_amount_due=Decimal("80.00"),
                    due_date=datetime.date(2026, 11, 30),
                )

    def test_student_payment_immutability_option_a_ownership_and_constraints(self):
        payment = StudentPayment.objects.create(
            receipt_number="REC-2026-11-0001",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("45.00"),
            payment_method="Cash",
            payment_date=datetime.date(2026, 11, 15),
            transaction_ref="CASH-IDEM-11111111-1111-4111-8111-111111111111",
            recorded_by=self.bursar,
            transaction_type="Payment",
            is_reversal=False,
        )
        self.assertIsInstance(payment.id, uuid.UUID)
        self.assertEqual(payment.amount_paid, Decimal("45.00"))

        # Immutable: update and delete must raise PermissionDenied
        payment.notes = "Tampered"
        with self.assertRaises(PermissionDenied):
            payment.save()
        with self.assertRaises(PermissionDenied):
            payment.delete()

        # Cross-entity ownership: invoice belonging to student_1 cannot be used for student_2
        with self.assertRaises(ValidationError):
            StudentPayment.objects.create(
                receipt_number="REC-2026-11-0002",
                invoice=self.invoice,
                student=self.student_2,
                fee_category="Class Fee",
                month="2026-11",
                amount_due=Decimal("80.00"),
                amount_paid=Decimal("10.00"),
                payment_method="ZAAD",
                payment_date=datetime.date(2026, 11, 15),
                transaction_ref="ZAAD-WRONG-STUDENT",
                recorded_by=self.bursar,
            )

        # Exceeding outstanding balance rejected
        with self.assertRaises(ValidationError):
            StudentPayment.objects.create(
                receipt_number="REC-2026-11-0003",
                invoice=self.invoice,
                student=self.student_1,
                fee_category="Class Fee",
                month="2026-11",
                amount_due=Decimal("80.00"),
                amount_paid=Decimal("90.00"),
                payment_method="ZAAD",
                payment_date=datetime.date(2026, 11, 15),
                transaction_ref="ZAAD-OVERPAY",
                recorded_by=self.bursar,
            )

        # Duplicate (payment_method, transaction_ref) rejected at DB/clean level
        with self.assertRaises((ValidationError, IntegrityError)):
            with transaction.atomic():
                StudentPayment.objects.create(
                    receipt_number="REC-2026-11-0004",
                    invoice=self.invoice,
                    student=self.student_1,
                    fee_category="Class Fee",
                    month="2026-11",
                    amount_due=Decimal("80.00"),
                    amount_paid=Decimal("20.00"),
                    payment_method="Cash",
                    payment_date=datetime.date(2026, 11, 15),
                    transaction_ref="CASH-IDEM-11111111-1111-4111-8111-111111111111",
                    recorded_by=self.bursar,
                )

        # Valid 100% Reversal succeeds
        reversal = StudentPayment.objects.create(
            receipt_number="REV-REC-2026-11-0001",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("45.00"),
            payment_method="Cash",
            payment_date=datetime.date(2026, 11, 16),
            transaction_ref="REV-CASH-IDEM-11111111-1111-4111-8111-111111111111",
            recorded_by=self.bursar,
            transaction_type="Reversal",
            is_reversal=True,
            reversed_payment=payment,
            reversal_reason="Duplicate cash voucher entry",
        )
        self.assertTrue(reversal.is_reversal)

        # DB CHECK constraint chk_payment_amount_positive & chk_payment_reversal_state via raw SQL INSERT
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO studently_student_payments "
                        "(id, receipt_number, invoice_id, student_id, fee_category, month, "
                        "amount_due, amount_paid, payment_method, payment_date, transaction_ref, "
                        "recorded_by_user_id, transaction_type, is_reversal, reversed_payment_id, "
                        "reversal_reason, notes, created_at) "
                        "VALUES (%s, 'REC-ZERO', %s, %s, 'Class Fee', '2026-11', "
                        "80.00, 0.00, 'Cash', '2026-11-16', 'CASH-ZERO', %s, 'Payment', 0, NULL, NULL, NULL, CURRENT_TIMESTAMP);",
                        [uuid.uuid4().hex, self.invoice.id.hex, self.student_1.id.hex, self.bursar.id.hex],
                    )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO studently_student_payments "
                        "(id, receipt_number, invoice_id, student_id, fee_category, month, "
                        "amount_due, amount_paid, payment_method, payment_date, transaction_ref, "
                        "recorded_by_user_id, transaction_type, is_reversal, reversed_payment_id, "
                        "reversal_reason, notes, created_at) "
                        "VALUES (%s, 'REC-BAD-STATE', %s, %s, 'Class Fee', '2026-11', "
                        "80.00, 10.00, 'Cash', '2026-11-16', 'CASH-BAD-STATE', %s, 'Payment', 1, NULL, NULL, NULL, CURRENT_TIMESTAMP);",
                        [uuid.uuid4().hex, self.invoice.id.hex, self.student_1.id.hex, self.bursar.id.hex],
                    )

        # Invoice deletion RESTRICTED while payments reference it
        with self.assertRaises(RestrictedError):
            self.invoice.delete()

    def test_student_payment_queryset_bulk_and_db_trigger_immutability(self):
        payment = StudentPayment.objects.create(
            receipt_number="REC-2026-11-0100",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("45.00"),
            payment_method="Cash",
            payment_date=datetime.date(2026, 11, 15),
            transaction_ref="CASH-IDEM-22222222-2222-4222-8222-222222222222",
            recorded_by=self.bursar,
            transaction_type="Payment",
            is_reversal=False,
            notes="Original immutable note",
        )
        original_amount = payment.amount_paid
        original_notes = payment.notes

        # 1. Instance update rejected
        payment.notes = "Mutated via save()"
        with self.assertRaises(PermissionDenied):
            payment.save()

        # 2. Instance delete rejected
        with self.assertRaises(PermissionDenied):
            payment.delete()

        # 3. QuerySet.update() rejected
        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.filter(pk=payment.pk).update(notes="Mutated via qs.update()")

        # 4. QuerySet.delete() rejected
        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.filter(pk=payment.pk).delete()

        # 5. bulk_update() rejected
        payment.notes = "Mutated via bulk_update()"
        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.bulk_update([payment], ["notes"])

        # 6. update_or_create() and bulk_create(update_conflicts=True) rejected
        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.update_or_create(
                receipt_number=payment.receipt_number,
                defaults={"notes": "Mutated via update_or_create()"},
            )
        with self.assertRaises(PermissionDenied):
            StudentPayment.objects.bulk_create([payment], update_conflicts=True)

        # 7. Database-level SQLite triggers reject raw SQL UPDATE and DELETE
        with self.assertRaises(IntegrityError) as update_ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_student_payments SET notes = 'SQL Tamper' WHERE id = %s;",
                        [payment.id.hex],
                    )
        self.assertIn("STUDENTLY_LEDGER_IMMUTABLE", str(update_ctx.exception))

        with self.assertRaises(IntegrityError) as delete_ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM studently_student_payments WHERE id = %s;",
                        [payment.id.hex],
                    )
        self.assertIn("STUDENTLY_LEDGER_IMMUTABLE", str(delete_ctx.exception))

        # Verify original DB record is completely unchanged after all rejected mutations
        refreshed = StudentPayment.objects.get(pk=payment.pk)
        self.assertEqual(refreshed.amount_paid, original_amount)
        self.assertEqual(refreshed.notes, original_notes)
        self.assertEqual(StudentPayment.objects.filter(pk=payment.pk).count(), 1)

        # 8. Creating valid Reversal and Refund vouchers remains supported
        refund = StudentPayment.objects.create(
            receipt_number="REF-REC-2026-11-0100-1",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("10.00"),
            payment_method="Cash",
            payment_date=datetime.date(2026, 11, 16),
            transaction_ref="REF-CASH-IDEM-22222222-2222-4222-8222-222222222222-1",
            recorded_by=self.bursar,
            transaction_type="Refund",
            is_reversal=False,
            reversed_payment=payment,
            reversal_reason="Partial fee adjustment",
        )
        self.assertEqual(refund.transaction_type, "Refund")
        self.assertEqual(refund.reversed_payment_id, payment.id)

    def test_student_payment_sqlite_insert_or_replace_blocked_on_all_unique_keys(self):
        payment = StudentPayment.objects.create(
            receipt_number="REC-2026-11-0200",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("30.00"),
            payment_method="ZAAD",
            payment_date=datetime.date(2026, 11, 15),
            transaction_ref="ZAAD-ORIG-200",
            recorded_by=self.bursar,
            transaction_type="Payment",
            is_reversal=False,
            notes="Original ZAAD payment",
        )
        initial_count = StudentPayment.objects.count()

        insert_or_replace_sql = (
            "INSERT OR REPLACE INTO studently_student_payments "
            "(id, receipt_number, invoice_id, student_id, fee_category, month, "
            "amount_due, amount_paid, payment_method, payment_date, transaction_ref, "
            "recorded_by_user_id, transaction_type, is_reversal, reversed_payment_id, "
            "reversal_reason, notes, created_at) "
            "VALUES (%s, %s, %s, %s, 'Class Fee', '2026-11', "
            "80.00, 1.00, %s, '2026-11-16', %s, %s, 'Payment', 0, NULL, NULL, 'REPLACED', CURRENT_TIMESTAMP);"
        )

        # 1. INSERT OR REPLACE using existing primary key `id`
        with self.assertRaises(IntegrityError) as pk_ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        insert_or_replace_sql,
                        [
                            payment.id.hex,
                            "REC-NEW-PK-COLLISION",
                            self.invoice.id.hex,
                            self.student_1.id.hex,
                            "ZAAD",
                            "ZAAD-NEW-PK-COLLISION",
                            self.bursar.id.hex,
                        ],
                    )
        self.assertIn("STUDENTLY_LEDGER_IMMUTABLE", str(pk_ctx.exception))

        # 2. INSERT OR REPLACE using existing `receipt_number`
        with self.assertRaises(IntegrityError) as rec_ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        insert_or_replace_sql,
                        [
                            uuid.uuid4().hex,
                            payment.receipt_number,
                            self.invoice.id.hex,
                            self.student_1.id.hex,
                            "ZAAD",
                            "ZAAD-NEW-REC-COLLISION",
                            self.bursar.id.hex,
                        ],
                    )
        self.assertIn("STUDENTLY_LEDGER_IMMUTABLE", str(rec_ctx.exception))

        # 3. INSERT OR REPLACE using existing `(payment_method, transaction_ref)`
        with self.assertRaises(IntegrityError) as ref_ctx:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        insert_or_replace_sql,
                        [
                            uuid.uuid4().hex,
                            "REC-NEW-REF-COLLISION",
                            self.invoice.id.hex,
                            self.student_1.id.hex,
                            payment.payment_method,
                            payment.transaction_ref,
                            self.bursar.id.hex,
                        ],
                    )
        self.assertIn("STUDENTLY_LEDGER_IMMUTABLE", str(ref_ctx.exception))

        # Verify original payment and row count are completely unchanged
        refreshed = StudentPayment.objects.get(pk=payment.pk)
        self.assertEqual(refreshed.amount_paid, Decimal("30.00"))
        self.assertEqual(refreshed.notes, "Original ZAAD payment")
        self.assertEqual(refreshed.receipt_number, "REC-2026-11-0200")
        self.assertEqual(refreshed.transaction_ref, "ZAAD-ORIG-200")
        self.assertEqual(StudentPayment.objects.count(), initial_count)

        # Verify ordinary creation of a new distinct payment still succeeds
        new_payment = StudentPayment.objects.create(
            receipt_number="REC-2026-11-0201",
            invoice=self.invoice,
            student=self.student_1,
            fee_category="Class Fee",
            month="2026-11",
            amount_due=Decimal("80.00"),
            amount_paid=Decimal("20.00"),
            payment_method="ZAAD",
            payment_date=datetime.date(2026, 11, 16),
            transaction_ref="ZAAD-ORIG-201",
            recorded_by=self.bursar,
            transaction_type="Payment",
            is_reversal=False,
        )
        self.assertEqual(StudentPayment.objects.count(), initial_count + 1)
        self.assertEqual(new_payment.amount_paid, Decimal("20.00"))

    def test_cancelled_invoice_blocks_payment_and_income_expense_constraints(self):
        self.invoice.status = "Cancelled"
        self.invoice.save(update_fields=["status"])
        with self.assertRaises(ValidationError):
            StudentPayment.objects.create(
                receipt_number="REC-2026-11-0010",
                invoice=self.invoice,
                student=self.student_1,
                fee_category="Class Fee",
                month="2026-11",
                amount_due=Decimal("80.00"),
                amount_paid=Decimal("10.00"),
                payment_method="eDahab",
                payment_date=datetime.date(2026, 11, 15),
                transaction_ref="EDAHAB-CANCELLED-TEST",
                recorded_by=self.bursar,
            )

        inc = Income.objects.create(
            title="Bookshop Sales",
            category="Bookstore",
            amount=Decimal("250.00"),
            payment_method="Cash",
            date=datetime.date(2026, 11, 10),
            reference_number="INC-2026-001",
            recorded_by=self.bursar,
        )
        exp = Expense.objects.create(
            title="Electricity Utility",
            category="Utilities",
            amount=Decimal("120.50"),
            payment_method="ZAAD",
            date=datetime.date(2026, 11, 11),
            reference_number="EXP-2026-001",
            recorded_by=self.bursar,
        )
        self.assertEqual(inc.amount, Decimal("250.00"))
        self.assertEqual(exp.amount, Decimal("120.50"))

        # DB CHECK constraints on Income and Expense
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_incomes SET amount = -10.00 WHERE id = %s;",
                        [inc.id.hex],
                    )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_expenses SET payment_method = 'Bitcoin' WHERE id = %s;",
                        [exp.id.hex],
                    )
