# STUDENTLY — Phase 2 Independent Audit Corrections & Architecture Hardening
**Document:** `PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md`  
**Phase:** Phase 2 — Database Architecture & Design Final Validation  
**Role:** Principal Database Architect & Senior Django ORM Specialist  
**Date:** November 2026  
**Status:** Audit Completed — Corrections Applied to Actual Documentation — Awaiting External Stakeholder Review  

---

## 1. Executive Summary & Purpose

An independent technical audit of all Phase 2 architectural specifications for **STUDENTLY — School & Payment Management System** identified several critical implementation details requiring explicit reconciliation:
1. ForeignKey `db_column` attributes missing where Django default naming (`<field>_id`) diverged from `DATA_DICTIONARY.md`.
2. Confusion between application-level choices/validators and database-level `CHECK` constraints, requiring reconciliation to a verified count of **35 explicit database CHECK constraints**.
3. Lack of explicit business rules governing full vs. partial refunds, multiple refunds, refundable ceilings, duplicate reversals, and the execution of Django model validation on `.save()`.
4. Inclusion of the obsolete, removed `NO_AUTO_CREATE_USER` mode in MySQL connection settings and imprecise descriptions of SQLite vs. MySQL `select_for_update()` locking semantics.
5. Inconsistent index recounting that ambiguously blended explicit indexes with unique constraints and primary keys.
6. Ambiguity regarding whether the 20-table count included Django built-in tables and whether `PermissionsMixin` is necessary alongside the custom module permissions system.

This document records the exact corrections applied directly to the underlying architecture documents:
- [`DATABASE_ARCHITECTURE.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ARCHITECTURE.md)
- [`DATABASE_ERD.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ERD.md)
- [`DATA_DICTIONARY.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATA_DICTIONARY.md)
- [`DJANGO_MODEL_SPECIFICATIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md)
- [`DATABASE_CONSTRAINTS_AND_INDEXES.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md)
- [`SQLITE_TO_MYSQL_MIGRATION_PLAN.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md)
- [`PHASE_2_FINAL_REVIEW.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_REVIEW.md)
- [`PHASE_2_CORRECTIONS.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CORRECTIONS.md)
- [`PHASE_2_SIGNOFF_CHECKLIST.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_SIGNOFF_CHECKLIST.md)
- [`PHASE_2_FINAL_CORRECTION_REPORT.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_CORRECTION_REPORT.md)

---

## 2. Issue 1: Complete ForeignKey `db_column` Audit & Alignment

### The Inconsistency
In Django ORM, a `ForeignKey` named `classroom` generates an underlying database column named `classroom_id` by default. However, `DATA_DICTIONARY.md` strictly specifies `class_id` across multiple tables (`studently_subjects`, `studently_teacher_class_assignments`, `studently_students`, `studently_attendance`, `studently_examinations`). Similarly, historical user and teacher references (`recorded_by`, `promoted_by`) would default to `recorded_by_id` or `promoted_by_id`, conflicting with `recorded_by_user_id`, `recorded_by_teacher_id`, and `promoted_by_user_id`.

### Exact Before-and-After Mapping
Every ForeignKey in `DJANGO_MODEL_SPECIFICATIONS.md` has been updated with an explicit `db_column` parameter:

