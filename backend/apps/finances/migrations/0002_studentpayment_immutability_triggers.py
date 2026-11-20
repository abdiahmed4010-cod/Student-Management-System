# Generated manually for Stage 3.4 Critical Correction:
# Database-level append-only immutability triggers on studently_student_payments
# (SQLite RAISE(ABORT) for development; MySQL SIGNAL SQLSTATE '45000' for future production).

from django.db import migrations


def create_payment_immutability_triggers(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "sqlite":
        schema_editor.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_studently_payments_no_update
            BEFORE UPDATE ON studently_student_payments
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'STUDENTLY_LEDGER_IMMUTABLE: Direct UPDATE on studently_student_payments is prohibited. Post a Reversal or Refund voucher.'
                );
            END;
            """
        )
        schema_editor.execute(
            """
            CREATE TRIGGER IF NOT EXISTS trg_studently_payments_no_delete
            BEFORE DELETE ON studently_student_payments
            BEGIN
                SELECT RAISE(
                    ABORT,
                    'STUDENTLY_LEDGER_IMMUTABLE: Direct DELETE on studently_student_payments is prohibited. Post a Reversal voucher.'
                );
            END;
            """
        )
    elif vendor == "mysql":
        schema_editor.execute(
            """
            CREATE TRIGGER trg_studently_payments_no_update
            BEFORE UPDATE ON studently_student_payments
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'STUDENTLY_LEDGER_IMMUTABLE: Direct UPDATE on studently_student_payments is prohibited. Post a Reversal or Refund voucher.';
            END
            """
        )
        schema_editor.execute(
            """
            CREATE TRIGGER trg_studently_payments_no_delete
            BEFORE DELETE ON studently_student_payments
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'STUDENTLY_LEDGER_IMMUTABLE: Direct DELETE on studently_student_payments is prohibited. Post a Reversal voucher.';
            END
            """
        )


def drop_payment_immutability_triggers(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor in {"sqlite", "mysql"}:
        schema_editor.execute(
            "DROP TRIGGER IF EXISTS trg_studently_payments_no_update;"
        )
        schema_editor.execute(
            "DROP TRIGGER IF EXISTS trg_studently_payments_no_delete;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("finances", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            create_payment_immutability_triggers,
            reverse_code=drop_payment_immutability_triggers,
        ),
    ]
