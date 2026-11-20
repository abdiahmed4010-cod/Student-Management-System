# STUDENTLY — Phase 2 Technical Corrections & Architectural Amendments
**Document:** `PHASE_2_CORRECTIONS.md`  
**Phase:** Phase 2 — Database Architecture & Design Final Validation  
**Role:** Principal Database Architect & Django ORM Specialist  
**Date:** November 2026  
**Status:** Approved Technical Corrections Applied  

---

## 1. Overview of Corrections

Following the final technical audit of Phase 2, seven architectural amendments and precision corrections have been formulated. These corrections eliminate ambiguities, harden security, and ensure seamless execution during Phase 3 implementation.

---

## 2. Itemized Technical Amendments

### Amendment 1: Table Count Reconciliation (19 vs. 20)
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md`, `DATABASE_ERD.md`, `DATA_DICTIONARY.md`.
- **Text Adjustment:**
  All instances referring ambiguously to "19 tables" or "20 entities" are standardized as follows:
  > **Definitive Schema Count:** Exactly **20 database tables**, comprising:
  > - **19 Relational Domain Entities** linked via relational foreign key networks.
  > - **1 Singleton System Configuration Entity** (`studently_system_settings`) with zero incoming foreign keys and enforced `CHECK (id = 1)`.

---

### Amendment 2: Production Engine Version — Mandatory MySQL 8.0.16+
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`.
- **Reason:** In MySQL versions prior to 8.0.16, the engine parsed `CHECK` constraints syntactically but did **not** enforce them.
- **Specification Text Updated:**
  > **Production Database Specification:** Minimum required version is **MySQL 8.0.16+** (Recommended: **MySQL 8.0.30+** or **MySQL 8.4 LTS**).
  > This ensures that all 35 SQL `CHECK` constraints (positive balance checks, gender choices, status enums, and score boundaries) are strictly enforced at the storage engine level.

---

### Amendment 3: Security Scope of UUIDs (Authorization & Anti-Scraping Clarification)
- **Correction Applied In:** `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 2`, `DATABASE_ARCHITECTURE.md#Section 1.3`.
- **Security Erratum Corrected:**
  All erroneous statements claiming that UUIDs "prevent automated scraping" have been removed.
  > **Authoritative Security Policy:**
  > UUID primary keys are opaque, non-sequential identifiers that eliminate predictable enumeration attacks (e.g. iterating `/api/v1/students/1`, `/2`, `/3`).
  > **UUIDs do NOT constitute an authorization mechanism and do not prevent automated scraping.**
  > Direct access to endpoints must be protected strictly via server-side security controls:
  > 1. Cryptographic token verification via SimpleJWT.
  > 2. Object-level authorization via Django REST Framework permissions (`HasModulePermission`, `IsAdminOrAssignedTeacher`).
  > 3. Scoped QuerySets (`Student.objects.for_teacher(request.user)`).
  > 4. IP- and user-based throttling (e.g. DRF `AnonRateThrottle`, `UserRateThrottle`).
  > 5. Comprehensive server-side access audit logging.

---

