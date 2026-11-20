# STUDENTLY — Phase 3.4 Verification Report

**Document:** `PHASE_3_4_VERIFICATION_REPORT.md`  
**Stage:** Phase 3.4 — Core Database Models  
**Date:** November 19, 2026  
**Overall Verification Status:** **PASS** (44/44 Automated Tests Passed; Schema Introspection Reconciled 100%)  

---

## 1. Verification Summary Scorecard

| # | Verification Check | Result | Observed Evidence |
| :---: | :--- | :---: | :--- |
| 1 | `python manage.py check` | **PASS** | `System check identified no issues (0 silenced).` |
| 2 | `python manage.py makemigrations --check --dry-run` | **PASS** | `No changes detected` |
| 3 | `python manage.py migrate` & `showmigrations` | **PASS** | All 7 new Stage 3.4 migrations applied cleanly alongside existing Stage 3.3 & framework migrations |
| 4 | SQLite integrity & foreign-key enforcement | **PASS** | `PRAGMA foreign_keys = 1`; `PRAGMA integrity_check = ok` |
| 5 | Canonical application tables introspection | **PASS** | Exactly **19** `studently_*` tables created (`studently_user_permissions` deferred to Stage 3.6); 0 duplicate tables |
| 6 | Foreign-key inventory introspection | **PASS** | **31/31** physical SQLite FKs verified via `PRAGMA foreign_key_list` (+ 1 deferred in Stage 3.6 = 32) |
| 7 | CHECK constraint inventory introspection | **PASS** | **35/35** named SQLite CHECK constraints verified in `sqlite_master` (34 Phase 2 baseline + 1 Stage 3.3 `chk_user_superuser_admin_only`; + 1 deferred `chk_perm_module` = 36) |
| 8 | Unique constraint inventory | **PASS** | **16/16** declared (6 single-column + 10 composite; + 1 deferred in Stage 3.6 = 17) |
| 9 | Declared application index inventory | **PASS** | **25/25** declared in Django models/migrations (18 `db_index=True` + 7 `Meta.indexes`) |
| 10 | Stage 3.4 model tests + Stage 3.3 regression tests | **PASS** | **44/44 tests passed** (`OK` in `46.980s`; 12 Stage 3.4 + 32 Stage 3.3 `apps.accounts`) |
| 11 | `pip check` | **PASS** | `No broken requirements found.` |
| 12 | `npm run lint` | **PASS** | `tsc --noEmit` exited with code `0`; 0 frontend files modified |
| 13 | Clean review ZIP audit | **PASS** | `STUDENTLY_PHASE_3_4_REVIEW.zip` verified clean (no `.env`, `.venv/`, `db.sqlite3`, `__pycache__`) |

---

## 2. Database Introspection Evidence (`backend/db.sqlite3`)

- **Runtime PRAGMAs:** `PRAGMA foreign_keys = 1`, `PRAGMA integrity_check = ok`.
- **Canonical Application Tables (`19` physical tables in SQLite):**

