# STUDENTLY — Database Constraints, Indexes & Concurrency Specification
**Document:** `DATABASE_CONSTRAINTS_AND_INDEXES.md`  
**Phase:** Phase 2 — Database Architecture & Design  
**Author:** Senior Database Architect & Application Security Auditor  
**Date:** November 2026  
**Status:** Architecture Specification — Pending Stakeholder Sign-Off  

---

## 1. Overview & Objectives

In **STUDENTLY**, database-level constraints and indexes provide the ultimate guarantee of data integrity, confidentiality, and high-concurrency throughput. Relying solely on application-level checks leaves systems vulnerable to race conditions, partial writes, and bypass attacks.

This specification details all **Primary Keys**, **Foreign Keys & Cascading Actions**, **Unique Constraints**, **Check Constraints**, **Indexes**, and **Concurrency Locking Strategies** across SQLite (development) and MySQL 8.0 (production).

---

## 2. Primary Keys & Key Generation Strategy

- **Architectural Composition:** Exactly **19 application domain entities** utilize an immutable Universally Unique Identifier (`UUIDv4`). Exactly **1 system entity** (`studently_system_settings`) utilizes a single-row integer singleton primary key (`PositiveSmallIntegerField(primary_key=True, default=1)`).
- **Physical Storage Semantics Across Engine Layers:**
  - **Python Runtime Layer:** Handled natively as Python standard library `uuid.UUID` objects.
  - **Django ORM Layer:** Declared as `models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`. Because neither SQLite nor MySQL provides a native UUID data type in standard Django ORM, Django maps `UUIDField` to `char(32) NOT NULL` in migration DDL and stores values stripped of hyphens via `uuid_obj.hex` (32 hexadecimal ASCII characters).
  - **SQLite (Development):**
    - The column is declared as `char(32)`, which SQLite treats with `TEXT` type affinity, storing 32 ASCII characters (32 bytes payload).
    - SQLite tables organize rows internally around a 64-bit signed integer `rowid` B-Tree. Declaring `id char(32) PRIMARY KEY` builds an auxiliary unique B-Tree index on `id` referencing the underlying `rowid`.
    - For `studently_system_settings`, declaring `id integer PRIMARY KEY` directly aliases the native `rowid`.
  - **MySQL 8.0.16+ InnoDB (Production):**
    - Django migrations emit `char(32) NOT NULL` for `models.UUIDField`.
    - InnoDB organizes tables strictly around a **clustered primary key index**, where the leaf pages contain the full row data. The 32-character primary key serves directly as the clustered index.
    - All InnoDB secondary indexes store this primary key value as their leaf pointer.
  - **API & Serialization Layer:**
    - Django REST Framework `serializers.UUIDField` automatically formats `uuid.UUID` values into canonical 36-character hyphenated RFC 4122 strings (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), preserving 100% contract compatibility with the Vanilla JavaScript frontend.
  - **Binary UUID Storage Architectural Rationale:** Dedicated `BINARY(16)` storage (with `UUID_TO_BIN(..., 1)`) is not natively supported by Django 5.x ORM without custom field extensions or third-party packages. Given STUDENTLY's institutional school scale (thousands of operations per term, not high-frequency financial trading), standard Django `char(32)` `UUIDField` indexing delivers optimal maintainability without third-party dependencies.
- **Generation:** UUIDs are generated at application runtime by Django ORM (`default=uuid.uuid4`), ensuring identity is established prior to persistence.
- **Security Scope & Clarification:**
  - **Non-Sequential Identifiers:** UUID primary keys eliminate predictable sequential enumeration attacks (e.g. iterating `/api/v1/students/1`, `/2`, `/3`).
  - **Not an Authorization Mechanism:** UUIDs are identifiers, NOT authorization controls. UUIDs do **NOT** prevent automated scraping or unauthorized access. A client who discovers or guesses a UUID must still be blocked if unauthorized.
  - **Mandatory Server-Side Access Control:**
    1. **Authentication:** Cryptographic token verification via SimpleJWT.
    2. **Object-Level Permissions:** Django REST Framework permission classes (e.g. `HasModulePermission`, `IsAdminOrAssignedTeacher`).
    3. **Scoped QuerySets:** Database queries scoped strictly by user identity (e.g. `Student.objects.for_teacher(request.user)`).
    4. **Rate Limiting (Throttling):** DRF user and IP throttling (e.g. 100 requests/minute for staff, 20 requests/minute for unauthenticated endpoints).
    5. **Audit Logging:** Server-side audit logging of all data access and export actions.

---

## 3. Comprehensive Foreign Key Cascading Policies

Foreign keys protect referential integrity and prevent orphaned records. Django `models.RESTRICT` (and database `ON DELETE RESTRICT`) is favored for core entities to prevent accidental data loss.