| Model Class | Field Name | Target Model | Django Default Column | Audited Data Dictionary Column | Updated Definition with `db_column` |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `User` | `teacher` | `Teacher` | `teacher_id` | `teacher_id` | `db_column='teacher_id'` |
| `UserPermission` | `user` | `User` | `user_id` | `user_id` | `db_column='user_id'` |
| `Classroom` | `teacher` | `Teacher` | `teacher_id` | `teacher_id` | `db_column='teacher_id'` |
| `Subject` | `classroom` | `Classroom` | **`classroom_id`** | **`class_id`** | **`db_column='class_id'`** |
| `TeacherClassAssignment` | `teacher` | `Teacher` | `teacher_id` | `teacher_id` | `db_column='teacher_id'` |
| `TeacherClassAssignment` | `classroom` | `Classroom` | **`classroom_id`** | **`class_id`** | **`db_column='class_id'`** |
| `TeacherSubjectAssignment` | `teacher` | `Teacher` | `teacher_id` | `teacher_id` | `db_column='teacher_id'` |
| `TeacherSubjectAssignment` | `subject` | `Subject` | `subject_id` | `subject_id` | `db_column='subject_id'` |
| `Student` | `classroom` | `Classroom` | **`classroom_id`** | **`class_id`** | **`db_column='class_id'`** |
| `PromotionHistory` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `PromotionHistory` | `previous_classroom` | `Classroom` | **`previous_classroom_id`** | **`previous_class_id`** | **`db_column='previous_class_id'`** |
| `PromotionHistory` | `new_classroom` | `Classroom` | **`new_classroom_id`** | **`new_class_id`** | **`db_column='new_class_id'`** |
| `PromotionHistory` | `promoted_by` | `User` | **`promoted_by_id`** | **`promoted_by_user_id`** | **`db_column='promoted_by_user_id'`** |
| `AttendanceRecord` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `AttendanceRecord` | `classroom` | `Classroom` | **`classroom_id`** | **`class_id`** | **`db_column='class_id'`** |
| `AttendanceRecord` | `teacher` | `Teacher` | `teacher_id` | `teacher_id` | `db_column='teacher_id'` |
| `Examination` | `classroom` | `Classroom` | **`classroom_id`** | **`class_id`** | **`db_column='class_id'`** |
| `ExaminationStudentSummary` | `examination` | `Examination` | `examination_id` | `examination_id` | `db_column='examination_id'` |
| `ExaminationStudentSummary` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `ExaminationMark` | `examination` | `Examination` | `examination_id` | `examination_id` | `db_column='examination_id'` |
| `ExaminationMark` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `ExaminationMark` | `subject` | `Subject` | `subject_id` | `subject_id` | `db_column='subject_id'` |
| `ExaminationMark` | `recorded_by` | `Teacher` | **`recorded_by_id`** | **`recorded_by_teacher_id`** | **`db_column='recorded_by_teacher_id'`** |
| `StudentInvoice` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `InvoiceItem` | `invoice` | `StudentInvoice` | `invoice_id` | `invoice_id` | `db_column='invoice_id'` |
| `InvoiceItem` | `fee_structure` | `FeeStructure` | `fee_structure_id` | `fee_structure_id` | `db_column='fee_structure_id'` |
| `StudentPayment` | `invoice` | `StudentInvoice` | `invoice_id` | `invoice_id` | `db_column='invoice_id'` |
| `StudentPayment` | `student` | `Student` | `student_id` | `student_id` | `db_column='student_id'` |
| `StudentPayment` | `recorded_by` | `User` | **`recorded_by_id`** | **`recorded_by_user_id`** | **`db_column='recorded_by_user_id'`** |
| `StudentPayment` | `reversed_payment` | `StudentPayment` | `reversed_payment_id` | `reversed_payment_id` | `db_column='reversed_payment_id'` |
| `Income` | `recorded_by` | `User` | **`recorded_by_id`** | **`recorded_by_user_id`** | **`db_column='recorded_by_user_id'`** |
| `Expense` | `recorded_by` | `User` | **`recorded_by_id`** | **`recorded_by_user_id`** | **`db_column='recorded_by_user_id'`** |

- **Verification Verdict:** **PASS** (100% of foreign keys explicitly aligned across SQLite, MySQL, and Django models).

---

## 3. Issue 2: CHECK Constraint Reconciliation (35 Explicit Constraints)

### The Inconsistency
Previous documents cited "21 CHECK constraints" or "23 CHECK constraints", overlooking several enum fields and decimal non-negativity checks. Crucially, Django's `choices=[...]` and `validators=[MinValueValidator(...)]` are application-level checks; they **do not** emit SQL `CHECK` constraints into migrations unless explicitly defined as `models.CheckConstraint` in `class Meta.constraints`.