### Amendment 4: Engine-Specific Locking Disparity (SQLite vs. MySQL)
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 5`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 7`.
- **Technical Clarification Added:**
  > **Concurrency & Locking Disparity:**
  > - **MySQL 8.0.16+ (InnoDB):** `select_for_update()` achieves true **row-level exclusive locking**, enabling high-throughput concurrent payment processing on separate invoices.
  > - **SQLite (v3.35+):** SQLite does not support row-level locks. Write transactions acquire a database-wide file lock (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE`). Under SQLite, `select_for_update()` evaluates without error but serializes all writes across the entire database file.
  > - **Testing Mandate:** Multi-user concurrency testing, payment gateway webhooks, and multi-teacher concurrent grade entry must be validated against MySQL 8.0.16+ in staging prior to production deployment.

---

### Amendment 5: Immutable Positive-Amount Payment Correction, Reversal & Refund Architecture
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 3.8`, `DATA_DICTIONARY.md#Table 2.17`, `DJANGO_MODEL_SPECIFICATIONS.md#StudentPayment`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 5 & 7`.
- **Conflict Resolved:**
  An earlier architectural draft proposed storing negative amounts (`amount_paid = -amount`) for payment reversals. This directly conflicted with the positive balance constraint `CHECK (amount_paid > 0.00)`.
- **Authoritative Resolution:**
  All monetary records in `studently_student_payments` are **strictly positive** (`CHECK (amount_paid > 0.00)`). Transaction direction and accounting purpose are governed by `transaction_type`:
  - `Payment`: Standard tuition inflow. Increases invoice `total_amount_paid`.
  - `Reversal`: Offsetting void entry for bounced cheques or erroneous entries. Requires `reversed_payment_id` and mandatory `reversal_reason`. Decrements invoice `total_amount_paid`.
  - `Refund`: Formal student cash payout voucher for overpayments or withdrawals. Requires `reversed_payment_id` and mandatory `reversal_reason`. Decrements invoice `total_amount_paid`.
  Both original and correction records remain permanently immutable in the ledger.

```python
# Authoritative Reversal & Refund Execution Protocol
@transaction.atomic
def execute_payment_reversal_or_refund(original_payment, user, reason, transaction_type='Reversal'):
    invoice = StudentInvoice.objects.select_for_update().get(id=original_payment.invoice_id)
    
    if original_payment.reversal_transactions.exists():
        raise ValidationError("Payment voucher has already been reversed or refunded.")
    
    prefix = "REV" if transaction_type == 'Reversal' else "REF"
    reversal = StudentPayment.objects.create(
        receipt_number=f"{prefix}-{original_payment.receipt_number}",
        invoice=invoice,
        student=original_payment.student,
        fee_category=original_payment.fee_category,
        month=original_payment.month,
        amount_due=invoice.total_amount_due,
        amount_paid=original_payment.amount_paid,  # Strictly positive, matching original amount
        payment_method=original_payment.payment_method,
        transaction_ref=f"{prefix}-{original_payment.transaction_ref}",
        recorded_by=user,
        transaction_type=transaction_type,  # 'Reversal' or 'Refund'
        is_reversal=True,
        reversed_payment=original_payment,
        reversal_reason=reason
    )
    
    # Decrement invoice paid sum atomically and re-evaluate status
    invoice.total_amount_paid = max(Decimal('0.00'), invoice.total_amount_paid - original_payment.amount_paid)
    invoice.reconcile_status()
    invoice.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
    return reversal
```

---

### Amendment 6: Duplicate Payment Prevention on Mobile Money Gateways
- **Correction Applied In:** `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 4`, `DJANGO_MODEL_SPECIFICATIONS.md#StudentPayment`.
- **Constraint Added:**
  To prevent duplicate submissions of external electronic vouchers (such as ZAAD and eDahab mobile money references), a composite unique constraint is enforced on `(payment_method, transaction_ref)`:
  ```python
  models.UniqueConstraint(
      fields=['payment_method', 'transaction_ref'],
      name='unique_payment_method_transaction_ref'
  )
  ```
  *(Superseded Historical Note: Early draft referenced `CSH-REC-XXXX`; superseded by Amendment 35 establishing the canonical durable format `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` derived from client `Idempotency-Key` BEFORE duplicate checking and insertion).*

---

### Amendment 7: Explicit Foreign Key Database Column Name Alignment
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`.
- **Alignment:** Added explicit `db_column` parameters to Django ForeignKey definitions so that the generated database schema perfectly matches `DATA_DICTIONARY.md` across both SQLite and MySQL:
  - `Classroom.teacher`: `db_column='teacher_id'`
  - `Subject.classroom`: `db_column='class_id'`
  - `Student.classroom`: `db_column='class_id'`
  - `AttendanceRecord.classroom`: `db_column='class_id'`, `AttendanceRecord.teacher`: `db_column='teacher_id'`
  - `Examination.classroom`: `db_column='class_id'`
  - `ExaminationMark.recorded_by`: `db_column='recorded_by_teacher_id'`
  - `PromotionHistory.promoted_by`: `db_column='promoted_by_user_id'`
  - `StudentPayment.recorded_by`: `db_column='recorded_by_user_id'`
  - `Income.recorded_by`: `db_column='recorded_by_user_id'`
  - `Expense.recorded_by`: `db_column='recorded_by_user_id'`

---

### Amendment 8: Weighted Ranking Percentage Intra-Row SQL Check Constraint
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 3.6`, `DATA_DICTIONARY.md#Table 2.20`, `DJANGO_MODEL_SPECIFICATIONS.md#SystemSetting`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 5`.
- **Analysis:** `weighted_midterm` and `weighted_final` reside within the **same single row** in `studently_system_settings`.
- **Constraint Enforced:**
  ```sql
  CHECK (result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100))
  ```
  This is a 100% valid intra-row SQL expression supported natively in both SQLite 3.35+ and MySQL 8.0.16+, augmented by model-level validation in `SystemSetting.clean()` and DRF serializer validation.

---

### Amendment 9: Authoritative Teacher Co-Teaching & Homeroom Hierarchy
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 3.3`, `DATABASE_ERD.md#Section 1 & 3`, `DJANGO_MODEL_SPECIFICATIONS.md#Classroom`.
- **Clarification:** `Classroom.teacher` (`teacher_id`) is strictly designated as the **homeroom teacher** (single administrative and pastoral head, `ON DELETE SET NULL`). Subject instruction and multiple co-teachers assigned to the same class cohort are governed without restriction by `studently_teacher_class_assignments` (N:M) and `studently_teacher_subject_assignments` (N:M).

---

### Amendment 10: Strict Preservation of Phase 1 Student Seven-Field Contract
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 3.4`, `DATA_DICTIONARY.md#Table 2.8`, `DJANGO_MODEL_SPECIFICATIONS.md#Student`.
- **Contract Verified:** The exact seven registration fields from Phase 1 are 100% preserved:
  1. `admission_number`
  2. `full_name`
  3. `gender`
  4. `date_of_birth`
  5. `parent_phone`
  6. `class_id`
  7. `registration_date`
  The `status` field (`Active`, `Withdrawn`, `Graduated`, `Suspended`) is an architectural lifecycle extension required for soft deletion and academic progression, not an extra client registration input field.

---