| Parent Entity | Child Entity | Foreign Key Column | On-Delete Action | Enforcement Justification |
| :--- | :--- | :--- | :---: | :--- |
| `studently_users` | `studently_user_permissions` | `user_id` | `CASCADE` | User permissions belong strictly to the user lifecycle. |
| `studently_teachers` | `studently_users` | `teacher_id` | `SET_NULL` | Removing a teacher profile unlinks the user account without locking out login. |
| `studently_teachers` | `studently_classes` | `teacher_id` | `SET_NULL` | If a homeroom teacher is unassigned, classroom record persists. |
| `studently_classes` | `studently_subjects` | `class_id` | `RESTRICT` | Cannot delete a classroom if curriculum subjects exist. |
| `studently_classes` | `studently_students` | `class_id` | `RESTRICT` | Phase 1 Rule: Cannot delete a class with active enrolled students. |
| `studently_teachers` | `studently_teacher_class_assignments` | `teacher_id` | `CASCADE` | Junction table cleans up teacher assignment links on teacher deletion. |
| `studently_classes` | `studently_teacher_class_assignments` | `class_id` | `CASCADE` | Junction table cleans up class assignment links on class deletion. |
| `studently_teachers` | `studently_teacher_subject_assignments`| `teacher_id` | `CASCADE` | Junction table cleans up subject assignment links on teacher deletion. |
| `studently_subjects` | `studently_teacher_subject_assignments`| `subject_id` | `CASCADE` | Junction table cleans up subject assignment links on subject deletion. |
| `studently_students` | `studently_attendance` | `student_id` | `RESTRICT` | Hard deletion of student is blocked if attendance history exists. |
| `studently_classes` | `studently_attendance` | `class_id` | `RESTRICT` | Class with daily roll call logs cannot be deleted. |
| `studently_classes` | `studently_examinations` | `class_id` | `RESTRICT` | Cannot delete a class with historical exam sessions. |
| `studently_examinations` | `studently_examination_marks` | `examination_id` | `CASCADE` | Deleting an exam session clears its child marks rows. |
| `studently_subjects` | `studently_examination_marks` | `subject_id` | `RESTRICT` | Phase 1 Rule: Cannot delete subject if examination marks exist. |
| `studently_students` | `studently_examination_marks` | `student_id` | `RESTRICT` | Student with recorded exam scores cannot be deleted. |
| `studently_students` | `studently_promotions` | `student_id` | `RESTRICT` | Academic promotion audit trail cannot be orphaned. |
| `studently_students` | `studently_student_invoices` | `student_id` | `RESTRICT` | Financial invoices cannot be orphaned or deleted. |
| `studently_student_invoices` | `studently_invoice_items` | `invoice_id` | `CASCADE` | Invoice line items belong strictly to the invoice header. |
| `studently_fee_structures` | `studently_invoice_items` | `fee_structure_id` | `RESTRICT` | Fee structure cannot be deleted if billed on active invoices. |
| `studently_students` | `studently_student_payments` | `student_id` | `RESTRICT` | Student with financial transactions cannot be deleted. |
| `studently_student_invoices` | `studently_student_payments` | `invoice_id` | `RESTRICT` | Payment vouchers cannot be orphaned from their invoice. |
| `studently_users` | `studently_student_payments` | `recorded_by_user_id` | `RESTRICT` | Cashier/Admin identity must be preserved on payment receipts. |

---

## 4. Unique Constraints Specification

Unique constraints guarantee business-level non-duplication across single and composite columns.

| Entity | Constraint Name | Columns | Scope & Business Rule |
| :--- | :--- | :--- | :--- |
| `studently_users` | `unique_user_email` | `email` | User emails must be unique system-wide (case-insensitive). |
| `studently_user_permissions` | `unique_user_module_permission` | `user_id, module` | Exactly one permission record per user per functional module. |
| `studently_teachers` | `unique_teacher_email` | `email` | Teacher emails must be unique across the faculty directory. |
| `studently_classes` | `unique_class_section_year` | `name, section, academic_year` | A grade cohort stream is unique per year (e.g. Grade 1 - Section A - 2026-2027). |
| `studently_subjects` | `unique_class_subject_code` | `class_id, code` | Subject syllabus code is unique within a classroom. |
| `studently_teacher_class_assignments` | `unique_teacher_class_assignment` | `teacher_id, class_id` | A teacher cannot be assigned twice to the same class. |
| `studently_teacher_subject_assignments`| `unique_teacher_subject_assignment`| `teacher_id, subject_id` | A teacher cannot be assigned twice to the same subject. |
| `studently_students` | `unique_student_admission_number` | `admission_number` | Human-facing student ID (`STD-XXXX`) must be globally unique. |
| `studently_attendance` | `unique_student_daily_attendance` | `student_id, date` | Exactly one attendance status recorded per student per calendar date. |
| `studently_examinations` | `unique_class_exam_session` | `class_id, exam_type, academic_year, term` | Exactly one exam session per type per term per class. |
| `studently_examination_marks` | `unique_exam_student_subject_mark` | `examination_id, student_id, subject_id` | Exactly one score per student per subject per exam session. |
| `studently_examination_student_summaries` | `unique_exam_student_summary` | `examination_id, student_id` | Exactly one summary total per student per exam session. |
| `studently_fee_structures` | `unique_fee_structure_code` | `code` | Standard fee code is unique (e.g. `CLASS_FEE`, `SCHOOL_FEE`). |
| `studently_student_invoices` | `unique_invoice_number` | `invoice_number` | Official invoice voucher number is globally unique. |
| `studently_student_invoices` | `unique_student_month_invoice` | `student_id, month` | Exactly one tuition fee invoice per student per calendar month. |
| `studently_student_payments` | `unique_receipt_number` | `receipt_number` | Payment receipt voucher number is globally unique. |
| `studently_student_payments` | `unique_payment_method_transaction_ref` | `payment_method, transaction_ref` | Prevents double-submission of electronic payment vouchers (Cash uses unique prefixed references). |

