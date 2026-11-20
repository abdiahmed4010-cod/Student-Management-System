# STUDENTLY — Relational Database Architecture & Design
**Document:** `DATABASE_ARCHITECTURE.md`  
**Phase:** Phase 2 — Database Architecture & Design  
**Author:** Senior Database Architect & Django Backend Architect  
**Date:** November 2026 (Updated & Validated)  
**Status:** Architecture Specification — Fully Reconciled & Validated  

---

## 1. Executive Summary & Design Principles

This document specifies the complete relational database architecture for **STUDENTLY — School & Payment Management System**. Transitioning from the Phase 1 browser-based `LocalStorage` prototype into a production-grade full-stack architecture requires replacing flat, unvalidated client-side JSON collections with a normalized, high-performance relational database.

### 1.1. Core Architectural Tenets
1. **Third Normal Form (3NF) Normalization:**
   - Eradication of flat JSON maps and embedded sub-arrays (e.g., transforming `exam.marks[studentId][subjectId]` into relational child records in `studently_examination_marks`).
   - Elimination of update, insertion, and deletion anomalies.
2. **Dual-Identifier Pattern (19 UUIDs + 1 Integer Singleton & Human-Readable IDs):**
   - **Internal Primary Keys:** Exactly **19 application domain entities** use an immutable Universally Unique Identifier (`UUIDv4`). Exactly **1 system entity** (`studently_system_settings`) uses a single-row integer singleton primary key (`id = 1`, `PositiveSmallIntegerField`).
   - **Storage Engine Physical Semantics Across Engine Layers:**
     - **Python Runtime Layer:** Handled natively as Python standard library `uuid.UUID` objects.
     - **Django ORM Layer:** Declared as `models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`. Because neither SQLite nor MySQL provides a native UUID column data type in standard Django ORM, Django maps `UUIDField` to `char(32) NOT NULL` in migration DDL and stores values stripped of hyphens via `uuid_obj.hex` (32 hexadecimal ASCII characters).
     - **SQLite:** Declared as `char(32)`, which SQLite assigns `TEXT` type affinity (32 bytes payload). Tables are organized around internal 64-bit signed integer `rowid` B-Trees. Declaring a UUID primary key creates an auxiliary unique B-Tree index on `id` over `rowid`.
     - **MySQL 8.0.16+ InnoDB:** Django migrations emit `char(32) NOT NULL`. The declared primary key forms the InnoDB **clustered index** containing full row leaf pages. Secondary indexes store the 32-character primary key value as their leaf pointer.
     - **API & Serialization Layer:** Django REST Framework `serializers.UUIDField` automatically formats `uuid.UUID` values into canonical 36-character hyphenated RFC 4122 strings (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), maintaining 100% contract compatibility with the Vanilla JavaScript frontend.
     - **Binary UUID Storage Architectural Rationale:** Dedicated `BINARY(16)` storage (with `UUID_TO_BIN(..., 1)`) is not natively supported by Django 5.x ORM without custom field extensions or third-party packages. Given STUDENTLY's institutional school scale (thousands of operations per term, not high-frequency financial trading), standard Django `char(32)` `UUIDField` indexing delivers optimal maintainability without third-party dependencies.
   - **Security Definition:** UUIDs serve purely as opaque, globally unique resource identifiers that eliminate sequential enumeration attacks (`/api/v1/students/1`, `/2`). **UUIDs do NOT constitute an authorization mechanism and do NOT prevent automated scraping.** Robust access control requires server-side authentication, Django REST Framework permission classes, scoped querysets, rate limiting, and audit logging.
   - **Human-Readable Business Keys:** External human-facing identifiers (e.g., Admission Number `STD-1001`, Invoice Number `INV-2026-10-001`, Receipt Number `REC-2026-10-001`, Transaction Reference `ZAAD-884129`) are stored as distinct, unique indexed columns.
