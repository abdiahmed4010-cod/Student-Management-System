# STUDENTLY — Phase 3.4 Final Immutability Correction Report

**Document:** `PHASE_3_4_FINAL_IMMUTABILITY_CORRECTION_REPORT.md`  
**Scope:** Stage 3.4 Final Immutability Correction — Closing SQLite `INSERT OR REPLACE` Bypass on `studently_student_payments`  
**Date:** November 19, 2026  
**Status:** Complete — Ready for Independent Audit  

---

## 1. Root Cause

In SQLite, `INSERT OR REPLACE` / `REPLACE INTO` resolves unique-key conflicts by silently deleting the conflicting row without firing `BEFORE DELETE` triggers unless `PRAGMA recursive_triggers = ON;` is set on the connection. Consequently, a raw SQL `INSERT OR REPLACE` statement could bypass `trg_studently_payments_no_delete` and overwrite an existing `studently_student_payments` record.

---

## 2. Solution Implemented

### 2.1. Reversible SQLite `BEFORE INSERT` Trigger (`backend/apps/finances/migrations/0003_studentpayment_no_replace_trigger.py`)
Created a reversible `RunPython` migration adding `trg_studently_payments_no_replace` on `studently_student_payments` for SQLite:

```sql
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
```

- **Unconditional Protection:** Fires on every `INSERT` / `INSERT OR REPLACE` / `REPLACE INTO` **before** SQLite's conflict-resolution deletion occurs, independent of `PRAGMA recursive_triggers`.
- **Complete Unique-Key Coverage:** Guards all three unique keys of `studently_student_payments`:
  1. Primary key `id`
  2. `receipt_number`
  3. Composite `(payment_method, transaction_ref)`
- **Ordinary Inserts Preserved:** New `Payment`, `Reversal`, and `Refund` records with distinct unique keys evaluate `WHEN EXISTS(...)` as `FALSE` and insert normally.
- **Reversible:** `drop_no_replace_trigger` executes `DROP TRIGGER IF EXISTS trg_studently_payments_no_replace;`.

### 2.2. MySQL 8.0.16+ Review
- In MySQL 8.0.16+ InnoDB, `REPLACE INTO` fires `BEFORE DELETE` (`trg_studently_payments_no_delete` from `finances.0002`) when a duplicate-key conflict occurs, and `INSERT ... ON DUPLICATE KEY UPDATE` fires `BEFORE UPDATE` (`trg_studently_payments_no_update`).
- MySQL prohibits querying the trigger's target table inside a `BEFORE INSERT` trigger on that same table (`ERROR 1442`), so the `BEFORE INSERT` subquery trigger is scoped strictly to `vendor == "sqlite"`.
- Runtime MySQL trigger verification remains explicitly **`NOT VERIFIED`** until MySQL staging.

---

## 3. Files Created & Modified

| File | Action | Purpose |
| :--- | :---: | :--- |
| `backend/apps/finances/migrations/0003_studentpayment_no_replace_trigger.py` | Created | Reversible SQLite `BEFORE INSERT` trigger blocking `INSERT OR REPLACE` across all 3 unique keys. |
| `backend/apps/finances/tests.py` | Modified | Added `test_student_payment_sqlite_insert_or_replace_blocked_on_all_unique_keys`. |
| `PHASE_3_4_FINAL_IMMUTABILITY_CORRECTION_REPORT.md` | Created | This correction report. |
| `PHASE_3_4_FINAL_IMMUTABILITY_VERIFICATION_REPORT.md` | Created | Verification evidence report. |
| `STUDENTLY_PHASE_3_4_FINAL_IMMUTABILITY_REVIEW.zip` | Created | Clean review archive (excludes `.env`, `.venv/`, `db.sqlite3`, `__pycache__`, `*.pyc`). |

---

## 4. Preserved Protections & Scope Compliance

- Existing `StudentPaymentQuerySet` ORM guards (`update`, `delete`, `bulk_update`, `update_or_create`, `bulk_create(update_conflicts=True)` + async variants) and instance `save()`/`delete()` guards remain untouched.
- Existing `trg_studently_payments_no_update` and `trg_studently_payments_no_delete` triggers (`finances.0002`) remain active.
- Zero changes to unrelated models, Stage 3.3 auth, JWT, RBAC, or frontend files.

**STOP CONDITION REACHED:** Awaiting independent audit and explicit authorization before Stage 3.5.