### Amendment 11: Exhaustive Foreign Key `db_column` Alignment
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`.
- **Audit Requirement:** Explicitly declare `db_column` on every ForeignKey in the entire model suite where Django's default (`<field>_id`) would differ from `DATA_DICTIONARY.md` or to guarantee deterministic SQL DDL across both SQLite and MySQL:
  1. `User.teacher`: `db_column='teacher_id'`
  2. `UserPermission.user`: `db_column='user_id'`
  3. `Classroom.teacher`: `db_column='teacher_id'`
  4. `Subject.classroom`: `db_column='class_id'` *(preventing default `classroom_id`)*
  5. `TeacherClassAssignment.teacher`: `db_column='teacher_id'`
  6. `TeacherClassAssignment.classroom`: `db_column='class_id'` *(preventing default `classroom_id`)*
  7. `TeacherSubjectAssignment.teacher`: `db_column='teacher_id'`
  8. `TeacherSubjectAssignment.subject`: `db_column='subject_id'`
  9. `Student.classroom`: `db_column='class_id'` *(preventing default `classroom_id`)*
  10. `PromotionHistory.student`: `db_column='student_id'`
  11. `PromotionHistory.previous_classroom`: `db_column='previous_class_id'` *(preventing default `previous_classroom_id`)*
  12. `PromotionHistory.new_classroom`: `db_column='new_class_id'` *(preventing default `new_classroom_id`)*
  13. `PromotionHistory.promoted_by`: `db_column='promoted_by_user_id'` *(preventing default `promoted_by_id`)*
  14. `AttendanceRecord.student`: `db_column='student_id'`
  15. `AttendanceRecord.classroom`: `db_column='class_id'` *(preventing default `classroom_id`)*
  16. `AttendanceRecord.teacher`: `db_column='teacher_id'`
  17. `Examination.classroom`: `db_column='class_id'` *(preventing default `classroom_id`)*
  18. `ExaminationStudentSummary.examination`: `db_column='examination_id'`
  19. `ExaminationStudentSummary.student`: `db_column='student_id'`
  20. `ExaminationMark.examination`: `db_column='examination_id'`
  21. `ExaminationMark.student`: `db_column='student_id'`
  22. `ExaminationMark.subject`: `db_column='subject_id'`
  23. `ExaminationMark.recorded_by`: `db_column='recorded_by_teacher_id'` *(preventing default `recorded_by_id`)*
  24. `StudentInvoice.student`: `db_column='student_id'`
  25. `InvoiceItem.invoice`: `db_column='invoice_id'`
  26. `InvoiceItem.fee_structure`: `db_column='fee_structure_id'`
  27. `StudentPayment.invoice`: `db_column='invoice_id'`
  28. `StudentPayment.student`: `db_column='student_id'`
  29. `StudentPayment.recorded_by`: `db_column='recorded_by_user_id'` *(preventing default `recorded_by_id`)*
  30. `StudentPayment.reversed_payment`: `db_column='reversed_payment_id'`
  31. `Income.recorded_by`: `db_column='recorded_by_user_id'` *(preventing default `recorded_by_id`)*
  32. `Expense.recorded_by`: `db_column='recorded_by_user_id'` *(preventing default `recorded_by_id`)*

---

### Amendment 12: Reconciled 31 Explicit Database CHECK Constraints
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 5`, `DATA_DICTIONARY.md`.
- **Audit Reconciliation:** Django `choices` and `validators` do not produce SQL database-level `CHECK` constraints. All 31 domain rules are now explicitly declared using `models.CheckConstraint` in `class Meta.constraints`:
  1. `chk_user_role`
  2. `chk_user_status`
  3. `chk_teacher_account_status`
  4. `chk_class_capacity` (`capacity > 0`)
  5. `chk_subject_max_marks` (`max_marks > 0`)
  6. `chk_student_gender`
  7. `chk_student_status`
  8. `chk_attendance_status`
  9. `chk_exam_type`
  10. `chk_exam_term`
  11. `chk_activity_positive`
  12. `chk_total_positive`
  13. `chk_mark_score_positive`
  14. `chk_fee_category`
  15. `chk_fee_default_amount`
  16. `chk_invoice_amounts`
  17. `chk_invoice_status`
  18. `chk_invoice_item_amount`
  19. `chk_payment_amount_positive`
  20. `chk_payment_method`
  21. `chk_payment_transaction_type`
  22. `chk_income_amount`
  23. `chk_income_payment_method`
  24. `chk_expense_amount`
  25. `chk_expense_payment_method`
  26. `chk_settings_singleton_id`
  27. `chk_settings_calc_method`
  28. `chk_settings_term`
  29. `chk_settings_fees_positive`
  30. `chk_weights_range`
  31. `chk_weights_sum`

---

### Amendment 13: Authoritative Database Index Recount & Categorization
- **Correction Applied In:** `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 6`, `PHASE_2_FINAL_REVIEW.md#Item 10`.
- **Reconciliation:** Eliminated ambiguous index counts. The physical database indexes are strictly categorized as:
  - **20 Primary Key Indexes:** Automatically created on `id` across all 20 tables.
  - **17 Unique Constraint Indexes:** 6 single-column unique indexes + 11 composite unique indexes.
  - **25 Explicit Application B-Tree Indexes:**
    * 17 single-column indexes via `db_index=True`.
    * 7 composite multi-column indexes declared in `class Meta.indexes`.
  - Additional single-column B-Tree indexes automatically generated on ForeignKeys by Django ORM.

---

### Amendment 14: Payment Ledger Integrity & Atomic Service Layer
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md#Section 3.8`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 7`.
- **Policy Formally Codified:**
  - **Reversals:** 100% full reversal. Reversal amount matches original payment exactly. Partial reversals prohibited. Can be reversed at most once.
  - **Refunds:** Support full and sequential partial refunds. Maximum refundable ceiling is enforced:
    $$\sum \text{Refunds} \le \text{original\_payment.amount\_paid} - (\text{Reversals})$$
  - **Nullable Invoices:** Standalone payments (`invoice_id = NULL`) can be reversed/refunded without invoice balance adjustments. Invoiced payments trigger atomic invoice recomputation.
  - **Cancelled Invoices:** Cancelled invoices are strictly immutable.
  - **Model Validation Execution:** Because Django `.save()` and `.create()` bypass `full_clean()`, `StudentPayment.save()` explicitly calls `self.full_clean()`, and all transactions execute through atomic service functions (`process_payment`, `reverse_payment`, `refund_payment`) in `apps.finances.services`.

