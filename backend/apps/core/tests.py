"""
Automated model & database constraint tests for apps.core (SystemSetting).
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from apps.core.models import SystemSetting


class SystemSettingModelTests(TestCase):
    def test_singleton_load_and_defaults(self):
        setting = SystemSetting.load()
        self.assertEqual(setting.id, 1)
        self.assertEqual(setting.institution_name, "MADARASATUL AL-IMAAM")
        self.assertEqual(setting.class_fee_monthly, Decimal("45.00"))
        self.assertEqual(setting.school_fee_monthly, Decimal("35.00"))
        self.assertEqual(setting.result_calc_method, "sum")
        self.assertEqual(setting.weighted_midterm, 40)
        self.assertEqual(setting.weighted_final, 60)
        # Calling load() again returns the same singleton row
        self.assertEqual(SystemSetting.load().pk, 1)
        self.assertEqual(SystemSetting.objects.count(), 1)

    def test_weighted_sum_validation_and_db_check_constraint(self):
        setting = SystemSetting.load()
        setting.result_calc_method = "weighted"
        setting.weighted_midterm = 50
        setting.weighted_final = 40
        with self.assertRaises(ValidationError):
            setting.save()

        # Verify DB-level CHECK constraint chk_weights_sum directly via SQL
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_system_settings "
                        "SET result_calc_method = 'weighted', weighted_midterm = 50, weighted_final = 40 "
                        "WHERE id = 1;"
                    )

        # Valid 100% weighted sum succeeds
        setting.weighted_midterm = 30
        setting.weighted_final = 70
        setting.save()
        setting.refresh_from_db()
        self.assertEqual(setting.result_calc_method, "weighted")
        self.assertEqual(setting.weighted_midterm + setting.weighted_final, 100)

    def test_singleton_id_db_check_constraint(self):
        SystemSetting.load()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO studently_system_settings "
                        "(id, institution_name, institution_logo, contact_phone, contact_email, "
                        "address, academic_year, current_term, class_fee_monthly, school_fee_monthly, "
                        "currency_symbol, result_calc_method, weighted_midterm, weighted_final, updated_at) "
                        "VALUES (2, 'Other', '/logo.png', '123', 'a@b.com', 'Addr', '2026-2027', "
                        "'Term 1', 45.00, 35.00, '$', 'sum', 40, 60, CURRENT_TIMESTAMP);"
                    )