3. **Cross-Engine Compatibility (SQLite 3.35+ & MySQL 8.0.16+):**
   - Development operates on **SQLite 3.35+** (with foreign key enforcement enabled).
   - Production operates on **MySQL 8.0.16+** (specifically recommended: **MySQL 8.0.30+** or **MySQL 8.4 LTS**). MySQL 8.0.16+ is mandatory because earlier MySQL versions parsed SQL `CHECK` constraints syntactically but silently ignored their runtime enforcement.
   - Uses the InnoDB storage engine with `utf8mb4` character set and `utf8mb4_unicode_ci` collation to natively support multi-language strings and Arabic Right-To-Left (RTL) script.
4. **Preservation of Phase 1 Business Rules:**
   - 100% preservation of all student registration rules, teacher class and subject isolation, daily attendance rules, promotion prerequisites, fee structures, and reporting parameters.
5. **Separation of Invoices and Payment Transactions:**
   - In accordance with stakeholder decisions, financial obligations are materialized into formal **Invoices** (`studently_student_invoices`) and reconciled via distinct **Payment Transactions** (`studently_student_payments`), with monetary fields using `DecimalField(max_digits=10, decimal_places=2)` wrapped in atomic database transactions.
6. **Immutable Historical Continuity & Soft Deletion:**
   - Critical academic, attendance, and financial records are protected against hard deletion. Withdrawn students and archived subjects maintain complete historical referential integrity.

---

## 2. Definitive Entity Inventory & Subdomain Breakdown

### 2.1. Application Domain Tables (20 Tables) vs. Django Framework Tables
The core schema comprises exactly **20 application domain tables**:
- **19 Relational Domain Entities** interconnected via foreign key relationships.
- **1 Singleton System Configuration Entity** (`studently_system_settings`) enforced by `CHECK (id = 1)`.

> [!NOTE]
> **Django Framework Built-in Tables:**
> In addition to the 20 application tables, standard Django operations create framework tables managed by Django core apps:
> - `django_migrations` (Migration version tracking)
> - `django_content_type` (Generic relations framework)
> - `django_session` (Session engine, if DB sessions are enabled)
> - `django_admin_log` (Django admin action log)
>
> **PermissionsMixin vs. Custom RBAC Determination:**
> STUDENTLY defines an audited, institutional role-based permission system (`studently_users.role` + `studently_user_permissions`). Standard Django `PermissionsMixin` creates 3 additional tables (`auth_group`, `studently_users_groups`, `auth_group_permissions`). To maintain an ultra-clean database without redundant permission mechanisms, the system uses custom module permissions; if full Django Admin group integration is required, `PermissionsMixin` tables are isolated under Django framework management and do not alter the 20 core application domain entities.