---

### Amendment 15: Production MySQL 8.0.16+ Configuration & Concurrency Fix
- **Correction Applied In:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`.
- **Fixes Applied:**
  - Consistently set production minimum to **MySQL 8.0.16+**.
  - Removed unsupported `NO_AUTO_CREATE_USER` from MySQL connection `sql_mode`.
  - Corrected `select_for_update()` explanation: SQLite drops `FOR UPDATE` and serializes writes at the file level; MySQL 8.0.16+ InnoDB executes true row-level index locking (`SELECT ... FOR UPDATE`).

---

### Amendment 16: Application Tables vs. Django Built-in Tables & PermissionsMixin
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 2.1`, `DATABASE_ERD.md#Section 1`.
- **Determination:**
  - The 20 tables belong strictly to the **STUDENTLY application domain**.
  - Framework tables (`django_migrations`, `django_content_type`, `django_session`) are managed by Django core apps.
  - Standard `PermissionsMixin` creates 3 redundant group/permission tables. The system relies on custom module permissions (`studently_user_permissions`), keeping the application domain clean while delegating standard admin privileges via `is_staff` and `is_superuser`.

---

### Amendment 17: Authoritative 20-Table Canonical Naming & Entity Roles
- **Correction Applied In:** All 11 Phase 2 Documents & Consistency Matrix.
- **Resolution:**
  - Standardized exact physical table names across all documents: `studently_users`, `studently_user_permissions`, `studently_teachers`, `studently_classes`, `studently_subjects`, `studently_teacher_class_assignments`, `studently_teacher_subject_assignments`, `studently_students`, `studently_attendance`, `studently_examinations`, `studently_examination_student_summaries`, `studently_examination_marks`, `studently_promotions`, `studently_fee_structures`, `studently_student_invoices`, `studently_invoice_items`, `studently_student_payments`, `studently_incomes`, `studently_expenses`, and `studently_system_settings`.
  - Reconciled the distinct roles of `User` (authentication principal) and `Teacher` (academic directory profile), maintaining an audited `0..1 : 1` link uncoupled by `ON DELETE SET NULL`.

### Amendment 18: PermissionsMixin Omission & Custom RBAC Implementation
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#User`, `DATABASE_ARCHITECTURE.md#Section 2.1`.
- **Resolution:**
  - Confirmed omission of `PermissionsMixin` from `User(AbstractBaseUser)`, preventing the creation of 5 unwanted Django `auth_*` join tables.
  - Added `is_superuser = models.BooleanField(default=False)`, `has_perm()`, and `has_module_perms()` methods on `User`.
  - Module authorization is strictly governed by `studently_user_permissions` (`UserPermission`) mapped to the 14 frontend modules.

### Amendment 19: Reconciled 35 Explicit Database CHECK Constraints
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 5`, `DATA_DICTIONARY.md`.
- **Resolution:**
  - Codified missing database-level checks: `chk_perm_module` on permissions, `chk_fee_billing_frequency` on fee structures, `chk_payment_fee_category` on student payments, and `chk_payment_reversal_state` on payment voucher states.
  - Final verified database CHECK constraint count: **35 explicit `models.CheckConstraint` declarations**.

### Amendment 20: Index Inventory Reconciliation (25 Explicit Application Indexes)
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 6`.
- **Resolution:**
  - Declared all 7 composite indexes in `Meta.indexes` across `Student`, `AttendanceRecord`, `Examination`, `ExaminationMark`, `StudentInvoice`, `StudentPayment`, and `Income`.
  - Reconciled single-column indexes: removed redundant `db_index=True` on unique keys (`email`, `admission_number`, `invoice_number`, `receipt_number`), confirmed single-column indexes on `Expense.category` and `User.status`.
  - Final verified index count: **20 Primary Key Indexes** (19 UUID + 1 Integer singleton) + **17 Unique Constraint Indexes** + **25 Explicit Application B-Tree Indexes** (18 single-column + 7 composite) + **32 Auto-generated ForeignKey Indexes**.

### Amendment 21: Primary Key Architecture (19 UUIDs + 1 Integer Singleton)
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 1`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 2`, `DATABASE_ERD.md#Section 1`.
- **Resolution:**
  - Formally documented that the primary-key architecture comprises **19 UUID primary keys** and **1 Integer singleton primary key** (`studently_system_settings.id = 1`).
  - Corrected engine storage analysis: SQLite tables organize around 64-bit integer `rowid` B-Trees with auxiliary non-clustered UUID indexes, whereas MySQL 8.0.16+ InnoDB organizes around clustered indexes on the declared `PRIMARY KEY`.

### Amendment 22: Payment Ledger Immutability, Row Locking & Post-Cutover Disaster Recovery
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#StudentPayment`, `SQLITE_TO_MYSQL_MIGRATION_PLAN.md#Section 7`.
- **Resolution:**
  - Overrode `.delete()` and `.save()` on `StudentPayment` to enforce append-only immutability.
  - Added `reconcile_invoice()` domain service specification executing atomic balance re-evaluations under `select_for_update()`.
  - Replaced naive SQLite rollback guidance: strictly prohibited restoring pre-cutover SQLite backups after production writes have occurred in MySQL; established Forward-Fix Protocol and Delta-Replay Protocol to preserve all transactions committed after cutover.

