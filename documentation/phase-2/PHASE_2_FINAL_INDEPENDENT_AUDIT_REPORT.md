# STUDENTLY — Phase 2 Final Independent Technical Audit Report

**Document:** `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`  
**Phase:** Phase 2 — Database Architecture & Design Final Audit  
**Auditor Roles:** Senior Database Architect, Django Backend Architect & Technical Documentation Auditor  
**Date:** November 2026  
**Audit Scope:** Exhaustive Verification of all 19 Phase 2 Markdown Documents under `documentation/phase-2/`  
**Recommendation Status:** **CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**  

---

## 1. Executive Summary

This independent technical audit was conducted across the complete suite of **19 Phase 2 Markdown documents** for **STUDENTLY — School & Payment Management System**. The audit evaluated relational completeness (3NF), foreign key cascading actions, constraint definitions, 3-tier index inventories, custom authentication models, financial transaction immutability, payment allocation policy, durable cash idempotency, concurrency race recovery under MySQL InnoDB `REPEATABLE READ`, and dual-engine storage semantics (SQLite 3.35+ in local development vs. MySQL 8.0.16+ InnoDB in production).

### Audit Verdict Summary
- **Master Application Tables:** **Exactly 20 physical application domain tables** verified 1-to-1 against Phase 1 business rules.
- **Foreign Key Relationships:** **Exactly 32 ForeignKeys** (31 cross-table FKs + 1 self-referential payment ledger FK), all possessing explicit `db_column` declarations.
- **Database-Level CHECK Constraints:** **Exactly 35 explicit `models.CheckConstraint` declarations** verified across Django models, Data Dictionary, and SQL DDL.
- **Unique Constraints:** **Exactly 17 Unique Constraints** (6 single-column + 11 composite) verified.
- **Database Indexes:** **Exactly 25 Declared Application Indexes** (18 single-column `db_index=True` + 7 composite `Meta.indexes`) plus 20 PK, 17 Unique, and 32 theoretical auto-FK references; distinct physical index count on disk is formally classified as **`NOT VERIFIED`** pending Phase 3 migration execution and schema introspection (`SHOW INDEX`).
- **Authentication & RBAC:** Custom `User(AbstractBaseUser)` without `PermissionsMixin`, eliminating 5 unwanted Django `auth_*` tables while providing full Django Admin compatibility via `is_staff`, `is_superuser`, and custom fail-closed `has_perm()` / `has_module_perms()`.
- **Financial Ledger Integrity:** **Option A formally adopted** (invoice mandatory for all new operational payments; Option B explicitly unsupported under frozen 20-table schema), canonical durable Cash idempotency (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`, global scope per payment method), mandatory post-invoice-lock current-read duplicate lookup before balance validation (`CONC-01`), MySQL InnoDB `REPEATABLE READ` current-read savepoint race recovery (`CONC-02`), positive magnitude model (`amount_paid > 0.00`), 100% full reversals, multiple partial refunds bounded by mathematical ceilings, append-only immutability overrides (`save()` and `delete()`), and atomic balance reconciliation under `select_for_update()`.
- **Migration & Disaster Recovery:** Minimum MySQL 8.0.16+ enforced; obsolete `NO_AUTO_CREATE_USER` removed; naive SQLite restore guidance replaced with strict zero-loss Forward-Fix and Delta-Replay protocols.

---

## 2. Documents Inspected

The audit inspected all **19 Phase 2 Markdown documents** in `documentation/phase-2/` (the 18 prior Phase 2 documents + `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md` added by the final targeted concurrency corrections):

| # | Document Filename | Inspected Version Date / Hash | Scope of Verification | Status |
| :-: | :--- | :---: | :--- | :---: |
| 1 | [DATABASE_ARCHITECTURE.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ARCHITECTURE.md) | Nov 19, 2026 | 3NF domain architecture, 20 tables vs Django framework, engine storage, fail-closed RBAC, Option A, durable cash idempotency & CONC-01/CONC-02 | **VERIFIED** |
| 2 | [DATABASE_CONSTRAINTS_AND_INDEXES.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md) | Nov 19, 2026 | 20 PKs, 32 FKs, 17 Unique, 35 CHECK constraints, 3-tier index inventory (25 declared / physical `NOT VERIFIED`), Option A, cash idempotency & MySQL REPEATABLE READ current reads | **VERIFIED** |
| 3 | [DATABASE_ERD.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ERD.md) | Nov 19, 2026 | Mermaid ERD, 20 entities, 32 foreign key relationships, Option A vs DB-nullable legacy FK note | **VERIFIED** |
| 4 | [DATA_DICTIONARY.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATA_DICTIONARY.md) | Nov 19, 2026 | Table columns, types, nullability, defaults, keys, constraints, char(32) UUID storage, Option A & `CASH-IDEM-` | **VERIFIED** |
| 5 | [DJANGO_MODEL_SPECIFICATIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md) | Nov 19, 2026 | 20 Django models, explicit `db_column`, 35 `CheckConstraint`, fail-closed RBAC hooks, Option A & concurrency-hardened `process_payment()` (CONC-01 & CONC-02) | **VERIFIED** |
| 6 | [PHASE_2_CORRECTIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CORRECTIONS.md) | Nov 19, 2026 | Master log of technical amendments (Amendments 1 through 36) | **VERIFIED** |
| 7 | [PHASE_2_FINAL_CORRECTION_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_CORRECTION_REPORT.md) | Nov 18, 2026 | Comprehensive evaluation across the 7 initial review items | **VERIFIED** |
| 8 | [PHASE_2_FINAL_REVIEW.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_REVIEW.md) | Nov 18, 2026 | 12-point technical validation audit and compliance verdicts | **VERIFIED** |
| 9 | [PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md) | Nov 19, 2026 | Master schema consistency matrix across all models, FKs, constraints, Option A & concurrency-hardened `process_payment()` | **VERIFIED** |
| 10 | [PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md) | Nov 18, 2026 | Itemized resolutions for db_columns, 35 CHECKs, 25 indexes, ledger rules | **VERIFIED** |
| 11 | [PHASE_2_SIGNOFF_CHECKLIST.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_SIGNOFF_CHECKLIST.md) | Nov 19, 2026 | Compliance checklist and sign-off block across all 19 documents | **VERIFIED** |
| 12 | [SQLITE_TO_MYSQL_MIGRATION_PLAN.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md) | Nov 19, 2026 | Dual-engine strategy, least-privilege accounts, sanitized placeholders, zero-loss recovery protocols, char(32) UUID | **VERIFIED** |
| 13 | [PHASE_2_TARGETED_CORRECTIONS_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_TARGETED_CORRECTIONS_REPORT.md) | Nov 18, 2026 | Itemized report resolving the 6 targeted audit findings | **VERIFIED** |
| 14 | [PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md) | Nov 19, 2026 | Master technical audit report detailing findings AUD-01 through AUD-14, HIGH-01 through HIGH-03, MEDIUM-01 through MEDIUM-03 (incl. MEDIUM-02-A/B), and CONC-01/CONC-02 | **VERIFIED** |
| 15 | [PHASE_2_HIGH_SEVERITY_CORRECTIONS_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_HIGH_SEVERITY_CORRECTIONS_REPORT.md) | Nov 19, 2026 | Critical security corrections report resolving HIGH-01, HIGH-02, and HIGH-03 | **VERIFIED** |
| 16 | [PHASE_2_PAYMENT_POLICY_DECISION.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_PAYMENT_POLICY_DECISION.md) | Nov 19, 2026 | Option A formally adopted, Option B excluded under frozen 20-table schema (+ future ADR blueprint), canonical `CASH-IDEM-` idempotency, CONC-01/CONC-02 & Phase 3 Tests A–F | **VERIFIED** |
| 17 | [PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md) | Nov 19, 2026 | Targeted corrections report resolving findings MEDIUM-01, MEDIUM-02, and MEDIUM-03 (historical record preserved) | **VERIFIED** |
| 18 | [PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md) | Nov 19, 2026 | Targeted resolution report closing MEDIUM-02-A & MEDIUM-02-B (concurrency lookup & recovery superseded by CONC-01/CONC-02) | **VERIFIED** |
| 19 | [PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md) | Nov 19, 2026 | Final targeted concurrency corrections report closing Defect A (`CONC-01`: post-lock duplicate lookup) and Defect B (`CONC-02`: MySQL `REPEATABLE READ` current-read race recovery) | **VERIFIED** |

---

## 3. Itemized Audit Findings & Discrepancy Resolutions

### Finding AUD-01: CHECK Constraint Undercount & Missing Database Invariants
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DATA_DICTIONARY.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`.
- **Exact Issue:** Earlier documentation versions cited 21, 23, or 31 CHECK constraints, conflating Django field-level `choices=[...]` and Python `validators` with actual SQL database-level `CHECK` constraints. Specifically, `UserPermission.module`, `FeeStructure.billing_frequency`, `StudentPayment.fee_category`, and `StudentPayment` reversal state mutex flags existed as application choices but lacked explicit `models.CheckConstraint` declarations.
- **Evidence:** Django migrations omit SQL `CHECK` constraints for `CharField(choices=...)` and `DecimalField(validators=...)` unless `models.CheckConstraint` is defined in `class Meta.constraints`.
- **Required Correction:** Explicitly declare all 35 domain rules via `models.CheckConstraint` across all models and update all documentation inventories to 35.
- **Verification Result:** **PASS**. All 35 constraints verified in `DJANGO_MODEL_SPECIFICATIONS.md` and reconciled across all 12 documents.

---

### Finding AUD-02: ForeignKey `db_column` Mapping Omissions
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATA_DICTIONARY.md`.
- **Exact Issue:** Django ORM automatically appends `_id` to ForeignKey attributes. For example, declaring `classroom = models.ForeignKey('Classroom', ...)` yields a physical column `classroom_id`, whereas `DATA_DICTIONARY.md` specified `class_id`. Similar divergences existed for `promoted_by_user_id`, `recorded_by_teacher_id`, `previous_class_id`, and `new_class_id`.
- **Evidence:** Without `db_column`, running `makemigrations` generated column names that violated the Data Dictionary and frontend REST contracts.
- **Required Correction:** Explicitly declare `db_column` on all 32 ForeignKey declarations in `DJANGO_MODEL_SPECIFICATIONS.md`.
- **Verification Result:** **PASS**. All 32 ForeignKeys verified with explicit `db_column` parameters matching `DATA_DICTIONARY.md`.

---

### Finding AUD-03: `PermissionsMixin` Contradiction in User Model Specification
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`, `DATA_DICTIONARY.md`.
- **Exact Issue:** `DJANGO_MODEL_SPECIFICATIONS.md` imported and declared `class User(AbstractBaseUser, PermissionsMixin)`, while audit reports claimed `PermissionsMixin` was intentionally omitted to avoid creating 5 unwanted Django `auth_*` tables (`auth_group`, `auth_permission`, `auth_group_permissions`, `studently_users_groups`, `studently_users_user_permissions`).
- **Evidence:** Inheriting `PermissionsMixin` causes Django migrations to generate group/permission join tables, violating the clean 20-table application schema boundary.
- **Required Correction:** Remove `PermissionsMixin` from `User` inheritance and import; define `is_staff = models.BooleanField(default=False)` and `is_superuser = models.BooleanField(default=False)`; implement standard `has_perm()` and `has_module_perms()` methods on `User`; delegate module-level permissions strictly to `studently_user_permissions` (`UserPermission`).
- **Verification Result:** **PASS**. `User` now inherits strictly from `AbstractBaseUser`. Admin compatibility preserved without generating redundant tables.

---

### Finding AUD-04: Ambiguous Database Index Accounting & Meta.indexes Omission
- **Severity:** **MEDIUM**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_FINAL_REVIEW.md`.
- **Exact Issue:** Documentation claimed "24 explicit application indexes" (17 single-column + 7 composite), but `DJANGO_MODEL_SPECIFICATIONS.md` had **zero** composite indexes declared in `Meta.indexes`. Furthermore, redundant `db_index=True` flags were declared on columns already covered by unique constraints (`User.email`, `Teacher.email`, `Student.admission_number`, `StudentInvoice.invoice_number`, `StudentPayment.receipt_number`), while `User.status` and `Expense.category` were inconsistently counted.
- **Evidence:** Inspection of `DJANGO_MODEL_SPECIFICATIONS.md` revealed empty `Meta.indexes` lists across all models.
- **Required Correction:**
  1. Remove duplicate `db_index=True` on unique columns.
  2. Codify all 7 composite indexes in `Meta.indexes`: `idx_student_class_status`, `idx_attendance_class_date`, `idx_exam_class_year`, `idx_marks_exam_subject`, `idx_invoice_student_status`, `idx_payment_student_date`, `idx_income_cat_date`.
  3. Include single-column indexes on `User.status` and `Expense.category`, establishing an authoritative total of **25 explicit application indexes** (18 single-column `db_index=True` + 7 composite `Meta.indexes`).
- **Verification Result:** **PASS**. All 25 explicit application indexes declared in code specifications and verified across documents.

---

### Finding AUD-05: Primary Key Storage & Clustered Index Differences (SQLite vs MySQL)
- **Severity:** **MEDIUM**
- **Affected Documents:** `DATABASE_ARCHITECTURE.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_FINAL_REVIEW.md`.
- **Exact Issue:** Documentation claimed all 20 tables use UUID primary keys (overlooking that `SystemSetting` uses an integer singleton `id=1`), and asserted that SQLite provides the same clustered primary-key architecture as MySQL InnoDB.
- **Evidence:** In SQLite, tables are organized as 64-bit integer `rowid` B-Trees. Declaring a UUID primary key stores a `TEXT` string and builds an auxiliary unique index over `rowid`; SQLite does **not** cluster table data by UUID. In MySQL InnoDB, the declared `PRIMARY KEY` (`CHAR(32)` or `SMALLINT`) directly forms the clustered index containing leaf row data.
- **Required Correction:** Clarify that 19 tables use UUID PKs and 1 table uses an Integer singleton PK (`PositiveSmallIntegerField(primary_key=True, default=1)`). Accurately document the storage engine differences between SQLite and MySQL InnoDB.
- **Verification Result:** **PASS**. All documents updated with accurate primary-key inventories and storage engine semantics.

---

### Finding AUD-06: Payment Ledger Immutability & ORM Write-Path Vulnerabilities
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_CORRECTIONS.md`.
- **Exact Issue:** Financial records must be strictly append-only. While `StudentPayment.save()` called `self.full_clean()`, Django ORM methods `bulk_create()`, `QuerySet.update()`, and `QuerySet.delete()` bypass model `.clean()` and `.save()`. Additionally, refund flag rules (`is_reversal`) were conflated with reversals.
- **Evidence:** Direct `StudentPayment.objects.filter(...).delete()` or `update()` would mutate financial records without triggering model validation.
- **Required Correction:**
  1. Override `StudentPayment.delete()` to raise `PermissionDenied`.
  2. Override `StudentPayment.save()` to prevent updates on existing records (`if self.pk and not self._state.adding: raise PermissionDenied(...)`).
  3. Disallow partial reversals; enforce 100% full reversal only.
  4. Support multiple partial refunds up to the mathematical ceiling ($\sum \text{Refunds} \le \text{original\_amount} - \text{reversal}$).
  5. Enforce mutex rules: `transaction_type='Reversal'` requires `is_reversal=True`; `transaction_type='Refund'` requires `is_reversal=False`.
  6. Mandate row-level locking via `select_for_update()` in atomic services and revoke SQL `UPDATE`/`DELETE` on `studently_student_payments` in production MySQL.
- **Verification Result:** **PASS**. Immutability overrides, constraints, and pseudocode domain services fully codified.

---

### Finding AUD-07: Unsafe SQLite-to-MySQL Migration Rollback Guidance
- **Severity:** **HIGH**
- **Affected Documents:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`.
- **Exact Issue:** Section 7 previously recommended reverting to the old SQLite backup if errors occurred in production. If production writes (payments, enrollments, roll calls, exam marks) occurred in MySQL prior to a failure, restoring the pre-cutover SQLite snapshot causes irreversible data loss of all post-cutover transactions.
- **Evidence:** An older SQLite file contains zero knowledge of rows created in MySQL post-cutover.
- **Required Correction:** Strictly ban restoring pre-cutover SQLite snapshots after live production writes commence. Establish a 2-tier disaster recovery protocol: Protocol 1 (Forward-Fix in MySQL) and Protocol 2 (Delta Replay extracting post-cutover writes via timestamped CDC to replay into fallback engine).
- **Verification Result:** **PASS**. Migration plan updated with rigorous pre-cutover rehearsal, cutover locking, and zero-loss recovery protocols.

---

### Finding AUD-08: Residual Outdated Counters in Supporting Documents
- **Severity:** **LOW**
- **Affected Documents:** `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_FINAL_REVIEW.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_FINAL_CORRECTION_REPORT.md`, `PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md`.
- **Exact Issue:** Supporting files contained isolated residual references to "21 CHECK constraints" or "24 explicit indexes", or duplicated section blocks resulting from prior edit passes.
- **Evidence:** Automated regex scanning identified legacy count strings in checklist bullet points and an accidental duplicate section header in `PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md`.
- **Required Correction:** Surgically update all residual counter strings to **35 CHECK constraints** and **25 explicit application indexes**, and remove duplicated markdown blocks.
- **Verification Result:** **PASS**. Zero stale counters or duplicated blocks remain across the documentation suite.

---

### Finding AUD-09: UserPermission MODULE_CHOICES Discrepancy with Database Constraint
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATA_DICTIONARY.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`.
- **Exact Issue:** `UserPermission.MODULE_CHOICES` contained only 5 modules, while the database check constraint `chk_perm_module` accepted 14 modules.
- **Required Correction:** Expand `MODULE_CHOICES` to include all 14 authoritative functional modules (`students`, `attendance`, `examinations`, `reports`, `fees`, `payments`, `income`, `expenses`, `teachers`, `classes`, `subjects`, `users`, `certificates`, `settings`), and clarify application choices vs SQL constraints.
- **Verification Result:** **PASS**. Choices and check constraints synchronized 100%.

---

### Finding AUD-10: Inconsistent RBAC Evaluation & Bypassed Custom Permissions
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`.
- **Exact Issue:** `User.has_perm()` evaluated `is_superuser or role == 'ADMIN'` without checking `is_active`, bypassing `studently_user_permissions` records and omitting DRF object-level authorization architecture.
- **Required Correction:** Rewrite `has_perm()` and `has_module_perms()` with strict `is_active` check, superuser bypass, custom module RBAC lookup, Teacher safety ceiling, and document server-side DRF object-level authorization (scoped querysets, permission classes, ownership validation).
- **Verification Result:** **PASS**. Permission hooks fully aligned with institutional RBAC.

---

### Finding AUD-11: Payment & Invoice Cross-Entity Ownership & Balance Ceilings
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DATA_DICTIONARY.md`.
- **Exact Issue:** Payment service accepted student and invoice independently without verifying that the invoice belonged to that student, and lacked balance ceiling and idempotency checks.
- **Required Correction:** Added `if invoice and str(invoice.student_id) != str(student.id): raise ValidationError(...)`, outstanding balance check (`amount <= remaining_balance`), idempotency check via `UNIQUE(payment_method, transaction_ref)`, and corrected refund parameter to `is_reversal=False`.
- **Verification Result:** **PASS**. Complete financial ownership and concurrency guarantees codified.

---

### Finding AUD-12: Excessive MySQL Production Database Privileges
- **Severity:** **HIGH**
- **Affected Documents:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`.
- **Exact Issue:** Single database user `studently_admin` was granted DDL privileges (`CREATE, DROP, ALTER, REFERENCES`) at runtime.
- **Required Correction:** Segregated into least-privilege accounts: `studently_app` (DML only), `studently_migrator` (DDL/DML for migrations), `studently_backup` (read-only snapshots), and added MySQL production `BEFORE UPDATE` and `BEFORE DELETE` triggers on `studently_student_payments` to enforce ledger immutability at the SQL level.
- **Verification Result:** **PASS**. Principle of least privilege enforced across all database accounts.

---

### Finding AUD-13: Inaccurate Physical UUID Storage Documentation
- **Severity:** **MEDIUM**
- **Affected Documents:** `DATABASE_ARCHITECTURE.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DJANGO_MODEL_SPECIFICATIONS.md`, `DATA_DICTIONARY.md`.
- **Exact Issue:** Documents described UUID storage as 36-character hyphenated strings in SQLite and MySQL.
- **Required Correction:** Accurately documented that Django's built-in `UUIDField` maps to `char(32) NOT NULL` in both SQLite and MySQL backends via `uuid_obj.hex`. SQLite assigns `TEXT` affinity; MySQL InnoDB creates a clustered primary key index; DRF formats UUIDs as 36-char hyphenated strings for frontend contract preservation; binary UUID rationale codified.
- **Verification Result:** **PASS**. Physical storage documentation completely accurate.

---

### Finding AUD-14: Inconsistent User Role References in Documentation
- **Severity:** **MEDIUM**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATA_DICTIONARY.md`, `DATABASE_ARCHITECTURE.md`.
- **Exact Issue:** Informal references to Bursar/Accountant and `SUPERADMIN` vs `SUPER_ADMIN` caused confusion over database role enums.
- **Required Correction:** Formally confirmed strictly two database roles: `'ADMIN'` and `'TEACHER'`, enforced by `chk_user_role`. Clarified that Bursar/Accountant is an `ADMIN` with custom financial permissions, and standardized canonical term **Superuser (`is_superuser=True`)**.
- **Verification Result:** **VERIFIED** / **PASS**. Role architecture and terminology 100% consistent across all documents.

---

### Finding HIGH-01: Teacher Safety Ceiling Evaluation Sequence Bypass
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`, `PHASE_2_CORRECTIONS.md`.
- **Exact Issue:** In `DJANGO_MODEL_SPECIFICATIONS.md`, `User.has_perm()` retrieved the user's module permission record before applying the Teacher Safety Ceiling. If an active teacher was assigned an errant or malicious permission record (e.g. `payments.can_view = True`), the function returned `True` before reaching the ceiling checks, creating a critical security bypass.
- **Required Correction:** Reorder the permission evaluation sequence:
  1. Check `is_authenticated`.
  2. Check `is_active` (`False` immediately returns `False`).
  3. Validate permission format and check against 14 authoritative modules and 7 action flags.
  4. Handle active superuser privileges (`is_superuser=True` returns `True`).
  5. **Apply Teacher Hard Safety Ceiling BEFORE database lookup**: Unconditional denial for financial modules (`fees`, `payments`, `income`, `expenses`) and administrative modules (`users`, `settings`, `certificates`). Prohibit student demographic modifications (`can_add`, `can_edit`, `can_delete`, `can_import`) and academic history deletion (`attendance`, `examinations`).
  6. Retrieve explicit `studently_user_permissions` record.
  7. Evaluate requested action flag.
  8. Deny access by default (`return False`).
- **Governance Status:** **CORRECTED**.
- **Evidence & Verification Status:** **VERIFIED** via architectural code tracing; **NOT VERIFIED** via live Django runtime test execution (deferred to Phase 3 unit test suite due to Phase 2 architecture freeze; no Django models or test harness executed).

---

### Finding HIGH-02: Admin RBAC Fail-Open Behavior & Implicit Wildcard Privileges
- **Severity:** **HIGH**
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`, `PHASE_2_CORRECTIONS.md`.
- **Exact Issue:** `User.has_perm()` contained an automatic fallback (`if self.role == 'ADMIN': return True`) and wrapped database lookup in `try...except Exception: pass`. This allowed database lookup errors to silently grant access and granted ADMIN users unrestricted access across all modules without explicit permission records, preventing the enforcement of specialized administrative profiles (such as Bursar/Accountant).
- **Required Correction:** Adopt a strict fail-closed permission architecture:
  1. Standard `ADMIN` users must have explicit `UserPermission` records provisioned; missing records strictly evaluate to `False` (default-deny).
  2. Database lookup exceptions must never fail open; they log an error and return `False`.
  3. Invalid module or action names return `False`.
  4. Active superusers (`is_superuser=True`) retain institutional override.
  5. Document a clear 5-tier evaluation model (Authentication, Role Eligibility, Module Permissions, Object Permissions, Ownership Restrictions).
  6. Specify DRF permission classes (`HasModulePermission`, `IsAssignedTeacherOrAdmin`), scoped querysets (`get_queryset()`), and explicit server-side ownership validations.
  7. Formally specify the ADMIN permission provisioning workflow.
- **Governance Status:** **CORRECTED**.
- **Evidence & Verification Status:** **VERIFIED** via architectural code tracing; **NOT VERIFIED** via live Django runtime test execution (deferred to Phase 3 unit test suite due to Phase 2 architecture freeze; no Django models or test harness executed).

---

### Finding HIGH-03: UUID CHAR(36) Documentation Inconsistency Across Data Dictionary & Migration Plan
- **Severity:** **HIGH**
- **Affected Documents:** `DATA_DICTIONARY.md`, `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`, `PHASE_2_CORRECTIONS.md`.
- **Exact Issue:** `DATA_DICTIONARY.md` contained 49 residual references to `CHAR(36)` across UUID PKs and FKs from Table 2.2 through Table 2.19, conflicting with Django ORM's native `char(32) NOT NULL` migration DDL. Additionally, `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` contained outdated text describing SQLite UUID storage as 36-character hyphenated TEXT and MySQL storage as `CHAR(36)`.
- **Required Correction:** Replace all 49 residual physical-storage occurrences with `CHAR(32)` for MySQL 8.0 and `TEXT` (`char(32)`) for SQLite in `DATA_DICTIONARY.md`. Update `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` to accurately document `char(32)` storage via `uuid_obj.hex`. Preserve legitimate references to 36-character API serialization (DRF RFC 4122 formatting) and `admission_number VARCHAR(36)`.
- **Governance Status:** **CORRECTED**.
- **Evidence & Verification Status:** **VERIFIED** via automated regex scanning across all Phase 2 documents confirming exactly 0 outdated physical storage references remaining.

---

### Finding MEDIUM-01: Database Index Inventory Accuracy & Physical Verification Status
- **Severity:** **MEDIUM**
- **Affected Documents:** `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`, `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`.
- **Exact Issue:** Previous documentation calculated 20 Primary Key indexes + 17 Unique indexes + 25 Explicit Application indexes + 32 ForeignKey indexes = 94 total physical indexes. However, this arithmetic sum overlooked index deduplication in MySQL InnoDB and SQLite. Specifically, composite indexes and composite unique constraints whose leftmost prefix is a foreign key already provide indexing for foreign key lookups, rendering duplicate single-column foreign key indexes redundant. Furthermore, claiming 94 "verified physical indexes" without having executed migrations or database introspection (`SHOW INDEX FROM ...`) is technically invalid.
- **Required Correction:**
  1. Re-architect the index inventory into three distinct tiers:
     - **Inventory A (Declared Application Indexes):** 25 explicit indexes (18 single-column `db_index=True` + 7 composite `Meta.indexes`).
     - **Inventory B (Database-Generated & Constraint Indexes):** 20 Primary Key + 17 Unique + 32 auto-generated ForeignKey indexes.
     - **Inventory C (Verified Physical Indexes):** Physical index structures created on disk by the database storage engine.
  2. Document the 13 concrete locations where leftmost column overlap occurs between composite indexes and single-column ForeignKey indexes.
  3. Analyze write amplification and storage trade-offs between SQLite and MySQL InnoDB.
  4. Formally designate physical database index count as **`NOT VERIFIED`** pending Phase 3 migration execution and schema introspection.
- **Governance Status:** **CORRECTED**.
- **Evidence & Verification Status:** **VERIFIED** for Inventory A (25 declared application indexes) and Inventory B; **NOT VERIFIED** for Inventory C (physical on-disk count requires live database migration execution).

---

### Finding MEDIUM-02 (Resolved via `MEDIUM-02-A` & `MEDIUM-02-B`): Durable Cash Idempotency & Payment Allocation Policy
- **Severity:** **MEDIUM**
- **Affected Documents:** `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DATABASE_ERD.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, and `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`.
- **Exact Issue:**
  1. **MEDIUM-02-A (Cash Idempotency):** Prior drafts contained conflicting cash reference formats (`CSH-<receipt_number>`, `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>`) and relied on a volatile 120-second Redis/Django cache for `X-Idempotency-Key`, allowing duplicate cash payments after cache expiry, eviction, restarts, or concurrent requests.
  2. **MEDIUM-02-B (Payment Allocation & Immutability Contradiction):** Prior drafts proposed `payment.invoice = new_invoice` for Option B and falsely claimed Option B required zero DDL changes, contradicting the immutable `StudentPayment` ledger and the absence of a `PaymentAllocation` table in the frozen 20-table schema.
- **Required Correction:**
  1. **MEDIUM-02-A:** Retired all conflicting cash reference formats and removed cache as a durability source of truth. Established ONE canonical persistent cash idempotency strategy: client supplies `Idempotency-Key`; server validates and deterministically derives `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` (46 chars for UUID; 74 chars SHA-256 hex for arbitrary keys) **before** duplicate lookup and insertion, persists it in `StudentPayment.transaction_ref`, and enforces durability via `UNIQUE(payment_method, transaction_ref)`. Added logical payload comparison (`200 OK` original receipt on match; `409 Conflict` on mismatch) and nested-savepoint `IntegrityError` race recovery without suppressing unrelated errors.
  2. **MEDIUM-02-B:** Formally adopted **Option A (Invoice Required for New Operational Payments)**. Clarified that `StudentPayment.invoice_id` remains DB-nullable strictly for historical Phase 1 legacy migration compatibility, while the operational API and `process_payment()` reject new payments without an invoice. Explicitly documented **Option B as NOT SUPPORTED under the current frozen 20-table schema** and provided a future ADR architectural blueprint (`PaymentAllocation` ledger table) without modifying the frozen 20-table schema.
- **Governance Status:** **DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED** (Option A formally adopted; canonical durable cash idempotency codified).
- **Evidence & Verification Status:** **VERIFIED** via cross-document architectural reconciliation; **RUNTIME IMPLEMENTATION NOT YET TESTED** (deferred to Phase 3).

---

### Finding MEDIUM-03: Database Credentials Sanitization, Account Segregation & Trigger Boundaries
- **Severity:** **MEDIUM**
- **Affected Documents:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`.
- **Exact Issue:** Migration scripts contained hardcoded mock passwords (`StrongAppPassword2026!`, etc.) which could be inadvertently deployed to staging or production. Additionally, the backup user had excessive global privileges, secret management patterns were missing, and the security boundaries of MySQL ledger triggers against DBA roles were undocumented.
- **Required Correction:**
  1. Sanitize all mock credentials across `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`, replacing them with standardized placeholders (`<RUNTIME_PASSWORD>`, `<MIGRATOR_PASSWORD>`, `<BACKUP_PASSWORD>`, `<APP_HOST>`, `<MIGRATOR_HOST>`, `<BACKUP_HOST>`).
  2. Document environment variable / secrets manager injection patterns (`STUDENTLY_DB_PASSWORD`, AWS Secrets Manager, HashiCorp Vault, systemd unit environment files).
  3. Scope `studently_backup` privileges strictly to `studently_db.*` rather than global scopes.
  4. Formally document database trigger security boundaries: explain that while `BEFORE UPDATE` and `BEFORE DELETE` triggers prevent application runtime tampering, they do not prevent root DBA (`SUPER` / `SYSTEM_USER`) bypass, establishing the necessity of private VPC network isolation, DBA credential segregation, and external audit logging.
- **Governance Status:** **CORRECTED**.
- **Evidence & Verification Status:** **VERIFIED** across `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` with zero cleartext credentials remaining.

---

### Finding CONC-01 (Defect A): Missing Post-Invoice-Lock Duplicate Lookup Before Balance Validation
- **Severity:** **HIGH** (Payment Idempotency Concurrency Defect)
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DATABASE_ARCHITECTURE.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md` (superseded note), `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`.
- **Exact Issue:** The prior `process_payment()` specification performed a single duplicate lookup before acquiring `StudentInvoice.objects.select_for_update()`. A concurrent retry using the same `Idempotency-Key` could miss the first request's uncommitted payment, block on the invoice lock, acquire the lock after the first request committed a full payment, observe `remaining_balance == 0`, and raise a payment `ValidationError` instead of returning the original payment and receipt.
- **Required Correction:** Insert a mandatory **second duplicate lookup** immediately after acquiring `StudentInvoice.objects.select_for_update()` and validating invoice ownership, and strictly **before** calculating or validating the outstanding balance. Execute this second lookup via a **current/locking read** (`StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`) so MySQL InnoDB `REPEATABLE READ` observes concurrently committed rows. Document SQLite's non-row-locking behavior accurately without claiming MySQL equivalence.
- **Governance Status:** **DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED**.
- **Evidence & Verification Status:** **VERIFIED** across all active specifications; **RUNTIME IMPLEMENTATION & CONCURRENCY TESTS NOT YET EXECUTED** (Tests A–F specified for Phase 3 MySQL staging).

---

### Finding CONC-02 (Defect B): Unreliable Snapshot SELECT in MySQL `REPEATABLE READ` Race Recovery
- **Severity:** **HIGH** (Payment Idempotency Concurrency Defect)
- **Affected Documents:** `DJANGO_MODEL_SPECIFICATIONS.md`, `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DATABASE_ARCHITECTURE.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_CORRECTIONS.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md` (superseded note), `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`.
- **Exact Issue:** Inside the `except IntegrityError` block of `process_payment()`, race recovery previously executed an ordinary non-locking query (`StudentPayment.objects.filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`). Under MySQL InnoDB's default `REPEATABLE READ` isolation, an ordinary `SELECT` is a consistent snapshot read that may use the transaction's earlier MVCC read view and fail to observe the winning payment committed concurrently by another transaction.
- **Required Correction:** Preserve MySQL InnoDB's default `REPEATABLE READ` isolation level; isolate `payment.save()` in an inner `transaction.atomic()` savepoint; catch `IntegrityError` outside the failed savepoint; confirm the exception corresponds specifically to `UNIQUE(payment_method, transaction_ref)`; perform a **current/locking read** (`StudentPayment.objects.select_for_update().filter(...).first()`) to bypass the MVCC snapshot and retrieve the committed winning row; compare canonical logical payloads (`HTTP 200 OK` on match, `IdempotencyConflictError` / `HTTP 409 Conflict` on mismatch); and re-raise the original `IntegrityError` if no matching row exists or if the exception is unrelated. Document SQLite's file-level locking limitations accurately.
- **Governance Status:** **DOCUMENTATION CORRECTED / ARCHITECTURE SPECIFIED**.
- **Evidence & Verification Status:** **VERIFIED** across all active specifications; **RUNTIME IMPLEMENTATION & CONCURRENCY TESTS NOT YET EXECUTED** (Tests A–F specified for Phase 3 MySQL staging).

---

## 4. Master Verified Schema Inventory

```
====================================================================================================
STUDENTLY PHASE 2 DATABASE SCHEMA — FINAL VERIFIED TOTALS
====================================================================================================
1. Master Physical Application Tables:    20 Tables (19 Relational Domain + 1 Singleton Settings)
2. Foreign Key Relationships:             32 ForeignKeys (31 Cross-Table FKs + 1 Self-Referential FK)
3. Database Column Mappings:              32 Explicit db_column Declarations (100% Alignment)
4. Database CHECK Constraints:            35 Explicit models.CheckConstraint Declarations
5. Unique Constraints:                    17 Unique Constraints (6 Single-Column + 11 Composite)
6. Primary Key Indexes:                   20 Primary Key Indexes (19 UUID + 1 Integer Singleton)
7. Unique Constraint Indexes:             17 Unique Constraint B-Tree Indexes
8. Explicit Application Indexes:          25 Application B-Tree Indexes (18 db_index + 7 Meta.indexes)
9. Auto-Generated ForeignKey Indexes:     32 Single-Column Indexes (Managed natively by Django ORM)
----------------------------------------------------------------------------------------------------
TOTAL DECLARED APPLICATION INDEXES:       25 Explicit B-Tree Indexes (18 db_index + 7 Meta.indexes)
TOTAL DECLARED/GENERATED INDEX REFS:      94 Potential Index References (Prior to DB Deduplication)
PHYSICAL DATABASE INDEXES ON DISK:        NOT VERIFIED (Requires migration execution & SHOW INDEX)
====================================================================================================
```

---

## 5. Master CHECK Constraint Matrix (All 35 Verified SQL Constraints)

| # | Target Physical Table | Constraint Name | SQL Check Expression | Django Model | Enforcement Scope |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `studently_users` | `chk_user_role` | `role IN ('ADMIN', 'TEACHER')` | `User` | Authentication role boundary. |
| **2** | `studently_users` | `chk_user_status` | `status IN ('Active', 'Deactivated')` | `User` | Account active state. |
| **3** | `studently_user_permissions` | `chk_perm_module` | `module IN ('students', 'attendance', 'examinations', 'reports', 'fees', 'payments', 'income', 'expenses', 'teachers', 'classes', 'subjects', 'users', 'certificates', 'settings')` | `UserPermission` | Valid 14 module keys. |
| **4** | `studently_teachers` | `chk_teacher_account_status` | `account_status IN ('Active', 'Deactivated')` | `Teacher` | Faculty employment status. |
| **5** | `studently_classes` | `chk_class_capacity` | `capacity > 0` | `Classroom` | Classroom capacity lower bound. |
| **6** | `studently_subjects` | `chk_subject_max_marks` | `max_marks > 0` | `Subject` | Max exam score lower bound. |
| **7** | `studently_students` | `chk_student_gender` | `gender IN ('Male', 'Female')` | `Student` | Demographic gender values. |
| **8** | `studently_students` | `chk_student_status` | `status IN ('Active', 'Withdrawn', 'Graduated', 'Suspended')` | `Student` | Student lifecycle states. |
| **9** | `studently_attendance` | `chk_attendance_status` | `status IN ('Present', 'Absent', 'Excused')` | `AttendanceRecord` | Roll call status choices. |
| **10** | `studently_examinations` | `chk_exam_type` | `exam_type IN ('Midterm', 'Final')` | `Examination` | Exam session category. |
| **11** | `studently_examinations` | `chk_exam_term` | `term IN ('Term 1', 'Term 2', 'Term 3')` | `Examination` | Academic calendar term. |
| **12** | `studently_examination_student_summaries` | `chk_activity_positive` | `activity_score >= 0.00 OR activity_score IS NULL` | `ExaminationStudentSummary` | Non-negative activity score. |
| **13** | `studently_examination_student_summaries` | `chk_total_positive` | `total_score >= 0.00` | `ExaminationStudentSummary` | Non-negative session total. |
| **14** | `studently_examination_marks`| `chk_mark_score_positive` | `score >= 0.00` | `ExaminationMark` | Non-negative subject grade. |
| **15** | `studently_fee_structures` | `chk_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | `FeeStructure` | Billing rate categories. |
| **16** | `studently_fee_structures` | `chk_fee_billing_frequency` | `billing_frequency IN ('Monthly', 'Termly', 'Annually', 'One-Time')` | `FeeStructure` | Billing cycle schedule. |
| **17** | `studently_fee_structures` | `chk_fee_default_amount` | `default_amount >= 0.00` | `FeeStructure` | Non-negative fee default rate. |
| **18** | `studently_student_invoices` | `chk_invoice_amounts` | `total_amount_due >= 0.00 AND total_amount_paid >= 0.00` | `StudentInvoice` | Non-negative invoice balances. |
| **19** | `studently_student_invoices` | `chk_invoice_status` | `status IN ('Unpaid', 'Partially Paid', 'Paid', 'Cancelled')` | `StudentInvoice` | Invoice lifecycle state enum. |
| **20** | `studently_invoice_items` | `chk_invoice_item_amount` | `amount >= 0.00` | `InvoiceItem` | Non-negative line-item amount. |
| **21** | `studently_student_payments` | `chk_payment_amount_positive` | `amount_paid > 0.00` | `StudentPayment` | Strictly positive voucher magnitude. |
| **22** | `studently_student_payments` | `chk_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | `StudentPayment` | Supported remittance channels. |
| **23** | `studently_student_payments` | `chk_payment_transaction_type` | `transaction_type IN ('Payment', 'Reversal', 'Refund')` | `StudentPayment` | Ledger direction/voucher type. |
| **24** | `studently_student_payments` | `chk_payment_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | `StudentPayment` | Target fee classification. |
| **25** | `studently_student_payments` | `chk_payment_reversal_state` | `((transaction_type = 'Payment' AND is_reversal = 0 AND reversed_payment_id IS NULL) OR (transaction_type = 'Reversal' AND is_reversal = 1 AND reversed_payment_id IS NOT NULL) OR (transaction_type = 'Refund' AND is_reversal = 0 AND reversed_payment_id IS NOT NULL))` | `StudentPayment` | Ledger transaction state mutex. |
| **26** | `studently_incomes` | `chk_income_amount` | `amount >= 0.00` | `Income` | Non-negative revenue inflow. |
| **27** | `studently_incomes` | `chk_income_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | `Income` | Inflow payment channel. |
| **28** | `studently_expenses` | `chk_expense_amount` | `amount >= 0.00` | `Expense` | Non-negative disbursement. |
| **29** | `studently_expenses` | `chk_expense_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | `Expense` | Outflow payment channel. |
| **30** | `studently_system_settings` | `chk_settings_singleton_id` | `id = 1` | `SystemSetting` | Enforces single-row singleton. |
| **31** | `studently_system_settings` | `chk_settings_calc_method` | `result_calc_method IN ('sum', 'average', 'weighted')` | `SystemSetting` | Approved ranking formulas. |
| **32** | `studently_system_settings` | `chk_settings_term` | `current_term IN ('Term 1', 'Term 2', 'Term 3')` | `SystemSetting` | Active academic term. |
| **33** | `studently_system_settings` | `chk_settings_fees_positive` | `class_fee_monthly >= 0.00 AND school_fee_monthly >= 0.00` | `SystemSetting` | Non-negative monthly rates. |
| **34** | `studently_system_settings` | `chk_weights_range` | `weighted_midterm BETWEEN 0 AND 100 AND weighted_final BETWEEN 0 AND 100` | `SystemSetting` | Percentage bounds (`0..100`). |
| **35** | `studently_system_settings` | `chk_weights_sum` | `result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100)` | `SystemSetting` | Intra-row 100% sum rule. |

---

## 6. Master Index Inventory (25 Explicit Application Indexes)

### Single-Column Application B-Tree Indexes (18 Indexes via `db_index=True`)
1. `studently_users.role` (`idx_users_role`)
2. `studently_users.status` (`idx_users_status`)
3. `studently_classes.academic_year` (`idx_classes_academic_year`)
4. `studently_students.full_name` (`idx_students_full_name`)
5. `studently_students.parent_phone` (`idx_students_parent_phone`)
6. `studently_students.status` (`idx_students_status`)
7. `studently_promotions.academic_year` (`idx_promotions_year`)
8. `studently_attendance.date` (`idx_attendance_date`)
9. `studently_examinations.academic_year` (`idx_examinations_year`)
10. `studently_student_invoices.month` (`idx_invoices_month`)
11. `studently_student_invoices.status` (`idx_invoices_status`)
12. `studently_student_payments.month` (`idx_payments_month`)
13. `studently_student_payments.payment_date` (`idx_payments_payment_date`)
14. `studently_student_payments.transaction_type` (`idx_payments_type`)
15. `studently_incomes.category` (`idx_incomes_category`)
16. `studently_incomes.date` (`idx_incomes_date`)
17. `studently_expenses.category` (`idx_expenses_category`)
18. `studently_expenses.date` (`idx_expenses_date`)

### Composite Multi-Column Application B-Tree Indexes (7 Indexes via `class Meta.indexes`)
1. `idx_student_class_status` on `studently_students(class_id, status)`
2. `idx_attendance_class_date` on `studently_attendance(class_id, date)`
3. `idx_exam_class_year` on `studently_examinations(class_id, academic_year)`
4. `idx_marks_exam_subject` on `studently_examination_marks(examination_id, subject_id)`
5. `idx_invoice_student_status` on `studently_student_invoices(student_id, status)`
6. `idx_payment_student_date` on `studently_student_payments(student_id, payment_date)`
7. `idx_income_cat_date` on `studently_incomes(category, date)`

---

## 7. Remaining Unresolved Business Decisions

The following items are business-policy decisions that do not block Phase 2 approval, but must be formally decided by school leadership prior to finalizing Phase 3 frontend-backend integration:

1. **Tuition Discount & Scholarship Policy:**
   - *Current Design:* `StudentInvoice.discount_amount` defaults to `0.00` and line-item fees calculate net due.
   - *Open Decision:* Will the school implement percentage-based scholarships (e.g. 50% staff discount) or flat-rate manual credits?
   - *Technical Impact:* Both models are supported by the `InvoiceItem` architecture without schema changes.

2. **Electronic Voucher Re-submission Window:**
   - *Current Design:* `UNIQUE (payment_method, transaction_ref)` permanently prohibits re-using a mobile money transaction reference (e.g. `ZAAD-884129`).
   - *Open Decision:* If a parent accidentally submits a voucher for Student A that belongs to Student B, should administrators have a privileged workflow to re-assign the reference after voiding?
   - *Technical Recommendation:* Prohibit re-use; require a documented correction voucher citing the administrative reason.

3. **Academic Year Archival Strategy:**
   - *Current Design:* Scoped by string codes (`academic_year = '2026-2027'`) with `RESTRICT` deletion rules on historical records.
   - *Open Decision:* Should historical academic years be partitioned into cold storage after 5 years, or remain in active MySQL InnoDB tables?
   - *Technical Recommendation:* Maintain in active tables for the first 100,000 records; evaluate table partitioning in Phase 5.

*(Note on Payment Allocation Policy: Previously listed as Item 4 pending business decision. **RESOLVED under `MEDIUM-02-B`:** **Option A — Invoice Required for New Operational Payments** is formally adopted to preserve the frozen 20-table schema and immutable ledger. Option B is explicitly **NOT SUPPORTED** under the current frozen 20-table schema and would require a future formal ADR adding a `PaymentAllocation` ledger table.)*

---

## 8. Final Audit Acceptance Evaluation & Recommendation

### Acceptance Criteria Verification

| Acceptance Criterion | Verification Finding | Compliance Status |
| :--- | :--- | :---: |
| **All 19 Documents Inspected** | Every Phase 2 Markdown document individually read, analyzed, and cross-checked on disk, including `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`. | **MET** |
| **Canonical Table Inventory** | Exactly 20 physical application tables verified across all files (no new table added). | **MET** |
| **Foreign Key Inventory** | Exactly 32 ForeignKeys (31 cross-table + 1 self-referential) verified with `db_column`. | **MET** |
| **CHECK Constraint Inventory** | Exactly 35 explicit `models.CheckConstraint` declarations verified. | **MET** |
| **Unique Constraints & Indexes** | 17 unique constraints and 25 explicit application indexes verified; physical index count classified as `NOT VERIFIED` pending Phase 3 introspection. | **MET** |
| **Django Models Match Architecture** | 100% synchronization between Django models, Data Dictionary, and ERD across all 14 modules. | **MET** |
| **Payment Allocation, Durable Cash Idempotency & Concurrency Recovery** | Option A formally adopted; Option B excluded under frozen 20-table schema; canonical `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` durable idempotency (global per method); post-invoice-lock current-read duplicate lookup (`CONC-01`); MySQL `REPEATABLE READ` current-read savepoint race recovery (`CONC-02`); SQLite limitations & Phase 3 Tests A–F specified. | **MET** |
| **Authentication & Fail-Closed RBAC Hardened** | Inactive check, superuser policy, Teacher Hard Safety Ceiling reordered before DB lookup (HIGH-01), fail-closed ADMIN RBAC (HIGH-02), and DRF object scoping verified. | **MET** |
| **Least-Privilege DB Security** | Dedicated `studently_app`, `studently_migrator`, `studently_backup` accounts + SQL triggers + sanitized credential placeholders. | **MET** |
| **UUID Storage Semantics Accurate**| Django ORM `char(32)` across SQLite and MySQL, 49 residual `CHAR(36)` references eliminated from Data Dictionary (HIGH-03), 36-char DRF serialization verified. | **MET** |
| **User Roles Standardized** | Strictly `'ADMIN'` & `'TEACHER'`, Accountant profile defined, Superuser standardized. | **MET** |
| **Zero Unresolved Critical / High / Medium Issues** | All findings (AUD-01 to AUD-14, HIGH-01 to HIGH-03, MEDIUM-01 to MEDIUM-03 incl. MEDIUM-02-A/B, and CONC-01/CONC-02) resolved in documentation; physical index count accurately classified as `NOT VERIFIED`; live runtime implementation and concurrency tests deferred to Phase 3. | **MET** |
| **Zero Implementation in Phase 2** | No application source code modified; no models, serializers, or migrations created in code. | **MET** |

### Final Recommendation

**STATUS: CONDITIONALLY APPROVED — AWAITING INDEPENDENT EXTERNAL RE-VALIDATION**

All technical, relational, mathematical, concurrency, and architectural requirements for Phase 2 have been corrected and reconciled across all **19 Phase 2 Markdown documents**. No self-certification is claimed; runtime implementation and automated concurrency tests (Tests A–F) remain deferred to Phase 3.

**Next Immediate Step:** Submit the corrected architecture package (`STUDENTLY_PHASE_2_CONCURRENCY_CORRECTED.zip`) and `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md` for a fresh independent external re-validation before Phase 3 implementation begins.