### Authoritative Reconciliation & Exact Inventory
The schema contains exactly **35 explicit database CHECK constraints** declared in `DJANGO_MODEL_SPECIFICATIONS.md` and enforced in SQL DDL:

| # | Model Entity | Constraint Name | SQL Check Expression | Category |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `User` | `chk_user_role` | `role IN ('ADMIN', 'TEACHER')` | Enum Choice Check |
| **2** | `User` | `chk_user_status` | `status IN ('Active', 'Deactivated')` | Enum Choice Check |
| **3** | `UserPermission` | `chk_perm_module` | `module IN ('students', 'attendance', 'examinations', 'reports', 'fees', 'payments', 'income', 'expenses', 'teachers', 'classes', 'subjects', 'users', 'certificates', 'settings')` | Enum Choice Check |
| **4** | `Teacher` | `chk_teacher_account_status` | `account_status IN ('Active', 'Deactivated')` | Enum Choice Check |
| **5** | `Classroom` | `chk_class_capacity` | `capacity > 0` | Positive Boundary (`> 0`) |
| **6** | `Subject` | `chk_subject_max_marks` | `max_marks > 0` | Positive Boundary (`> 0`) |
| **7** | `Student` | `chk_student_gender` | `gender IN ('Male', 'Female')` | Enum Choice Check |
| **8** | `Student` | `chk_student_status` | `status IN ('Active', 'Withdrawn', 'Graduated', 'Suspended')` | Enum Choice Check |
| **9** | `AttendanceRecord` | `chk_attendance_status` | `status IN ('Present', 'Absent', 'Excused')` | Enum Choice Check |
| **10** | `Examination` | `chk_exam_type` | `exam_type IN ('Midterm', 'Final')` | Enum Choice Check |
| **11** | `Examination` | `chk_exam_term` | `term IN ('Term 1', 'Term 2', 'Term 3')` | Enum Choice Check |
| **12** | `ExaminationStudentSummary` | `chk_activity_positive` | `activity_score >= 0.00 OR activity_score IS NULL` | Non-negative Decimal (`>= 0`) |
| **13** | `ExaminationStudentSummary` | `chk_total_positive` | `total_score >= 0.00` | Non-negative Decimal (`>= 0`) |
| **14** | `ExaminationMark` | `chk_mark_score_positive` | `score >= 0.00` | Non-negative Decimal (`>= 0`) |
| **15** | `FeeStructure` | `chk_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | Enum Choice Check |
| **16** | `FeeStructure` | `chk_fee_billing_frequency` | `billing_frequency IN ('Monthly', 'Termly', 'Annually', 'One-Time')` | Enum Choice Check |
| **17** | `FeeStructure` | `chk_fee_default_amount` | `default_amount >= 0.00` | Non-negative Decimal (`>= 0`) |
| **18** | `StudentInvoice` | `chk_invoice_amounts` | `total_amount_due >= 0.00 AND total_amount_paid >= 0.00` | Non-negative Decimal (`>= 0`) |
| **19** | `StudentInvoice` | `chk_invoice_status` | `status IN ('Unpaid', 'Partially Paid', 'Paid', 'Cancelled')` | Enum Choice Check |
| **20** | `InvoiceItem` | `chk_invoice_item_amount` | `amount >= 0.00` | Non-negative Decimal (`>= 0`) |
| **21** | `StudentPayment` | `chk_payment_amount_positive` | `amount_paid > 0.00` | Strictly Positive (`> 0.00`) |
| **22** | `StudentPayment` | `chk_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Enum Choice Check |
| **23** | `StudentPayment` | `chk_payment_transaction_type` | `transaction_type IN ('Payment', 'Reversal', 'Refund')` | Enum Choice Check |
| **24** | `StudentPayment` | `chk_payment_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | Enum Choice Check |
| **25** | `StudentPayment` | `chk_payment_reversal_state` | `((transaction_type = 'Payment' AND is_reversal = 0 AND reversed_payment_id IS NULL) OR (transaction_type = 'Reversal' AND is_reversal = 1 AND reversed_payment_id IS NOT NULL) OR (transaction_type = 'Refund' AND is_reversal = 0 AND reversed_payment_id IS NOT NULL))` | Ledger State Integrity Check |
| **26** | `Income` | `chk_income_amount` | `amount >= 0.00` | Non-negative Decimal (`>= 0`) |
| **27** | `Income` | `chk_income_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Enum Choice Check |
| **28** | `Expense` | `chk_expense_amount` | `amount >= 0.00` | Non-negative Decimal (`>= 0`) |
| **29** | `Expense` | `chk_expense_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Enum Choice Check |
| **30** | `SystemSetting` | `chk_settings_singleton_id` | `id = 1` | Singleton Row Check |
| **31** | `SystemSetting` | `chk_settings_calc_method` | `result_calc_method IN ('sum', 'average', 'weighted')` | Enum Choice Check |
| **32** | `SystemSetting` | `chk_settings_term` | `current_term IN ('Term 1', 'Term 2', 'Term 3')` | Enum Choice Check |
| **33** | `SystemSetting` | `chk_settings_fees_positive` | `class_fee_monthly >= 0.00 AND school_fee_monthly >= 0.00` | Non-negative Decimal (`>= 0`) |
| **34** | `SystemSetting` | `chk_weights_range` | `weighted_midterm BETWEEN 0 AND 100 AND weighted_final BETWEEN 0 AND 100` | Weight Range (`0..100`) |
| **35** | `SystemSetting` | `chk_weights_sum` | `result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100)` | Intra-row Sum Constraint |

### Implicit vs. Explicit Constraint Clarification
- Django `choices=[...]` and `validators=[MinValueValidator(...)]` do NOT generate SQL `CHECK` constraints in database migrations.
- Django's `PositiveIntegerField` implicitly generates non-negative checks (`>= 0`) in SQLite and MySQL 8.0.16+.
- Explicit `models.CheckConstraint` declarations are required for domain invariants, valid enums, capacities (`> 0`), max marks (`> 0`), and intra-row weighted score rules.
- MySQL 8.0.16+ InnoDB and SQLite 3.35+ enforce all 35 constraints natively upon `INSERT` and `UPDATE`.

- **Verification Verdict:** **PASS** (Updated in `PHASE_2_FINAL_REVIEW.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, and `DATABASE_CONSTRAINTS_AND_INDEXES.md`).