### Amendment 23: UserPermission MODULE_CHOICES Expansion to 14 Modules
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#UserPermission`, `DATA_DICTIONARY.md#Table 2.2`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Table 5.1`.
- **Resolution:**
  - Expanded `UserPermission.MODULE_CHOICES` from 5 modules to all 14 functional modules (`students`, `attendance`, `examinations`, `reports`, `fees`, `payments`, `income`, `expenses`, `teachers`, `classes`, `subjects`, `users`, `certificates`, `settings`), matching the database check constraint `chk_perm_module`.
  - Documented two-layer validation architecture: Django model choices provide application/form/serializer-level validation while SQL `CheckConstraint` provides database-level enforcement.

### Amendment 24: Custom User Permission Hooks & Object-Level Authorization
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#User`, `DATABASE_ARCHITECTURE.md#Section 3.1`.
- **Resolution:**
  - Updated `has_perm()` and `has_module_perms()` on `User`: inactive users (`is_active=False`) strictly return `False`; superusers (`is_superuser=True`) receive unrestricted permissions; standard users evaluate explicit `studently_user_permissions` records.
  - Implemented Teacher Safety Ceiling inside `has_perm()`: teachers cannot access financial or administrative modules or delete academic history.
  - Clarified Object-Level Authorization: `has_perm()` operates at model/module level; DRF endpoints enforce object-level authorization through scoped querysets (`get_queryset()`), permission classes, and server-side ownership validation.

### Amendment 25: Payment & Invoice Cross-Entity Ownership Validation & Balance Ceilings
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#process_payment`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 7.1`, `DATA_DICTIONARY.md#Table 2.17`.
- **Resolution:**
  - Added mandatory cross-entity ownership check in `process_payment()`: `if invoice and str(invoice.student_id) != str(student.id): raise ValidationError("The selected invoice does not belong to this student.")`.
  - Added outstanding balance ceiling validation: `if amount > remaining_balance: raise ValidationError(...)`.
  - Added idempotency verification preventing duplicate transaction processing via `UNIQUE(payment_method, transaction_ref)`.
  - Ensured `refund_payment()` sets `is_reversal=False` (with `transaction_type='Refund'`).

### Amendment 26: Production MySQL Least-Privilege Database Account Segregation
- **Correction Applied In:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md#Section 4`.
- **Resolution:**
  - Replaced over-privileged `studently_admin` account with dedicated role-segregated accounts:
    * `studently_app`: Runtime DML only (`SELECT, INSERT, UPDATE, DELETE`) on `studently_db.*`; strictly no DDL (`CREATE, DROP, ALTER, REFERENCES, INDEX`) or administrative grants.
    * `studently_migrator`: Schema migration account used exclusively during deployment maintenance windows (`python manage.py migrate`).
    * `studently_backup`: Dedicated backup account (`SELECT, RELOAD, LOCK TABLES, REPLICATION CLIENT, SHOW VIEW`).
  - Added database-level MySQL `BEFORE UPDATE` and `BEFORE DELETE` triggers on `studently_student_payments` to enforce ledger immutability at the SQL engine level.
  - Documented operational security standards (environment secrets injection, 90-day credential rotation, restricted VPC CIDR bindings, quarterly privilege audits).

### Amendment 27: Technical Accuracy of UUID Physical Storage Semantics
- **Correction Applied In:** `DATABASE_ARCHITECTURE.md#Section 1.1`, `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 2`, `DJANGO_MODEL_SPECIFICATIONS.md#Section 1`, `DATA_DICTIONARY.md#Section 1`.
- **Resolution:**
  - Accurately documented that Django's built-in `UUIDField` maps to `char(32) NOT NULL` in both SQLite and MySQL backends (which lack native UUID data types), storing 32-character hexadecimal strings without hyphens via `uuid_obj.hex`.
  - Documented that SQLite assigns `TEXT` type affinity (32 bytes payload) and indexes it via secondary B-Tree over `rowid`; MySQL InnoDB uses `char(32)` as the clustered primary key.
  - Documented that Django REST Framework automatically formats UUIDs as standard 36-character hyphenated RFC 4122 strings in API responses, preserving frontend compatibility.
  - Documented architectural rationale for omitting `BINARY(16)` storage (requires third-party packages / custom fields and is unnecessary for school operational scale).

### Amendment 28: User Role Standardization & Terminology Alignment
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#User`, `DATA_DICTIONARY.md#Table 2.1`, `DATABASE_ARCHITECTURE.md#Section 3.1`.
- **Resolution:**
  - Standardized authoritative database roles as strictly `'ADMIN'` and `'TEACHER'`, enforced by `chk_user_role` (`CHECK (role IN ('ADMIN', 'TEACHER'))`).
  - Clarified that Bursar / Accountant is an `ADMIN` user with custom financial module permissions in `studently_user_permissions`, not a separate database role string.
  - Standardized the canonical term **Superuser (`is_superuser=True`)** across all documents, deprecating ambiguous labels like `SUPERADMIN` or `SUPER_ADMIN`.

---