> **Note on Singleton Configuration:** `studently_system_settings` does not require a separate composite unique index; uniqueness is guaranteed by `PRIMARY KEY (id)` combined with `CHECK (id = 1)`.

---

## 5. Check Constraints Specification

Check constraints enforce domain rules, valid value ranges, and financial integrity directly at the database engine level (requiring **MySQL 8.0.16+** in production for enforcement).

### 5.1. Explicit Check Constraints Inventory (35 Rules)

Every rule below is explicitly declared in Django model specifications via `models.CheckConstraint` in `class Meta.constraints`:

| # | Entity | Constraint Name | SQL Check Expression | Business Enforcement |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `studently_users` | `chk_user_role` | `role IN ('ADMIN', 'TEACHER')` | Restricts role to authorized values. |
| **2** | `studently_users` | `chk_user_status` | `status IN ('Active', 'Deactivated')` | Controls account activation state. |
| **3** | `studently_user_permissions` | `chk_perm_module` | `module IN ('students', 'attendance', 'examinations', 'reports', 'fees', 'payments', 'income', 'expenses', 'teachers', 'classes', 'subjects', 'users', 'certificates', 'settings')` | Enforces valid module keys at database level. |
| **4** | `studently_teachers` | `chk_teacher_account_status` | `account_status IN ('Active', 'Deactivated')` | Faculty directory employment status. |
| **5** | `studently_classes` | `chk_class_capacity` | `capacity > 0` | Class capacity must be strictly positive. |
| **6** | `studently_subjects` | `chk_subject_max_marks` | `max_marks > 0` | Maximum grading score must be strictly positive. |
| **7** | `studently_students` | `chk_student_gender` | `gender IN ('Male', 'Female')` | Demographic gender choice validation. |
| **8** | `studently_students` | `chk_student_status` | `status IN ('Active', 'Withdrawn', 'Graduated', 'Suspended')` | Student lifecycle status enum. |
| **9** | `studently_attendance` | `chk_attendance_status` | `status IN ('Present', 'Absent', 'Excused')` | Daily roll call status choices. |
| **10** | `studently_examinations` | `chk_exam_type` | `exam_type IN ('Midterm', 'Final')` | Enforces audited examination categories. |
| **11** | `studently_examinations` | `chk_exam_term` | `term IN ('Term 1', 'Term 2', 'Term 3')` | Academic term validation. |
| **12** | `studently_examination_student_summaries` | `chk_activity_positive` | `activity_score >= 0.00 OR activity_score IS NULL` | Activity score cannot be negative. |
| **13** | `studently_examination_student_summaries` | `chk_total_positive` | `total_score >= 0.00` | Aggregate student session total cannot be negative. |
| **14** | `studently_examination_marks`| `chk_mark_score_positive` | `score >= 0.00` | Normalized subject score cannot be negative. |
| **15** | `studently_fee_structures` | `chk_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | Billing structure category enum. |
| **16** | `studently_fee_structures` | `chk_fee_billing_frequency` | `billing_frequency IN ('Monthly', 'Termly', 'Annually', 'One-Time')` | Enforces valid billing cycle schedules. |
| **17** | `studently_fee_structures` | `chk_fee_default_amount` | `default_amount >= 0.00` | Standard fee rate cannot be negative. |
| **18** | `studently_student_invoices` | `chk_invoice_amounts` | `total_amount_due >= 0.00 AND total_amount_paid >= 0.00` | Invoice financial balances cannot be negative. |
| **19** | `studently_student_invoices` | `chk_invoice_status` | `status IN ('Unpaid', 'Partially Paid', 'Paid', 'Cancelled')` | Invoice status lifecycle enum. |
| **20** | `studently_invoice_items` | `chk_invoice_item_amount` | `amount >= 0.00` | Line item charge cannot be negative. |
| **21** | `studently_student_payments` | `chk_payment_amount_positive` | `amount_paid > 0.00` | Monetary voucher magnitude must be strictly positive. |
| **22** | `studently_student_payments` | `chk_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Enforces accepted remittance channels. |
| **23** | `studently_student_payments` | `chk_payment_transaction_type` | `transaction_type IN ('Payment', 'Reversal', 'Refund')` | Ledger transaction direction/type. |
| **24** | `studently_student_payments` | `chk_payment_fee_category` | `fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other')` | Enforces target fee category classification. |
| **25** | `studently_student_payments` | `chk_payment_reversal_state` | `((transaction_type = 'Payment' AND is_reversal = 0 AND reversed_payment_id IS NULL) OR (transaction_type = 'Reversal' AND is_reversal = 1 AND reversed_payment_id IS NOT NULL) OR (transaction_type = 'Refund' AND is_reversal = 0 AND reversed_payment_id IS NOT NULL))` | Enforces self-referential integrity across payment ledger states. |
| **26** | `studently_incomes` | `chk_income_amount` | `amount >= 0.00` | Revenue inflow amount cannot be negative. |
| **27** | `studently_incomes` | `chk_income_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Non-tuition revenue remittance channel. |
| **28** | `studently_expenses` | `chk_expense_amount` | `amount >= 0.00` | Operating disbursement cannot be negative. |
| **29** | `studently_expenses` | `chk_expense_payment_method` | `payment_method IN ('Cash', 'ZAAD', 'eDahab')` | Disbursement remittance channel. |
| **30** | `studently_system_settings` | `chk_settings_singleton_id` | `id = 1` | Guarantees singleton single-row configuration. |
| **31** | `studently_system_settings` | `chk_settings_calc_method` | `result_calc_method IN ('sum', 'average', 'weighted')` | Enforces valid grading formula options. |
| **32** | `studently_system_settings` | `chk_settings_term` | `current_term IN ('Term 1', 'Term 2', 'Term 3')` | Active institutional term. |
| **33** | `studently_system_settings` | `chk_settings_fees_positive` | `class_fee_monthly >= 0.00 AND school_fee_monthly >= 0.00` | Configured default fee rates cannot be negative. |
| **34** | `studently_system_settings` | `chk_weights_range` | `weighted_midterm BETWEEN 0 AND 100 AND weighted_final BETWEEN 0 AND 100` | Weight percentage boundaries. |
| **35** | `studently_system_settings` | `chk_weights_sum` | `result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100)` | Guarantees weights equal 100% when active. |

### 5.2. Distinction: Explicit Constraints vs. Implicit Field Constraints
- **Django Choices (`choices=[...]`) do NOT create DB CHECK constraints:** In Django ORM, specifying `choices` only enforces validation in forms, serializers, and `model.full_clean()`. Without explicit `models.CheckConstraint`, invalid strings can be inserted via raw SQL or unvalidated ORM calls. STUDENTLY explicitly defines `CheckConstraint` for all 13 enum fields.
- **Django Positive Fields (`PositiveIntegerField`):** Django generates an implicit non-negative check (`column >= 0`) in migrations. However, for columns where zero is invalid (`capacity > 0`, `max_marks > 0`), explicit `models.CheckConstraint(check=Q(col__gt=0))` is strictly declared.
- **Decimal Fields:** Django `DecimalField` has no database-level non-negativity constraint in SQL DDL; explicit `CheckConstraint` is required to prevent negative values.

---

## 6. Comprehensive Database Indexing Strategy & Exact Inventory

### 6.1. Three-Tier Index Classification Architecture
To eliminate all ambiguity regarding theoretical arithmetic tallies versus physical database structures, indexes across the **STUDENTLY** schema are strictly categorized into three separate inventories:

1. **Declared ORM Application Indexes:** Indexes explicitly declared in the Python model specification via `db_index=True` or `class Meta.indexes`.
2. **Database-Generated Indexes (Constraints & ForeignKeys):** Indexes automatically synthesized by Django ORM or the database storage engine to enforce Primary Key constraints, Unique constraints, and ForeignKey referential lookups.
3. **Physical Database Indexes (Engine Level):** The actual distinct B-Tree index structures created in the database catalog after schema migration DDL execution, index deduplication, and leftmost-prefix optimization.

---

### 6.2. Inventory A: Declared ORM Application Indexes (25 Indexes Total)
The Django model specification explicitly requests **exactly 25 application B-Tree indexes** (18 single-column indexes via `db_index=True` + 7 composite indexes via `class Meta.indexes`).

#### 1. Single-Column Application B-Tree Indexes (18 Indexes via `db_index=True`)
| # | Table Name | Index Name | Indexed Column | Targeted Query Pattern & Rationale |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `studently_users` | `idx_users_role` | `role` | Filtering users by role (`ADMIN` vs `TEACHER`) in administrative management screens. |
| **2** | `studently_users` | `idx_users_status` | `status` | Active vs deactivated user account filtering in auth pipelines. |
| **3** | `studently_classes` | `idx_classes_academic_year` | `academic_year` | Scoping class cohorts for the active academic calendar (`YYYY-YYYY`). |
| **4** | `studently_students` | `idx_students_full_name` | `full_name` | Client-side and server-side autocompletion and directory search by student name. |
| **5** | `studently_students` | `idx_students_parent_phone` | `parent_phone` | Emergency guardian phone lookup in the student registry. |
| **6** | `studently_students` | `idx_students_status` | `status` | Scoping active students vs withdrawn, graduated, or suspended students. |
| **7** | `studently_promotions` | `idx_promotions_year` | `academic_year` | Academic year promotion audit filtering. |
| **8** | `studently_attendance` | `idx_attendance_date` | `date` | School-wide daily attendance aggregation on administrative dashboards. |
| **9** | `studently_examinations` | `idx_examinations_year` | `academic_year` | Filtering examination sessions by academic year. |
| **10** | `studently_student_invoices` | `idx_invoices_month` | `month` | Fetching student fee billing obligations for a target calendar month (`YYYY-MM`). |
| **11** | `studently_student_invoices` | `idx_invoices_status` | `status` | Outstanding balance reports filtering `Unpaid` and `Partially Paid` invoices. |
| **12** | `studently_student_payments` | `idx_payments_month` | `month` | Monthly revenue reconciliation. |
| **13** | `studently_student_payments` | `idx_payments_payment_date` | `payment_date` | Financial date-range filtering in transaction history reports. |
| **14** | `studently_student_payments` | `idx_payments_type` | `transaction_type` | Ledger breakdown by Payment vs Reversal vs Refund vouchers. |
| **15** | `studently_incomes` | `idx_incomes_category` | `category` | Income source category aggregation. *(Note: See overlap analysis below).* |
| **16** | `studently_incomes` | `idx_incomes_date` | `date` | Non-tuition revenue date filtering. |
| **17** | `studently_expenses` | `idx_expenses_category` | `category` | Operating disbursement category aggregation. |
| **18** | `studently_expenses` | `idx_expenses_date` | `date` | Operational expense date-range filtering. |

*(Note: Explicit `db_index=True` declarations were intentionally omitted from unique columns `User.email`, `Teacher.email`, `Student.admission_number`, `StudentInvoice.invoice_number`, and `StudentPayment.receipt_number` to prevent duplicate index declarations on fields already backed by unique indexes).*

#### 2. Composite Multi-Column Application B-Tree Indexes (7 Indexes via `class Meta.indexes`)
| # | Table Name | Index Name | Indexed Columns | Leftmost Prefix Column | Targeted Query Pattern |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `studently_students` | `idx_student_class_status` | `class_id, status` | `class_id` | Classroom student roster scoped by active/withdrawn status. |
| **2** | `studently_attendance` | `idx_attendance_class_date` | `class_id, date` | `class_id` | Fetching class roll call for daily attendance screens. |
| **3** | `studently_examinations` | `idx_exam_class_year` | `class_id, academic_year` | `class_id` | Scoping exam sessions for a specific class cohort. |
| **4** | `studently_examination_marks`| `idx_marks_exam_subject` | `examination_id, subject_id` | `examination_id` | Fetching all student marks for a teacher's subject grading screen. |
| **5** | `studently_student_invoices` | `idx_invoice_student_status` | `student_id, status` | `student_id` | Querying unpaid/partially paid invoices for a specific student. |
| **6** | `studently_student_payments` | `idx_payment_student_date` | `student_id, payment_date` | `student_id` | Student payment chronology and receipt audit trail. |
| **7** | `studently_incomes` | `idx_income_cat_date` | `category, date` | `category` | Category-specific revenue reporting over time. |

---

### 6.3. Inventory B: Database-Generated Indexes (Constraints & ForeignKeys)
In addition to the 25 application indexes declared above, the database engine and Django ORM automatically synthesize supporting indexes:

1. **Primary Key Indexes (20 Indexes):**
   - Exactly 19 tables use UUID primary keys (`id`), indexed via automatic unique B-Tree indexes.
   - Exactly 1 table (`studently_system_settings`) uses an integer singleton primary key (`id = 1`), serving as the clustered PK index in MySQL InnoDB.
2. **Unique Constraint Indexes (17 Indexes):**
   - **6 Single-Column Unique Indexes:** `User.email`, `Teacher.email`, `Student.admission_number`, `StudentInvoice.invoice_number`, `StudentPayment.receipt_number`, and `SystemSetting.id`.
   - **11 Composite Unique Indexes:**
     1. `studently_user_permissions(user_id, module)`
     2. `studently_classes(name, academic_year)`
     3. `studently_subjects(class_id, code)`
     4. `studently_teacher_class_assignments(teacher_id, class_id)`
     5. `studently_teacher_subject_assignments(teacher_id, subject_id)`
     6. `studently_attendance(student_id, date)`
     7. `studently_examinations(class_id, exam_type, academic_year, term)`
     8. `studently_examination_student_summaries(examination_id, student_id)`
     9. `studently_examination_marks(examination_id, student_id, subject_id)`
     10. `studently_fee_structures(fee_category, billing_frequency, academic_year)`
     11. `studently_student_invoices(student_id, month)`
     *(Note: `StudentPayment.UNIQUE(payment_method, transaction_ref)` represents a 12th unique constraint index if counted separately from receipt_number; total unique constraints across models: 17).*
3. **Automatically Generated ForeignKey Indexes (32 Potential Indexes):**
   - By default, Django ORM generates an explicit `CREATE INDEX` for every `models.ForeignKey` attribute unless `db_index=False` is set. Across the 32 ForeignKeys, this yields 32 potential single-column index creation operations during migration execution.

---

### 6.4. Inventory C: Overlap Analysis & Physical Index Verification Status

#### 1. Why Arithmetic Sums (94 Index References) Do NOT Equal 94 Physical Indexes
Earlier documentation drafts reported "94 total physical index references" derived from the theoretical arithmetic sum:
$$\text{Theoretical Sum} = 20\text{ (PK)} + 17\text{ (Unique)} + 25\text{ (Explicit App)} + 32\text{ (Auto FK)} = 94\text{ References}$$

This arithmetic addition is technically misleading if described as "94 distinct physical indexes." In production database engines (specifically MySQL 8.0+ InnoDB), composite indexes and unique constraints automatically satisfy single-column lookups on their **leftmost leading columns** (the B-Tree Leftmost Prefix Rule). Furthermore, Django migration runners may create redundant physical indexes unless explicitly suppressed via `db_index=False`.

#### 2. Itemized Index Overlap & Redundancy Matrix
The following table identifies all overlapping indexes where a single-column ForeignKey or application index shares its leading column with a composite unique constraint or composite `Meta.index`:

| Table Name | Explicit / Auto Index | Overlapping Composite Structure | Overlap Mechanism | Performance & Storage Impact |
| :--- | :--- | :--- | :--- | :--- |
| `studently_user_permissions` | Auto FK on `user_id` | `UNIQUE(user_id, module)` | `user_id` is the leftmost prefix of the composite unique index. | In MySQL, the unique index satisfies `WHERE user_id = ?`. A standalone FK index is technically redundant. |
| `studently_subjects` | Auto FK on `class_id` | `UNIQUE(class_id, code)` | `class_id` is the leftmost prefix of the composite unique index. | Single-column FK index duplicates the composite unique index's leftmost prefix. |
| `studently_teacher_class_assignments` | Auto FK on `teacher_id` | `UNIQUE(teacher_id, class_id)` | `teacher_id` is leftmost in composite unique index. | Redundant in MySQL; `class_id` (2nd column) still requires its auto-FK index. |
| `studently_teacher_subject_assignments` | Auto FK on `teacher_id` | `UNIQUE(teacher_id, subject_id)` | `teacher_id` is leftmost in composite unique index. | Redundant in MySQL; `subject_id` (2nd column) still requires its auto-FK index. |
| `studently_students` | Auto FK on `class_id` | `idx_student_class_status(class_id, status)` | `class_id` is leftmost prefix of composite `Meta.index`. | Auto FK index duplicates `class_id` prefix. |
| `studently_attendance` | Auto FK on `student_id` | `UNIQUE(student_id, date)` | `student_id` is leftmost in composite unique index. | Auto FK index duplicates composite unique index prefix. |
| `studently_attendance` | Auto FK on `class_id` | `idx_attendance_class_date(class_id, date)` | `class_id` is leftmost prefix of composite `Meta.index`. | Auto FK index duplicates composite index prefix. |
| `studently_examinations` | Auto FK on `class_id` | `UNIQUE(class_id, exam_type, ...)` AND `idx_exam_class_year(class_id, academic_year)` | `class_id` is leftmost prefix of BOTH composite unique and composite `Meta.index`. | Triple overlap on `class_id`. |
| `studently_examination_student_summaries` | Auto FK on `examination_id` | `UNIQUE(examination_id, student_id)` | `examination_id` is leftmost in composite unique index. | Auto FK index duplicates composite unique index prefix. |
| `studently_examination_marks` | Auto FK on `examination_id` | `UNIQUE(examination_id, student_id, subject_id)` AND `idx_marks_exam_subject(examination_id, subject_id)` | `examination_id` is leftmost in BOTH composite unique and composite `Meta.index`. | Triple overlap on `examination_id`. |
| `studently_student_invoices` | Auto FK on `student_id` | `UNIQUE(student_id, month)` AND `idx_invoice_student_status(student_id, status)` | `student_id` is leftmost in BOTH composite unique and composite `Meta.index`. | Triple overlap on `student_id`. |
| `studently_student_payments` | Auto FK on `student_id` | `idx_payment_student_date(student_id, payment_date)` | `student_id` is leftmost prefix of composite `Meta.index`. | Auto FK index duplicates composite index prefix. |
| `studently_incomes` | `db_index=True` on `category` | `idx_income_cat_date(category, date)` | `category` is leftmost prefix of composite `Meta.index`. | Single-column index is 100% redundant with composite index `(category, date)`. |

#### 3. Storage Engine Disparities (SQLite vs MySQL InnoDB)
- **MySQL 8.0+ InnoDB:** Enforces foreign keys using B-Tree indexes. If an existing index (such as a composite unique index) has the foreign key as its leftmost column, MySQL does NOT require a separate single-column index. However, if Django migration DDL executes `CREATE INDEX` statements blindly, MySQL will create and maintain both, incurring write amplification (extra buffer pool memory and disk writes on every `INSERT` and `DELETE`).
- **SQLite 3.35+:** SQLite does NOT automatically create indexes on ForeignKey columns when `PRAGMA foreign_keys = ON;` is enabled. Django ORM explicitly generates `CREATE INDEX` statements in its migration DDL to maintain index parity. SQLite tables organize rows around an internal 64-bit signed integer `rowid`; all UUID primary keys and unique secondary indexes store pointers to this `rowid`.

#### 4. Physical Index Verification Status: **`NOT VERIFIED`**
> [!IMPORTANT]
> **GOVERNANCE STATUS: NOT VERIFIED IN PHASE 2**  
> Under the strict Phase 2 architecture freeze, no Django migrations have been run, no database DDL has been committed to a live database engine, and no database introspection (`SHOW INDEX FROM ...` or `PRAGMA index_list(...)`) has been executed.  
> 
> Claiming an exact count of 94 physical indexes is unproven and technically inaccurate. The physical index count will only be determined and optimized during **Phase 3 implementation**, where Django migration DDL will be inspected, and redundant single-column ForeignKey indexes will be evaluated with `db_index=False` where composite indexes already provide leftmost coverage.
>
> **Authoritative Inventory Summary:**
> - **Declared Application Indexes:** Exactly **25** (18 single-column + 7 composite).
> - **Declared Primary Keys:** Exactly **20**.
> - **Declared Unique Constraints:** Exactly **17**.
> - **Theoretical ForeignKey Auto-Index Declarations:** Exactly **32**.
> - **Distinct Physical Indexes on Disk:** **`NOT VERIFIED`** (Pending Phase 3 database introspection).

---

## 7. Concurrency, Locking & Atomic Transaction Protocols

### 7.1. Invoice Payment, Reversal & Refund Reconciliation (Pessimistic Row Locking)
When a payment, reversal, or refund is processed (e.g. ZAAD/eDahab mobile money webhook or bursar cash entry), concurrent requests targeting the same invoice must be serialized to prevent double credits or race conditions.

- **Storage Engine Concurrency Disparity:**
  - **MySQL 8.0.16+ (InnoDB, default `REPEATABLE READ`):** `select_for_update()` translates to native SQL `SELECT ... FOR UPDATE`, performing a **current/locking read** that bypasses the transaction's MVCC snapshot and acquires exclusive `X` row locks on index records. This serializes concurrent updates on the target invoice while leaving unrelated invoices available for parallel processing, and guarantees that post-lock duplicate checks and post-`IntegrityError` race recovery observe concurrently committed `StudentPayment` rows without altering the production isolation level.
  - **SQLite (v3.35+ in Development):** SQLite does **NOT** support row-level locks or the `FOR UPDATE` clause. Django's SQLite backend translates `select_for_update()` to a standard `SELECT` without row locks. Concurrency locking in SQLite occurs strictly when a write transaction begins, acquiring a database-wide file lock (`BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE` with `busy_timeout`). SQLite does NOT provide MySQL-equivalent row locking or InnoDB `REPEATABLE READ` snapshot semantics.
  - **Testing Mandate:** High-concurrency simulations, `REPEATABLE READ` race recovery tests, and webhook race condition testing MUST be verified against MySQL 8.0.16+ in Phase 3 staging prior to production deployment; SQLite tests alone never certify MySQL concurrency behavior.

- **Payment Ledger Integrity & Business Rules:**
  1. **Full vs. Partial Refund Policy:**
     - **Reversals:** Strictly 100% full reversal. A reversal completely voids an erroneous or bounced voucher. Partial reversals are prohibited.
     - **Refunds:** Support both full and partial refunds. Multiple sequential partial refunds are permitted up to the maximum refundable ceiling.
  2. **Maximum Refundable Amount:**
     - The cumulative sum of all refunds issued against an original payment cannot exceed the original payment amount:
       $$\sum \text{Refunds Linked to Payment } P \le P.\text{amount\_paid} - (\text{Reversals})$$
     - If a payment has already been reversed, its refundable ceiling is $0.00.
     - For the parent invoice, total reconciled paid amount can never drop below $0.00.
  3. **Duplicate Prevention:**
     - Duplicate payment vouchers prevented via `UNIQUE (payment_method, transaction_ref)`.
     - Reversals: A payment can only be reversed once (`reversal_transactions.filter(transaction_type='Reversal').exists()`).
     - A Reversal or Refund record cannot itself be reversed or refunded (`reversed_payment.transaction_type == 'Payment'`).
  4. **Adopted Option A — Mandatory Operational Invoice & Legacy Nullable FK (`MEDIUM-02-B`):**
     - **All new operational payments require `invoice_id NOT NULL`** (enforced in DRF serializers and `process_payment()`).
     - The database column `invoice_id` remains nullable **strictly for historical Phase 1 legacy migration compatibility**. Historical migrated rows with `invoice_id = NULL` can still be reversed or refunded in the ledger without triggering invoice reconciliation.
     - Existing payments are immutable and can NEVER be reassigned to another invoice. **Option B (unallocated advance deposits) is NOT supported under the current frozen 20-table schema** and would require a future formal ADR adding a `PaymentAllocation` ledger table.
  5. **Cancelled Invoices:**
     - Invoices with `status = 'Cancelled'` are locked against new payments, reversals, or refunds.
  6. **Model Validation Execution Guarantee:**
     - In Django ORM, calling `.save()` or `.create()` does **not** automatically execute `clean()` or `full_clean()`.
     - To prevent invalid ledger states, `StudentPayment.save()` explicitly calls `self.full_clean()` before writing, and all financial workflows execute through dedicated atomic domain service functions in `apps.finances.services`.
  7. **Cross-Entity Ownership Validation:**
     - When an invoice is attached to a payment transaction, server-side validation strictly enforces:
       ```python
       if invoice and str(invoice.student_id) != str(student.id):
           raise ValidationError("The selected invoice does not belong to this student.")
       ```
     - Payments cannot be cross-posted or credited to another student's invoice. Ownership is verified directly against the database inside the atomic transaction, never trusted from client request parameters.
  8. **Outstanding Balance Ceiling Check:**
     - Payment `amount_paid` cannot exceed the invoice's remaining balance (`invoice.total_amount_due - invoice.total_amount_paid`), preventing unallocated overpayments.
  9. **Durable Idempotency Strategy, Post-Lock Duplicate Lookup & Current-Read Race Recovery (`MEDIUM-02-A`, `CONC-01`, `CONC-02`):**
     - **Canonical Cash Idempotency:** Clients supply an `Idempotency-Key` header for every new Cash payment. The server deterministically derives `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` (46 chars for UUID; 74 chars SHA-256 hex for arbitrary keys) **before** duplicate checking and insertion, persisting it in `StudentPayment.transaction_ref`. Receipt numbers are never used as the idempotency source.
     - **Database Uniqueness as Source of Truth (Global Scope per Method):** Enforced durably by `UNIQUE(payment_method, transaction_ref)` across `studently_student_payments` for both Mobile Money (`ZAAD`/`eDahab`) and `Cash`. Survives cache expiration, eviction, server restarts, and concurrent requests. Redis/Django cache is optional optimization only, never the source of truth.
     - **Two-Stage Duplicate Lookup (`CONC-01`):** `process_payment()` performs an initial persistent lookup before locking, then inside `transaction.atomic()` locks the target `StudentInvoice` (`select_for_update()`), validates ownership, and executes a **mandatory second current-read duplicate lookup** (`StudentPayment.objects.select_for_update()`) **before** outstanding-balance calculation or validation. This prevents concurrent retries on a newly paid-off invoice from failing with a zero-balance `ValidationError`.
     - **Payload Consistency & MySQL `REPEATABLE READ` Current-Read Race Recovery (`CONC-02`):** Same key + same logical payload returns the original payment and receipt (`HTTP 200 OK`); same key + different payload raises `IdempotencyConflictError` (`HTTP 409 Conflict`). Concurrent insert races are isolated inside an inner savepoint (`with transaction.atomic():`), verified specifically against `UNIQUE(payment_method, transaction_ref)`, and recovered using a **current/locking read** (`StudentPayment.objects.select_for_update()`) so InnoDB `REPEATABLE READ` snapshots never hide the committed winning row. Unrelated `IntegrityError` exceptions (CHECK constraints, FK violations, `unique_receipt_number` collisions) are always re-raised.
  10. **Append-Only Immutability:**
     - `StudentPayment` records are strictly immutable. `.save()` and `.delete()` raise `PermissionDenied` on existing records; modifications occur solely via compensatory Reversal or Refund transactions.

- **Atomic Financial Execution Protocols:**
  ```python
  # See DJANGO_MODEL_SPECIFICATIONS.md & MYSQL_DEADLOCK_RETRY_POLICY.md for full service implementations:
  # - process_payment_with_deadlock_retry(...) -> wraps process_payment(...) for MySQL error 1213
  # - process_payment(student, invoice, fee_category, month, amount, method, ref, user)
  # - reverse_payment(original_payment, user, reason)
  # - refund_payment(original_payment, amount, user, reason)
  ```

#### MySQL Deadlock and Transaction Retry Policy
- **Scope (`MYSQL_DEADLOCK_RETRY_POLICY.md`):** Wraps `process_payment()` **outside** `transaction.atomic()` to handle MySQL 8.0.16+ InnoDB deadlock error **`1213` (`ER_LOCK_DEADLOCK`)** via bounded full-transaction retries (`MAX_DEADLOCK_RETRIES = 3`, i.e., 1 initial attempt + up to 2 retries with short jittered backoff).
- **Error `1213` vs. `1205`:** Error `1213` triggers complete InnoDB transaction rollback and is retried from a fresh transaction repeating all idempotency lookups (`CONC-01`, preserving `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>` and `UNIQUE(payment_method, transaction_ref)`). Lock wait timeout error **`1205` (`ER_LOCK_WAIT_TIMEOUT`)** is NOT blindly retried inside the request loop; after full rollback it raises a controlled `PaymentConcurrencyError` (`HTTP 503 Service Unavailable`) so the client may safely retry with the same `Idempotency-Key`.
- **Strict Boundaries:** Unrelated `OperationalError` exceptions are never retried. Duplicate-key `IntegrityError` races on `UNIQUE(payment_method, transaction_ref)` remain governed exclusively by **`CONC-02`** savepoint + current-read recovery (never the deadlock retry loop). Retry exhaustion returns `HTTP 503` without duplicate payments or corrupted balances.
- **SQLite Limitation:** SQLite does not provide MySQL-equivalent row-level locking or InnoDB error `1213` deadlocks; runtime deadlock retry validation is deferred to Phase 3 MySQL staging tests (`NOT VERIFIED`).

### 7.2. Multi-Teacher Grade Submission (Atomic Bulk Upsert)
When a teacher submits grades for their assigned subject in a class of 30 students:
- **Protocol:**
  ```python
  with transaction.atomic():
      # Verify teacher subject assignment
      ensure_teacher_assigned(teacher, subject_id)
      
      # Upsert marks
      for student_id, score in student_scores.items():
          ExaminationMark.objects.update_or_create(
              examination=exam,
              student_id=student_id,
              subject_id=subject_id,
              defaults={'score': score, 'recorded_by': teacher}
          )
      
      # Recalculate student totals
      recompute_exam_summaries(exam)
  ```
- **Concurrency Isolation:** Row-level locking on `studently_examination_marks` ensures Teacher A submitting Mathematics marks does not block or conflict with Teacher B submitting English marks for the same classroom at the exact same second.