---

## 4. Issue 3: Payment Ledger Integrity, Reversals & Refunds

### Policy Definitions & Business Rules
1. **Full vs. Partial Refund Policy:**
   - **Reversals (`transaction_type = 'Reversal'`):** Strictly **100% full reversal**. A reversal voids an erroneous cashier entry or bounced remittance. Partial reversals are prohibited. The reversal amount must equal 100% of the original payment amount.
   - **Refunds (`transaction_type = 'Refund'`):** Supports **both full and partial refunds**. A student withdrawing mid-term or receiving a fee adjustment can receive an authorized partial payout.
2. **Multiple Partial Refunds:**
   - Supported natively. Sequential partial refund vouchers can be issued against a single original payment.
3. **Maximum Refundable Amount:**
   - Enforced by domain validation:
     $$\sum \text{Refunds Linked to Payment } P \le P.\text{amount\_paid} - (\text{Reversals})$$
   - If an original payment has already been reversed, its maximum refundable amount is $0.00.
4. **Duplicate Prevention:**
   - External electronic vouchers enforce `UNIQUE (payment_method, transaction_ref)`.
   - Duplicate reversals are blocked: an original payment cannot be reversed more than once (`reversal_transactions.filter(transaction_type='Reversal').exists()`).
   - A Reversal or Refund voucher cannot itself be reversed or refunded (`reversed_payment.transaction_type == 'Payment'`).
5. **Nullable Invoice Relationship:**
   - Tuition payments require `invoice_id NOT NULL`.
   - Ad-hoc payments where `invoice_id = NULL` can be reversed or refunded in the ledger without triggering invoice balance reconciliations.