```
+----------------------------------------------------------------------------------------------------+
|                                    STUDENTLY RELATIONAL DOMAINS                                    |
+----------------------------------------------------------------------------------------------------+
|  1. IDENTITY & RBAC      |  2. ACADEMIC STRUCTURE  |  3. STUDENT REGISTRY   |  4. ATTENDANCE       |
|  - Users (Custom)        |  - Classes & Classrooms |  - Students (7-Field + |  - Daily Roll Call   |
|  - Module Permissions    |  - Curriculum Subjects  |    Status Extension)   |  - Excused Reasons   |
|  - Teacher Faculty       |  - Multi-Teacher Assign |  - Promotion Audit     |  - Overwrite Logic   |
+--------------------------+-------------------------+------------------------+----------------------+
|  5. EXAMS & MARKS        |  6. RESULTS & RANKING   |  7. FINANCIAL LEDGER   |  8. PREFERENCES      |
|  - Exam Sessions (Mid/Fin|  - Result Aggregation   |  - Invoices (Monthly)  |  - Tenant Settings   |
|  - Relational Marks      |  - Ranking Formulas     |  - Payment Receipts    |  - Multi-Language    |
|  - Activity Marks        |  - Printable Scorecards |  - Reversals & Refunds |  - RTL Layout Rules  |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Subsystem Specifications

### 3.1. Authentication, Identity & Access Control (RBAC)
- **`studently_users`:** Extends Django's `AbstractBaseUser` (omitting `PermissionsMixin` to avoid creating redundant `auth_*` tables; implements `is_staff`, `is_superuser`, and custom `has_perm`/`has_module_perms`). Replaces plaintext prototype credentials with salted and hashed passwords using PBKDF2 with SHA-256 (Django default) or Argon2.
  - **Authoritative Roles:** Exactly two database roles exist: `ADMIN` and `TEACHER`, enforced by `chk_user_role` (`CHECK (role IN ('ADMIN','TEACHER'))`).
  - **Bursar / Accountant Specification:** A Bursar or Accountant is NOT a separate database role. In STUDENTLY, an accountant is an `ADMIN` user with dedicated financial permissions configured in `studently_user_permissions` (fees, payments, income, expenses, reports).
  - **Superuser Specification:** Superusers are identified by `is_superuser = True`. The canonical term is 'Superuser' (deprecating ambiguous labels like `SUPERADMIN` or `SUPER_ADMIN`). Only active superusers (`is_active = True`) possess institutional override authority.
  - **Account Lifecycle & Fail-Closed Security:** Supports account deactivation (`status = 'Deactivated'` or `is_active = False`) without deleting user audit trails. Inactive users are strictly blocked from receiving any permissions (`has_perm()` unconditionally returns `False`).
  - **Fail-Closed RBAC Architecture (No Implicit Admin Bypass):** Standard `ADMIN` users do NOT automatically receive wildcard access across all modules. Standard admins must have explicit `UserPermission` records provisioned. Missing permission records or database lookup errors strictly default to `False`.
  - **Teacher Hard Safety Ceiling:** Evaluated strictly *before* database lookup. Teachers are unconditionally barred from financial modules (`fees`, `payments`, `income`, `expenses`) and administrative modules (`users`, `settings`, `certificates`), even if an errant permission record exists. Teachers cannot modify student demographics (`can_add`, `can_edit`, `can_delete`, `can_import`) or delete attendance or examination history.
- **`studently_user_permissions`:** Granular matrix table defining module-level overrides across all **14 functional modules** (`students`, `attendance`, `examinations`, `reports`, `fees`, `payments`, `income`, `expenses`, `teachers`, `classes`, `subjects`, `users`, `certificates`, `settings`) across 7 actions (`view`, `add`, `edit`, `delete`, `import`, `print`, `export`).
  - **Validation Architecture:** Django model choices (`MODULE_CHOICES`) provide application-level form and serializer validation, while the SQL CHECK constraint (`chk_perm_module`) enforces relational database integrity.
  - **Admin Provisioning Model:** Role-specialized administrators (such as Bursars and Registrars) are provisioned via explicit `UserPermission` records rather than blanket database superuser privileges.
- **Object-Level Authorization Architecture:**
  - `has_perm()` and `has_module_perms()` evaluate module/model-level access. They do NOT enforce object-level ownership.
  - In Django REST Framework (DRF), object-level security is enforced via:
    1. **Server-Side Permission Classes:** Custom DRF permission classes (e.g. `HasModulePermission`, `IsAssignedTeacherOrAdmin`).
    2. **Scoped QuerySets:** Viewsets override `get_queryset()` to filter data strictly by authenticated user assignments (e.g. teachers only see students and subjects in classes assigned to them).
    3. **Explicit Object Checks:** `check_object_permissions(request, obj)` invoked on retrieve/update/delete operations.
    4. **Server-Side Ownership Validation:** All ownership links (e.g. verifying invoice belongs to student, teacher assigned to class) are verified on the server, never trusted from client parameters.

### 3.2. Academic Setup & Teacher Assignment Architecture
- **Authoritative Teacher-Classroom Model:**
  1. **Homeroom Leadership (`studently_classes.teacher_id`):** Represents the single designated **Homeroom / Lead Teacher** (nullable, `on_delete=SET_NULL`), responsible for morning pastoral care and primary administrative correspondence.
  2. **Multi-Teacher Class Allocation (`studently_teacher_class_assignments`):** Relational junction table mapping multiple teaching faculty members to a classroom cohort.
  3. **Multi-Teacher Subject Allocation (`studently_teacher_subject_assignments`):** Relational junction table mapping teachers to curriculum subjects. Supports co-teaching and team-teaching where multiple instructors share grading responsibilities for the same course code.
- **`studently_classes`:** Represents grade cohorts (e.g., "Grade 1 - Section A") bound to an `academic_year`. Maintains physical room location and enrollment capacity. Deletion is blocked (`ON DELETE RESTRICT`) if active students are assigned.
- **`studently_subjects`:** Curriculum subjects scoped to a `class_id` with an official course code and `max_marks` (default 100). Deletion is blocked if examination marks exist in any term.

### 3.3. Student Registry: 7-Field Contract & Lifecycle Status
- **`studently_students`:** Preserves 100% of the audited Phase 1 seven-field contract:
  1. `id` (UUID Primary Key) + `admission_number` (Unique Business Key `STD-XXXX`).
  2. `full_name` (Text).
  3. `gender` (`Male` | `Female`).
  4. `date_of_birth` (Date `YYYY-MM-DD`).
  5. `parent_phone` (Telephone string).
  6. `class_id` (Foreign Key to `studently_classes`).
  7. `registration_date` (Date `YYYY-MM-DD`).
- **Architectural Status Extension:**
  - In addition to the 7 business fields, a `status` field (`Active`, `Withdrawn`, `Graduated`, `Suspended`) is introduced to satisfy the stakeholder-approved Student Withdrawal & Soft Deletion policy.
  - When a student leaves or transfers, `status` transitions to `Withdrawn`. Hard deletion is strictly prohibited by database foreign key constraints (`ON DELETE RESTRICT`) on attendance, examination marks, and invoices.
  - Withdrawn students are automatically filtered out from active daily attendance sheets and monthly tuition billing runs, but remain permanently available for historical transcripts and accounting audits.

### 3.4. Daily Attendance Engine
- **`studently_attendance`:** Records daily roll call per student per calendar date.
- **Rules & Invariants:**
  - **Single Status per Day:** Enforced via `UNIQUE(student_id, date)`.
  - **Role-Based Status Guard:**
    * Teachers may only assign `Present` or `Absent`.
    * Only Administrators may assign `Excused`.
    * If `status == 'Excused'`, the `excused_reason` text field is mandatory.
  - **Batch Overwrite Logic:** Re-recording attendance for an entire class updates existing rows via database `UPSERT` (`INSERT ... ON DUPLICATE KEY UPDATE` in MySQL / `ON CONFLICT` in SQLite), preserving the original `recorded_at` while updating `updated_at`.

### 3.5. Normalized Examination & Marks Architecture
Phase 1 audited the existing prototype's unstructured JSON `exam.marks` map. Phase 2 completely normalizes this domain into relational tables:
- **`studently_examinations` (Session Header):** Scoped by `class_id`, `exam_type` (`Midterm` | `Final`), `academic_year`, and `term`. Unique constraint: `UNIQUE(class_id, exam_type, academic_year, term)`.
- **`studently_examination_marks` (Normalized Subject Scores):**
  - Columns: `examination_id`, `student_id`, `subject_id`, `score`, `recorded_by_teacher_id`, `created_at`, `updated_at`.
  - Unique constraint: `UNIQUE(examination_id, student_id, subject_id)`.
  - Check constraint: `score >= 0.00`. (Upper bound validated against `subject.max_marks` via model clean/serializer).
  - Enables multiple teachers to grade their respective subjects concurrently without merge conflicts or write locks on other teachers' scores.
- **`studently_examination_student_summaries` (Session Summary):**
  - Holds the Admin-only `activity_score` and materialized `total_score` across all subjects for high-speed ranking queries.

### 3.6. Results, Ranking & Academic Scorecards
- **Formulas Supported:**
  1. `sum`: $\text{Midterm Total} + \text{Final Total}$
  2. `average`: $\frac{\text{Midterm Total} + \text{Final Total}}{2}$
  3. `weighted`: $(\text{Midterm Total} \times W_{\text{mid}}) + (\text{Final Total} \times W_{\text{fin}})$
- **Weighted Validation:** In `studently_system_settings`, an intra-row SQL check constraint `CHECK (result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100))` enforces that percentages total 100% when weighted mode is active.
- **Ranking Algorithm:** Dense competition ranking with tie-handling calculated dynamically or materialized in reporting views. If scores are equal, students share the same merit rank position, and subsequent positions skip accordingly.

### 3.7. Academic Promotion & Historical Progression
- **`studently_promotions`:** Stores audit entries for grade advancements (`student_id`, `previous_class_id`, `new_class_id`, `academic_year`, `promoted_date`, `promoted_by_user_id`).
- **Prerequisite Enforcement:** The promotion engine verifies that a record exists in `studently_examinations` with `exam_type = 'Final'` and marks recorded for the source class before allowing batch promotion execution.

### 3.8. Financial Ledger: Materialized Invoices, Payments, Reversals & Refunds
- **`studently_fee_structures`:** Master catalog of fee types (`Class Fee`, `School Fee`, `Registration Fee`, `Book Fee`) with default amounts, currency, and billing frequencies.
- **`studently_student_invoices` (Materialized Invoicing):**
  - Explicit monthly bills generated for enrolled students for each billing period (`YYYY-MM`).
  - Columns: `invoice_number` (`INV-YYYY-MM-XXXX`), `student_id`, `month`, `total_amount_due`, `total_amount_paid`, `status` (`Unpaid`, `Partially Paid`, `Paid`, `Cancelled`), `due_date`.
- **`studently_invoice_items`:** Line items breaking down the invoice (e.g. Line 1: Class Fee $45.00, Line 2: School Fee $35.00).
- **`studently_student_payments` (Payment Vouchers & Transaction Ledger):**
  - Columns: `receipt_number` (`REC-YYYY-MM-XXXX`), `invoice_id`, `student_id`, `fee_category`, `month`, `amount_due`, `amount_paid`, `payment_method` (`Cash`, `ZAAD`, `eDahab`), `payment_date`, `transaction_ref`, `recorded_by_user_id`, `transaction_type` (`Payment`, `Reversal`, `Refund`), `is_reversal`, `reversed_payment_id`, `reversal_reason`, `notes`.
  - **Payment Ledger Integrity Rules:**
    1. **Strictly Positive Magnitude:** All monetary records are **always strictly positive** (`CHECK (amount_paid > 0.00)`). Direction is governed exclusively by `transaction_type`:
       * `Payment`: Increases invoice `total_amount_paid`.
       * `Reversal`: 100% full reversal of an erroneous or bounced voucher. Decrements invoice `total_amount_paid`. Partial reversals are prohibited.
       * `Refund`: Cash/electronic payout back to student/payer. Supports full and multiple partial refunds up to the net available payment balance.
    2. **Maximum Refundable Ceiling:**
       $$\sum \text{Refunds Linked to Payment } P \le P.\text{amount\_paid} - (\text{Reversals})$$
    3. **Duplicate Prevention, Durable Idempotency & Concurrency Recovery (`MEDIUM-02-A`, `CONC-01`, `CONC-02`):**
       * Both electronic vouchers (`ZAAD`, `eDahab`) and `Cash` remittances enforce durable database-level uniqueness via `UNIQUE (payment_method, transaction_ref)` (global scope per payment method across `studently_student_payments`).
       * For `Cash` payments, the client supplies an `Idempotency-Key`, and the server deterministically derives `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` **before** duplicate lookup and insertion, persisting it in `transaction_ref`. Same key + same payload returns the original payment/receipt (`HTTP 200 OK`); same key + different payload returns `HTTP 409 Conflict`. Redis/Django cache is optional optimization only, never the source of truth.
       * **Two-Stage Duplicate Lookup (`CONC-01`):** `process_payment()` performs an initial persistent lookup before locking, then acquires `StudentInvoice.objects.select_for_update()`, validates invoice ownership, and executes a **mandatory second current-read duplicate lookup** (`StudentPayment.objects.select_for_update()`) **before** outstanding-balance calculation or validation. This guarantees concurrent retries on a newly paid-off invoice return the original receipt rather than failing with a zero-balance validation error.
       * **MySQL `REPEATABLE READ` Current-Read Race Recovery (`CONC-02`):** Payment insertion runs inside an inner `transaction.atomic()` savepoint. On `IntegrityError` matching `UNIQUE(payment_method, transaction_ref)`, recovery executes a current/locking read (`StudentPayment.objects.select_for_update()`) so MySQL InnoDB's default `REPEATABLE READ` MVCC snapshot never masks a concurrently committed winning row. Unrelated `IntegrityError` exceptions are always re-raised.
       * Reversals are blocked if already reversed (`reversal_transactions.filter(transaction_type='Reversal').exists()`).
       * A reversal/refund record cannot itself be reversed or refunded (`reversed_payment.transaction_type == 'Payment'`).
    4. **Adopted Option A — Mandatory Operational Invoicing & Legacy Nullable FK (`MEDIUM-02-B`):**
       * **All new operational payments mandate `invoice_id NOT NULL`** (enforced at the DRF serializer and `process_payment()` service layer).
       * The database column `invoice_id` remains nullable **strictly for historical Phase 1 legacy migration compatibility**. Historical migrated rows with `invoice_id = NULL` can still be reversed or refunded in the ledger without invoice balance adjustments.
       * Existing payments are immutable and can NEVER be reassigned to another invoice. **Option B (unallocated advance deposits) is NOT supported under the current frozen 20-table schema** and would require a future ADR introducing a `PaymentAllocation` ledger table.
    5. **Cancelled Invoices:** Cancelled invoices (`status = 'Cancelled'`) are immutable against new payments, reversals, or refunds.
    6. **Model Validation Execution Guarantee:** Django's `.save()` or `.create()` does not automatically run `full_clean()`. Validation is enforced via model `save()` override and domain services in `apps.finances.services`.
- **`studently_incomes` & `studently_expenses`:**
  - General ledger tables for non-tuition institutional revenue (donations, grants, bookstore sales) and operating expenses (teacher payroll, utilities, maintenance).
  - Guarantees zero double-counting in financial overviews:
    $$\text{Net Balance} = (\sum \text{Tuition Payments} + \sum \text{Other Incomes}) - \sum \text{Operating Expenses}$$

### 3.9. Configurable System Preferences & Multi-Language Support
- **`studently_system_settings`:** Singleton configuration model (`CHECK (id = 1)`) storing the active institution's profile (`MADARASATUL AL-IMAAM`), logo path, academic calendar year, current term, fee rates, and ranking calculation parameters.
- Multi-language strings (`en`, `so`, `ar`) and RTL layout configurations are handled via localized catalog files, ensuring database text fields store pure Unicode content (`utf8mb4`).

---

## 4. Deletion & Historical Immutability Policies

| Entity | Deletion Policy | Implementation Mechanism | Business Justification |
| :--- | :---: | :--- | :--- |
| **User (`studently_users`)** | Soft Delete | `status = 'Deactivated'`, `is_active = False` | Preserves audit trails of who recorded marks and payments. |
| **Teacher (`studently_teachers`)** | Soft Delete | `account_status = 'Deactivated'` | Historical exam marks and class schedules must cite the original teacher. |
| **Class (`studently_classes`)** | Restricted | `ON DELETE RESTRICT` | A class cannot be deleted if active students or examination marks reference it. |
| **Subject (`studently_subjects`)** | Restricted | `ON DELETE RESTRICT` | Cannot delete a subject if examination marks exist in any term. |
| **Student (`studently_students`)** | Soft Delete | `status = 'Withdrawn'` | Permanent hard deletion is blocked if invoices, marks, or payments exist. |
| **Invoice (`studently_student_invoices`)** | Immutable / Void | `status = 'Cancelled'` | Accounting records cannot be deleted; errors must be voided. |
| **Payment (`studently_student_payments`)** | Immutable | Hard deletion strictly blocked; corrections via Reversal voucher | Financial audit logs cannot be altered once receipt is issued. |
| **Exam Marks (`studently_examination_marks`)** | Audited | Track `updated_at` & `recorded_by` | Grades can be revised by authorized teachers, but historical sessions persist. |
| **Promotion (`studently_promotions`)** | Immutable | Append-only audit log | Progression history must be permanently available for transcripts. |

---

## 5. Transaction & Concurrency Guarantees

All critical state transitions in STUDENTLY execute inside atomic database transactions (`@transaction.atomic` in Django):

1. **Payment Collection & Invoice Reconciliation:**
   - Writing to `studently_student_payments` and incrementing/decrementing `studently_student_invoices.total_amount_paid` must be completely atomic.
   - Under **MySQL 8.0.16+ InnoDB (default `REPEATABLE READ`)**, `process_payment()` uses pessimistic row-level current reads (`select_for_update()`) on `StudentInvoice` and for both the post-lock duplicate lookup and post-`IntegrityError` unique-constraint race recovery on `StudentPayment` (inside a nested savepoint).
   - Under **SQLite (v3.35+ Development)**, `select_for_update()` is compiled as a plain `SELECT` without row-level locks; SQLite relies on database-wide file write locks and does **not** provide MySQL-equivalent row locking or `REPEATABLE READ` MVCC semantics. Concurrency safety MUST be validated against MySQL 8.0.16+ in Phase 3 staging.
2. **Batch Grade Submission:**
   - Upserting multiple student grades in `studently_examination_marks` and updating the aggregated session total in `studently_examination_student_summaries` executes in a single atomic transaction.
3. **Student Promotion Workflow:**
   - Updating `student.class_id` and creating the corresponding `studently_promotions` entry is atomic across the entire class batch.

### 5.1. MySQL Deadlock and Transaction Retry Policy
- **MySQL 8.0.16+ InnoDB Deadlock (`1213`) vs. Lock Wait Timeout (`1205`):** `process_payment()` is invoked through a bounded outer retry wrapper (`process_payment_with_deadlock_retry()`, `MAX_DEADLOCK_RETRIES = 3`) defined in [`MYSQL_DEADLOCK_RETRY_POLICY.md`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/MYSQL_DEADLOCK_RETRY_POLICY.md). Only MySQL deadlock error `1213` (`ER_LOCK_DEADLOCK`) is retried — strictly **outside** the failed `transaction.atomic()` block after complete transaction rollback, starting a fresh transaction and repeating all idempotency lookups (`CONC-01`, `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`, `UNIQUE(payment_method, transaction_ref)`).
- **Non-Retryable & Separated Errors:** Lock wait timeout `1205` (`ER_LOCK_WAIT_TIMEOUT`) and retry exhaustion return a controlled `PaymentConcurrencyError` (`HTTP 503`) without creating duplicate payments or corrupting balances; unrelated `OperationalError` exceptions propagate immediately; duplicate-key `IntegrityError` races follow `CONC-02` savepoint + current-read recovery, never the deadlock retry loop.
- **SQLite & Verification Boundary:** SQLite does not provide MySQL-equivalent row-level locking or InnoDB error `1213` deadlocks. Runtime deadlock retry validation is deferred to Phase 3 MySQL staging (`NOT VERIFIED`).
