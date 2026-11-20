# STUDENTLY — Phase 3.4 Immutability Correction Report

**Document:** `PHASE_3_4_IMMUTABILITY_CORRECTION_REPORT.md`  
**Scope:** Stage 3.4 Critical Correction — `StudentPayment` Append-Only Financial Ledger Immutability  
**Date:** November 19, 2026  
**Status:** Complete — Ready for Independent Audit  

---

## 1. Root Cause

Prior to this correction, `StudentPayment` enforced append-only immutability only through instance-level `save()` and `delete()` overrides. Django QuerySet and bulk ORM operations (`QuerySet.update()`, `QuerySet.delete()`, `bulk_update()`, `update_or_create()`, `bulk_create(..., update_conflicts=True)`, and async equivalents) as well as raw SQL `UPDATE`/`DELETE` statements bypassed instance methods and could mutate or delete persisted financial ledger records.

---

## 2. Two-Layer Defense-in-Depth Correction

### Layer 1 — Django ORM QuerySet & Manager Guard (`backend/apps/finances/models.py`)
Added `StudentPaymentQuerySet(models.QuerySet)` and attached `objects = StudentPaymentQuerySet.as_manager()` to `StudentPayment`, blocking all ORM mutation/deletion paths with `PermissionDenied`:
- `update()` & `aupdate()`
- `delete()` & `adelete()`
- `bulk_update()` & `abulk_update()`
- `update_or_create()` & `aupdate_or_create()`
- `bulk_create(..., update_conflicts=True)` (while non-conflicting `bulk_create()` runs `obj.full_clean()` on every item before insert)

Instance-level `save()` (rejecting updates on persisted rows) and `delete()` overrides remain fully intact.

### Layer 2 — Database-Level Append-Only Triggers (`backend/apps/finances/migrations/0002_studentpayment_immutability_triggers.py`)
Added a vendor-aware, reversible migration (`RunPython`) creating database triggers on `studently_student_payments`:
- **SQLite (Active & Tested in Development):**
  - `trg_studently_payments_no_update` (`BEFORE UPDATE ON studently_student_payments` → `RAISE(ABORT, 'STUDENTLY_LEDGER_IMMUTABLE: ...')`)
  - `trg_studently_payments_no_delete` (`BEFORE DELETE ON studently_student_payments` → `RAISE(ABORT, 'STUDENTLY_LEDGER_IMMUTABLE: ...')`)
- **MySQL 8.0.16+ (Forward-Compatible Blueprint Matching Phase 2 `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`):**
  - `trg_studently_payments_no_update` / `trg_studently_payments_no_delete` using `SIGNAL SQLSTATE '45000'`. *(Runtime MySQL execution remains `NOT VERIFIED` until future MySQL staging.)*
- **Reversibility:** `drop_payment_immutability_triggers` drops both triggers cleanly via `DROP TRIGGER IF EXISTS`.

---

## 3. Exact Files Created & Modified

| File | Action | Purpose |
| :--- | :---: | :--- |
| `backend/apps/finances/models.py` | Modified | Added `StudentPaymentQuerySet` and attached `objects = StudentPaymentQuerySet.as_manager()` to `StudentPayment`. |
| `backend/apps/finances/migrations/0002_studentpayment_immutability_triggers.py` | Created | Vendor-aware SQLite/MySQL `BEFORE UPDATE` & `BEFORE DELETE` immutability triggers on `studently_student_payments`. |
| `backend/apps/finances/tests.py` | Modified | Added `test_student_payment_queryset_bulk_and_db_trigger_immutability` and updated `CHECK` constraint tests to use raw SQL `INSERT` so both `CHECK` constraints and triggers are independently verified. |
| `PHASE_3_4_IMMUTABILITY_CORRECTION_REPORT.md` | Created | This correction report. |
| `PHASE_3_4_IMMUTABILITY_VERIFICATION_REPORT.md` | Created | Verification evidence report. |
| `STUDENTLY_PHASE_3_4_IMMUTABILITY_REVIEW.zip` | Created | Clean review archive (excluding `.env`, `.venv/`, `db.sqlite3`, `__pycache__`, `*.pyc`). |

---

## 4. Scope Compliance & Preserved Behavior

- Normal creation of `Payment`, `Reversal`, and `Refund` records remains fully functional.
- All Option A invoice ownership, cancelled invoice, balance ceiling, unique constraint, and `CHECK` constraint validations remain intact.
- Zero unrelated models, migrations, Stage 3.3 authentication/security behaviors, or frontend files were modified.

**STOP CONDITION REACHED:** Awaiting independent audit and explicit authorization before Stage 3.5.