### Amendment 29: HIGH-01 — Teacher Safety Ceiling Evaluation Sequence Reordering & Hardening
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#User.has_perm`, `DJANGO_MODEL_SPECIFICATIONS.md#UserPermission.clean`, `DATABASE_ARCHITECTURE.md#Section 3.1`.
- **Finding Addressed:** HIGH-01 (Teacher Safety Ceiling Bypass).
- **Resolution:**
  - Reordered the authorization pipeline in `User.has_perm()`:
    1. Authentication Verification (`is_authenticated`).
    2. Account Status Check (`is_active=False` strictly returns `False`).
    3. Format & Syntactic Validation (`<module>.<action>` validated against 14 authoritative modules and 7 action flags).
    4. Institutional Superuser Privileges (`is_superuser=True` granted institutional override).
    5. **Teacher Hard Safety Ceiling evaluated BEFORE database lookup**: Unconditional denial for financial modules (`fees`, `payments`, `income`, `expenses`) and administrative modules (`users`, `settings`, `certificates`), regardless of any errant database record in `studently_user_permissions`. Prohibits modification of student demographics (`can_add`, `can_edit`, `can_delete`, `can_import`) and deletion of attendance or examination history (`can_delete`).
    6. Permission Record Retrieval (Fail-Closed).
    7. Action Evaluation.
    8. Default Deny.
  - Updated `UserPermission.clean()` to include `certificates` in the administrative restriction block alongside `users` and `settings`.

---

### Amendment 30: HIGH-02 — Fail-Closed RBAC Architecture & Admin Permission Provisioning
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md#User.has_perm`, `DJANGO_MODEL_SPECIFICATIONS.md#User.has_module_perms`, `DJANGO_MODEL_SPECIFICATIONS.md#Section 2.1.1`, `DATABASE_ARCHITECTURE.md#Section 3.1`.
- **Finding Addressed:** HIGH-02 (Admin RBAC Fail-Open Behavior).
- **Resolution:**
  - Eliminated the fail-open fallback (`if self.role == 'ADMIN': return True`) and silent exception swallowing (`except Exception: pass`).
  - Implemented fail-closed permission architecture: standard `ADMIN` users must have explicit `UserPermission` records provisioned. Missing records or query exceptions strictly return `False`.
  - Codified a 5-tier evaluation model clearly distinguishing Authentication, Role Eligibility, Module-Level Permissions, Object-Level Permissions, and Ownership/Assignment Restrictions.
  - Specified DRF endpoint authorization architecture: server-side permission classes (`HasModulePermission`, `IsAssignedTeacherOrAdmin`), scoped `get_queryset()` querysets, and server-side ownership validations.
  - Formally documented the ADMIN permission provisioning workflow (Accountant/Bursar profile vs Academic Registrar profile vs Full Admin profile).

---

### Amendment 31: HIGH-03 — Elimination of Outdated UUID CHAR(36) Physical Storage References
- **Correction Applied In:** `DATA_DICTIONARY.md#Tables 2.2-2.19`, `SQLITE_TO_MYSQL_MIGRATION_PLAN.md#Section 2`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md#Section 3`.
- **Finding Addressed:** HIGH-03 (UUID CHAR(36) Documentation Inconsistency).
- **Resolution:**
  - Replaced all 49 residual physical-storage occurrences of `CHAR(36)` in `DATA_DICTIONARY.md` with `CHAR(32)` for MySQL 8.0 and `TEXT` (`char(32)`) for SQLite, matching Django ORM's native `char(32) NOT NULL` migration DDL.
  - Replaced outdated storage description in `SQLITE_TO_MYSQL_MIGRATION_PLAN.md` (which claimed SQLite stored 36-char hyphenated strings and MySQL stored CHAR(36)).
  - Reconciled clustered index description in `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md` (`CHAR(32)` instead of `CHAR(36)`).
  - Preserved legitimate 36-character references: human-readable student admission number (`admission_number VARCHAR(36)`) and DRF serialization formatting (canonical 36-character hyphenated RFC 4122 string).

---

### Amendment 32: MEDIUM-01 — Three-Tier Database Index Classification & Overlap Analysis
- **Correction Applied In:** `DATABASE_CONSTRAINTS_AND_INDEXES.md#Section 6`, `DATABASE_ARCHITECTURE.md#Section 1.1`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md#Section 6`.
- **Finding Addressed:** MEDIUM-01 (Database Index Inventory Accuracy).
- **Resolution:**
  - Eliminated the unproven theoretical claim of "94 verified physical indexes."
  - Re-architected index inventory into three distinct tiers:
    1. **Inventory A (Declared ORM Application Indexes):** Exactly **25 application indexes** (18 single-column `db_index=True` + 7 composite `Meta.indexes`).
    2. **Inventory B (Database-Generated Indexes):** 20 Primary Key indexes + 17 Unique Constraint indexes + 32 theoretical ForeignKey indexes.
    3. **Inventory C (Physical Database Indexes):** Documented leftmost-prefix overlaps across 13 locations where single-column FK indexes duplicate composite unique indexes or composite `Meta.indexes`. Documented write amplification costs and SQLite vs. MySQL InnoDB indexing semantics.
  - Formally updated the governance status of distinct physical indexes to **`NOT VERIFIED`** pending Phase 3 schema migration execution and database introspection.

---