6. **Handling Cancelled Invoices:**
   - Invoices marked `status = 'Cancelled'` are locked against new payments, reversals, or refunds.
7. **Model Validation Execution Guarantee:**
   - In Django ORM, calling `.save()` or `objects.create()` **bypasses** `clean()` and `full_clean()`.
   - **Hardening Applied:** `StudentPayment.save()` has been overridden to explicitly call `self.full_clean()` before writing, ensuring validation always executes. Furthermore, all ledger workflows are codified into atomic domain service functions (`process_payment`, `reverse_payment`, `refund_payment`) in `apps.finances.services`.

- **Verification Verdict:** **PASS**

---

## 5. Issue 4: MySQL Migration Configuration & Version Consistency

### Corrections Applied to `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`
1. **Consistent MySQL Version:** The production database version is formally standardized as **MySQL 8.0.16+** (specifically recommended: MySQL 8.0.30+ or MySQL 8.4 LTS). All ambiguous references to generic "MySQL 8.0" have been updated.
2. **Removal of `NO_AUTO_CREATE_USER`:**
   In MySQL 8.0, `NO_AUTO_CREATE_USER` was completely removed from the server. Attempting to set it in `sql_mode` produces a fatal error (`ERROR 1231 (42000): Variable 'sql_mode' can't be set to the value of 'NO_AUTO_CREATE_USER'`). It has been removed from the Django database connection options:
   ```python
   # Corrected MySQL 8.0.16+ settings
   'init_command': (
       "SET sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,"
       "NO_ENGINE_SUBSTITUTION';"
       "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;"
   )
   ```