| # | Physical Table | Physical FKs | Named CHECK Constraints Verified in SQLite DDL |
| :-: | :--- | :-: | :--- |
| 1 | `studently_attendance` | 3 | `chk_attendance_status` (1) |
| 2 | `studently_classes` | 1 | `chk_class_capacity` (1) |
| 3 | `studently_examination_marks` | 4 | `chk_mark_score_positive` (1) |
| 4 | `studently_examination_student_summaries` | 2 | `chk_activity_positive`, `chk_total_positive` (2) |
| 5 | `studently_examinations` | 1 | `chk_exam_type`, `chk_exam_term` (2) |
| 6 | `studently_expenses` | 1 | `chk_expense_amount`, `chk_expense_payment_method` (2) |
| 7 | `studently_fee_structures` | 0 | `chk_fee_category`, `chk_fee_billing_frequency`, `chk_fee_default_amount` (3) |
| 8 | `studently_incomes` | 1 | `chk_income_amount`, `chk_income_payment_method` (2) |
| 9 | `studently_invoice_items` | 2 | `chk_invoice_item_amount` (1) |
| 10 | `studently_promotions` | 4 | *(none)* (0) |
| 11 | `studently_student_invoices` | 1 | `chk_invoice_amounts`, `chk_invoice_status` (2) |
| 12 | `studently_student_payments` | 4 | `chk_payment_amount_positive`, `chk_payment_method`, `chk_payment_transaction_type`, `chk_payment_fee_category`, `chk_payment_reversal_state` (5) |
| 13 | `studently_students` | 1 | `chk_student_gender`, `chk_student_status` (2) |
| 14 | `studently_subjects` | 1 | `chk_subject_max_marks` (1) |
| 15 | `studently_system_settings` | 0 | `chk_settings_singleton_id`, `chk_settings_calc_method`, `chk_settings_term`, `chk_settings_fees_positive`, `chk_weights_range`, `chk_weights_sum` (6) |
| 16 | `studently_teacher_class_assignments` | 2 | *(none)* (0) |
| 17 | `studently_teacher_subject_assignments` | 2 | *(none)* (0) |
| 18 | `studently_teachers` | 0 | `chk_teacher_account_status` (1) |
| 19 | `studently_users` | 1 | `chk_user_role`, `chk_user_status`, `chk_user_superuser_admin_only` (3) |
| **Total** | **19 Canonical Tables** | **31 FKs** | **35 Named CHECK Constraints** |

*(Model/migration declarations also reconciled: `unique_single=6`, `unique_composite=10` [16 total], `db_index=18`, `meta_indexes=7` [25 declared application indexes]. Physical MySQL index deduplication remains `NOT VERIFIED` until MySQL staging per Phase 2 `MEDIUM-01`.)*

---

## 3. Automated Test Execution Results (`manage.py test apps.core apps.academics apps.students apps.finances apps.accounts -v 2`)

- **Total Executed:** 44 tests (`Passed: 44`, `Failed: 0`, `Skipped: 0`, Duration: `46.980s`)
  - **`apps.core.tests` (3/3 OK):** Singleton load/defaults, weighted 100% validation & SQLite `chk_weights_sum` `IntegrityError`, singleton `id=1` `chk_settings_singleton_id` `IntegrityError`.
  - **`apps.academics.tests` (3/3 OK):** UUID PKs, deferred `User.teacher` FK + `ON DELETE SET NULL`, unique constraints, `Classroom` `ON DELETE RESTRICT`, junction `ON DELETE CASCADE`, and DB CHECK constraints (`chk_teacher_account_status`, `chk_class_capacity`, `chk_subject_max_marks`).
  - **`apps.students.tests` (3/3 OK):** Student 7-field contract, `for_teacher()` queryset, `STD-XXXX` validation, `PromotionHistory` `RESTRICT`, `AttendanceRecord` unique/excused/CHECK constraints, `Examination` / `ExaminationStudentSummary` / `ExaminationMark` validation, unique & CHECK constraints.
  - **`apps.finances.tests` (3/3 OK):** `StudentInvoice` decimal precision & `reconcile_status()`, `StudentPayment` immutability (`PermissionDenied` on update/delete), Option A cross-entity ownership, cancelled invoice rejection, balance ceiling, duplicate `(payment_method, transaction_ref)`, 100% `Reversal`, DB CHECK constraints (`chk_payment_amount_positive`, `chk_payment_reversal_state`), `RESTRICT` on invoice delete, `Income` & `Expense` DB CHECK constraints.
  - **`apps.accounts.tests` (32/32 OK):** All 32 approved Stage 3.3 authentication, JWT rotation/blacklisting, throttling, admin form, DB CHECK constraint, and permission validation regression tests remain 100% passing.

---

## 4. Failed Checks & Unresolved Findings

**None (0 failed checks, 0 unresolved findings).**

**STOP CONDITION REACHED:** Awaiting independent audit and explicit authorization before Stage 3.5.