### Amendment 33: MEDIUM-02 — Invoice-less Payment Policy & Multi-Channel Idempotency Architecture *(Partially Superseded by Amendment 35)*
- **Correction Applied In:** `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DJANGO_MODEL_SPECIFICATIONS.md#StudentPayment`, `DATABASE_ARCHITECTURE.md#Section 3.8`.
- **Finding Addressed:** MEDIUM-02 (Invoice-less Payment Policy and Financial Integrity).
- **Historical Record (Superseded Items Noted):**
  - Preserved `StudentPayment.invoice` as a nullable foreign key (`null=True, blank=True`) at the SQL schema level to preserve historical Phase 1 data migration and the architecture freeze.
  - *(Superseded by Amendment 35)* Initially classified Option A vs Option B as `PENDING BUSINESS DECISION` and proposed `payment.invoice = new_invoice` for Option B. **Retracted and superseded by Amendment 35:** Option A is formally adopted; Option B is explicitly NOT SUPPORTED under the frozen 20-table schema.
  - Hardened universal financial invariants: mandatory cross-entity student ownership check, invoice balance ceiling, pessimistic row locking under `select_for_update()`, and append-only ledger immutability.
  - *(Superseded by Amendment 35)* Initially proposed client `X-Idempotency-Key` (120s cache) and `"CSH-" + receipt_number`. **Retracted and superseded by Amendment 35:** Replaced by one canonical persistent cash idempotency strategy (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`) enforced durably by `UNIQUE(payment_method, transaction_ref)`.

---

### Amendment 34: MEDIUM-03 — Database Credentials Sanitization, Account Segregation & Trigger Boundaries
- **Correction Applied In:** `SQLITE_TO_MYSQL_MIGRATION_PLAN.md#Section 4`, `DATABASE_ARCHITECTURE.md#Section 1.3`.
- **Finding Addressed:** MEDIUM-03 (Database Credentials and Migration Security).
- **Resolution:**
  - Completely sanitized documentation: replaced all literal/mock passwords with unmistakable uppercase placeholders (`<RUNTIME_PASSWORD>`, `<MIGRATOR_PASSWORD>`, `<BACKUP_PASSWORD>`).
  - Codified four-tier least-privilege account architecture:
    * `studently_app`: DML only (`SELECT, INSERT, UPDATE, DELETE`) on `studently_db.*`; no DDL, no administrative privileges.
    * `studently_migrator`: DDL + DML on `studently_db.*` during deploy maintenance windows.
    * `studently_backup`: Strictly scoped read-only privileges (`SELECT, LOCK TABLES, SHOW VIEW` on `studently_db.*`), removing unnecessary global replication grants.
    * Human DBA: Named accounts with MFA and audit logging.
  - Codified credential security standards (secret manager injection, dev/staging/prod isolation, 90-day rotation, VPC CIDR bindings, connection string masking in logs).
  - Formally analyzed ledger trigger boundaries: documented operations blocked by `trg_studently_payments_no_update` and `trg_studently_payments_no_delete`, migration implementation via Django `RunSQL`, emergency repair procedures, SQLite dev equivalents, relational restriction against cascade deletes, and explicitly documented that triggers do NOT protect against root/privileged administrators with `SUPER` or `SYSTEM_USER` privileges.

---

### Amendment 35: MEDIUM-02-A (Durable Cash Idempotency), MEDIUM-02-B (Formal Adoption of Option A & Option B Exclusion) & Document Inventory Reconciliation *(Concurrency Lookup & Race Recovery Sequence Superseded by Amendment 36)*
- **Correction Applied In:** `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_ARCHITECTURE.md`, `DATA_DICTIONARY.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DATABASE_ERD.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, and new deliverable `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md`.
- **Findings Addressed:** External review defects MEDIUM-02-A, MEDIUM-02-B, and Document Inventory Count Discrepancy.
- **Resolution:**
  1. **MEDIUM-02-A (Canonical Persistent Cash Idempotency):** Retired all conflicting cash reference formats (`CSH-<receipt_number>`, `CASH-<STUDENT_ID>-<YYYYMM>-<DAILY_SEQ>`) and removed Redis/Django cache as a durability source of truth. Established one deterministic format: `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` (46 chars for UUID; 74 chars SHA-256 hex for arbitrary keys) derived from the client `Idempotency-Key` header **before** duplicate lookup and insertion, persisted in `StudentPayment.transaction_ref`, and enforced durably by `UNIQUE(payment_method, transaction_ref)`. Added logical payload comparison (`200 OK` original receipt on match; `409 Conflict` on mismatch) and nested-savepoint `IntegrityError` race recovery that never suppresses unrelated errors. *(Note: The single pre-lock lookup and ordinary snapshot recovery SELECT in Amendment 35 were subsequently hardened by Amendment 36.)*
  2. **MEDIUM-02-B (Option A Adopted; Option B Unsupported Under Frozen Schema):** Formally adopted **Option A (Invoice Required for New Operational Payments)**. Clarified that `StudentPayment.invoice_id` remains DB-nullable strictly for historical Phase 1 legacy migration compatibility, while the operational API and `process_payment()` reject new payments without an invoice. Retracted `payment.invoice = new_invoice` and all claims that Option B requires zero DDL changes. Documented Option B explicitly as **NOT SUPPORTED UNDER THE CURRENT FROZEN 20-TABLE SCHEMA** and provided a future ADR architectural blueprint (`PaymentAllocation` ledger table) without modifying the frozen 20-table schema.
  3. **Document Inventory Reconciliation:** Corrected the inventory mismatch in `PHASE_2_MEDIUM_SEVERITY_CORRECTIONS_REPORT.md` (previously stated 16 instead of 17) and synchronized all active inventory lists across the suite to reflect the actual **18 Phase 2 Markdown documents** (subsequently expanded to 19 in Amendment 36).

---

### Amendment 36: `CONC-01` (Post-Invoice-Lock Duplicate Lookup) & `CONC-02` (MySQL `REPEATABLE READ` Current-Read Race Recovery)
- **Correction Applied In:** `DJANGO_MODEL_SPECIFICATIONS.md`, `PHASE_2_PAYMENT_POLICY_DECISION.md`, `DATABASE_ARCHITECTURE.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_FINAL_INDEPENDENT_AUDIT_REPORT.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_MEDIUM_02_FINAL_RESOLUTION_REPORT.md` (superseded annotations only), `PHASE_2_CORRECTIONS.md`, and new deliverable `PHASE_2_CONCURRENCY_CORRECTIONS_REPORT.md`.
- **Findings Addressed:** Two independent external audit payment idempotency concurrency defects (`CONC-01` / Defect A and `CONC-02` / Defect B).
- **Resolution:**
  1. **Defect A (`CONC-01` — Mandatory Second Duplicate Lookup After Invoice Lock):** Restructured `process_payment()` into a 12-step sequence where an initial non-locking persistent duplicate lookup runs before locking, followed inside `transaction.atomic()` by `StudentInvoice.objects.select_for_update()`, cross-entity ownership validation, and a **mandatory second duplicate lookup using a current/locking read** (`StudentPayment.objects.select_for_update().filter(payment_method=payment_method, transaction_ref=resolved_ref).first()`) strictly **before** invoice status/balance calculation and validation. Prevents concurrent same-key retries on a newly paid-off invoice from raising a zero-balance `ValidationError` instead of returning the original receipt.
  2. **Defect B (`CONC-02` — MySQL `REPEATABLE READ` Current-Read Race Recovery):** Preserved MySQL InnoDB's default `REPEATABLE READ` isolation level; isolated `payment.save()` inside an inner `transaction.atomic()` savepoint; caught `IntegrityError` outside the failed savepoint; verified the exception corresponds specifically to `UNIQUE(payment_method, transaction_ref)` (`_is_payment_ref_unique_violation(exc)`); replaced the unreliable ordinary consistent snapshot `SELECT` with a **current/locking read** (`StudentPayment.objects.select_for_update()`) so MVCC snapshots never mask a concurrently committed winning payment; returned `(raced_existing, False)` (`HTTP 200 OK`) on payload match or raised `IdempotencyConflictError` (`HTTP 409 Conflict`) on mismatch; and re-raised unrelated `IntegrityError` exceptions immediately.
  3. **Backend-Specific Concurrency Documentation & Key Scope:** Explicitly distinguished MySQL InnoDB `REPEATABLE READ` current/locking reads from SQLite's non-row-locking behavior (where `select_for_update()` compiles as a plain `SELECT` and writes serialize via database-wide file locks). Documented the existing global scope per payment method implied by `UNIQUE(payment_method, transaction_ref)` without altering the frozen 20-table schema or Option A policy.
  4. **Mandatory Phase 3 Test Scenarios & Inventory Update:** Specified six mandatory Phase 3 automated test scenarios (Tests A–F, not yet executed) and updated the active Phase 2 suite inventory to **19 Phase 2 Markdown documents**.

---

### Amendment 37: MySQL Deadlock & Transaction Retry Policy (`1213` vs. `1205`) & Final Cross-Document Consistency Audit
- **Correction Applied In:** `MYSQL_DEADLOCK_RETRY_POLICY.md` (new), `DJANGO_MODEL_SPECIFICATIONS.md`, `DATABASE_CONSTRAINTS_AND_INDEXES.md`, `DATABASE_ARCHITECTURE.md`, `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`, `PHASE_2_SIGNOFF_CHECKLIST.md`, `PHASE_2_FINAL_CROSS_DOCUMENT_CONSISTENCY_AUDIT.md` (new), `PHASE_2_FINAL_COMPLETION_REPORT.md` (new), and `PHASE_2_CORRECTIONS.md`.
- **Findings Addressed:** Final Phase 2 technical completion (MySQL deadlock retry specification + 19-document cross-document consistency audit).
- **Resolution:**
  1. **MySQL Deadlock and Transaction Retry Policy:** Codified bounded whole-transaction retry (`MAX_DEADLOCK_RETRIES = 3`) strictly **outside** `transaction.atomic()` for MySQL InnoDB error `1213` (`ER_LOCK_DEADLOCK`) after complete transaction rollback, repeating all idempotency lookups (`CONC-01`, `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`, `UNIQUE(payment_method, transaction_ref)`). Distinguished error `1205` (`ER_LOCK_WAIT_TIMEOUT`, non-retried, controlled `HTTP 503`), separated `CONC-02` `IntegrityError` recovery from deadlock retry, prohibited retrying unrelated `OperationalError`s, and documented SQLite non-equivalence (`NOT VERIFIED` at runtime until Phase 3 MySQL staging).
  2. **Final Cross-Document Consistency Audit (3 Genuine Corrections in `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`):**
     - Aligned Section 6 item #17 (`unique_payment_method_transaction_ref`) to reflect durable global-per-method idempotency for both Mobile Money (`ZAAD`/`eDahab`) and `Cash` (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`).
     - Aligned Section 7 Master Database Index Inventory with `MEDIUM-01` to explicitly separate **25 Declared Application Indexes**, **94 Potential Index References (pre-deduplication)**, and **Physical Database Indexes on Disk: `NOT VERIFIED`**.
     - Aligned Section 8 item #4 SQL-level payment immutability wording with `MEDIUM-03` (`SQLITE_TO_MYSQL_MIGRATION_PLAN.md`) to reference MySQL `BEFORE UPDATE`/`BEFORE DELETE` triggers (`trg_studently_payments_no_update`, `trg_studently_payments_no_delete`).
  3. **Suite Inventory & Final Sign-Off:** Reconciled active Phase 2 documentation suite to **22 Phase 2 Markdown documents** (19 existing + 3 final deliverables); preserved all 3 pending institutional business decisions unchanged.