3. **Accurate Concurrency & Locking Semantics:**
   - **SQLite (v3.35+):** SQLite does not support row-level locks or `SELECT ... FOR UPDATE`. Django silently drops `FOR UPDATE` on SQLite. Concurrency serialization occurs strictly when a write operation begins, acquiring a database-wide file lock (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE`).
   - **MySQL 8.0.16+ (InnoDB):** `select_for_update()` issues native `SELECT ... FOR UPDATE`, acquiring exclusive `X` row locks on index records. This guarantees true row-level concurrency for multi-user invoice settlements.

- **Verification Verdict:** **PASS**

---

## 6. Issue 5: Reconciled Database Index Count & Categorization

### Resolving the "26 B-Tree Indexes" Claim
Earlier documentation ambiguously claimed "26 B-Tree indexes" without clarifying how composite indexes, primary keys, and unique constraint indexes were grouped.

The physical database index architecture is now explicitly categorized:
1. **Primary Key Indexes (20 Indexes):** One unique clustered B-Tree index per physical table on `id`.
2. **Unique Constraint Indexes (17 Indexes):**
   - 6 single-column unique indexes (`users.email`, `teachers.email`, `students.admission_number`, `fee_structures.code`, `invoices.invoice_number`, `payments.receipt_number`).
   - 11 composite unique indexes (`user_permissions`, `classes`, `subjects`, `teacher_class_assignments`, `teacher_subject_assignments`, `attendance`, `examinations`, `examination_marks`, `examination_summaries`, `student_invoices`, `payment_method_ref`).
3. **Explicit Application B-Tree Indexes (25 Indexes Total):**
   - **18 Single-Column Indexes via `db_index=True`:**
     `users.role`, `users.status`, `classes.academic_year`, `students.full_name`, `students.parent_phone`, `students.status`, `promotions.academic_year`, `attendance.date`, `examinations.academic_year`, `invoices.month`, `invoices.status`, `payments.month`, `payments.payment_date`, `payments.transaction_type`, `incomes.category`, `incomes.date`, `expenses.category`, `expenses.date`.
   - **7 Composite Multi-Column Indexes via `class Meta.indexes`:**
     `idx_student_class_status`, `idx_attendance_class_date`, `idx_exam_class_year`, `idx_marks_exam_subject`, `idx_invoice_student_status`, `idx_payment_student_date`, `idx_income_cat_date`.
4. **Auto-generated ForeignKey Indexes:** Handled automatically by Django ORM where not already covered by leading columns of composite unique indexes.

- **Verification Verdict:** **PASS**

---

## 7. Issue 6: Application Tables (20) vs. Django Built-in Tables & PermissionsMixin

### Table Count Scope Clarification
The **20 database tables** specified throughout Phase 2 are strictly **STUDENTLY application domain tables**:
- 19 Relational Domain Entities + 1 Singleton Configuration Table.

### Django Framework Built-in Tables
When running Django migrations in Phase 3, Django core apps generate standard framework tables:
- `django_migrations` (Core migration history)
- `django_content_type` (`django.contrib.contenttypes`)
- `django_session` (`django.contrib.sessions`, if database sessions are enabled)
- `django_admin_log` (`django.contrib.admin`, if enabled)

### PermissionsMixin vs. Custom RBAC Determination
- **Analysis:** Standard Django `PermissionsMixin` provides `groups` and `user_permissions` ManyToMany relationships, which generate 3 extra tables: `auth_group`, `studently_users_groups`, and `auth_group_permissions`.
- **Determination:** STUDENTLY features an audited, comprehensive role-based and module-based permission system (`studently_users.role` + `studently_user_permissions` table). The default Django Group and Permission tables are redundant for the application's business requirements.
- **Architectural Policy:** `User` inherits from `AbstractBaseUser`. To support Django Admin superusers without database table bloat, `is_staff` and `is_superuser` are implemented as simple boolean fields on `User`, and `has_perm()` / `has_module_perms()` delegate directly to `role == 'ADMIN'` and `studently_user_permissions`. This eliminates 3 unnecessary framework tables while maintaining full Django Admin and DRF compatibility.

- **Verification Verdict:** **PASS**

---

## 8. Summary Scorecard Across All Audit Items

| # | Audit Item | Target Requirement | Evaluation Result | Implementation & Evidence |
| :-: | :--- | :--- | :---: | :--- |
| **1** | **ForeignKey `db_column` Alignment** | Explicit `db_column` on all foreign keys matching Data Dictionary | **PASS** | Audited all 32 FK relationships; added `db_column` across all models in `DJANGO_MODEL_SPECIFICATIONS.md`. |
| **2** | **CHECK Constraint Reconciliation** | Define explicit `models.CheckConstraint` for all 35 database rules | **PASS** | Enumerated and added all 35 explicit constraints in Django models; reconciled across all docs. |
| **3** | **Payment Ledger Integrity** | Reversals (full), refunds (full/partial), ceilings, duplicate prevention, `save()` validation | **PASS** | Codified in `StudentPayment.clean()`, `.save()`, and atomic services in `apps.finances.services`. |
| **4** | **MySQL Migration Configuration** | MySQL 8.0.16+ minimum, remove `NO_AUTO_CREATE_USER`, correct `select_for_update` | **PASS** | Settings updated; obsolete sql_mode removed; concurrency differences accurately documented. |
| **5** | **Index Count Reconciliation** | Categorize PK (20: 19 UUID + 1 Int), Unique (17), Explicit Application (25: 18 single + 7 composite) | **PASS** | Ambiguous "26 indexes" claim replaced with exact, verifiable inventory. |
| **6** | **Django Built-in Tables & Permissions** | Scope 20 application tables vs framework; resolve PermissionsMixin | **PASS** | 20 application tables clarified; framework tables isolated; lightweight custom RBAC determined. |

---

## 9. Submission for External Independent Review

All ten Phase 2 documentation files have been corrected, hardened, and synchronized on disk.

In accordance with strict audit rules:
- **Zero application source code** has been modified.
- **Zero Django models** have been implemented in the application directory.
- **Zero migrations** have been executed.
- **Zero packages** have been installed.
- **No self-approval:** All sign-off blocks have been transitioned to **PENDING INDEPENDENT REVIEW**.

Phase 2 is now submitted for independent review and formal stakeholder sign-off prior to the commencement of Phase 3.
