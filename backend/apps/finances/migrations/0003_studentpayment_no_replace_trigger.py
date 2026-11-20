# Generated manually for Stage 3.4 Final Immutability Correction:
# Closes the SQLite `INSERT OR REPLACE` / `REPLACE INTO` bypass on
# `studently_student_payments` by enforcing a `BEFORE INSERT` trigger across
# all three unique keys (`id`, `receipt_number`, `(payment_method, transaction_ref)`).
#
# MySQL 8.0.16+ note: MySQL fires `BEFORE DELETE` (`trg_studently_payments_no_delete`)
# on `REPLACE INTO` conflicts and `BEFORE UPDATE` (`trg_studently_payments_no_update`)
# on `INSERT ... ON DUPLICATE KEY UPDATE`, and does not permit selecting from the
# target table inside a `BEFORE INSERT` trigger on that same table (Error 1442).
# Runtime MySQL verification remains deferred to MySQL staging.

from django.db import migrations


def create_no_replace_trigger(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        schema_editor.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_studently_payments_no_replace
            BEFORE INSERT ON studently_student_payments
            WHEN EXISTS (
                SELECT 1 FROM studently_student_payments
                WHERE id = NEW.id
                   OR receipt_number = NEW.receipt_number
                   OR (payment_method = NEW.payment_method AND transaction_ref = NEW.transaction_ref)
            )
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'STUDENTLY_LEDGER_IMMUTABLE: INSERT OR REPLACE on studently_student_payments is prohibited.'
                );
            END;
            """
        )


def drop_no_replace_trigger(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        schema_editor.execute(
            "DROP TRIGGER IF EXISTS trg_studently_payments_no_replace;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("finances", "0002_studentpayment_immutability_triggers"),
    ]

    operations = [
        migrations.RunPython(
            create_no_replace_trigger,
            reverse_code=drop_no_replace_trigger,
        ),
    ]
