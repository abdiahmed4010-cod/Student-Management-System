# STUDENTLY — Phase 2 Final Schema Consistency Matrix
**Document:** `PHASE_2_FINAL_SCHEMA_CONSISTENCY_MATRIX.md`  
**Phase:** Phase 2 — Relational Database Architecture & Design Final Audit  
**Role:** Principal Database Architect, Senior Django ORM Specialist & Financial Database Integrity Engineer  
**Date:** November 2026  
**Status:** Verification Complete — Locked for Independent Stakeholder Review (No Self-Approval)  

---

## 1. Executive Summary & Architectural Authority

This master consistency matrix establishes the single source of truth across all architectural specifications for **STUDENTLY — School & Payment Management System**. It resolves every discrepancy identified in prior independent audits and guarantees complete 1-to-1 synchronization among:
- [DATABASE_ARCHITECTURE.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ARCHITECTURE.md)
- [DATABASE_ERD.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_ERD.md)
- [DATA_DICTIONARY.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATA_DICTIONARY.md)
- [DJANGO_MODEL_SPECIFICATIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md)
- [DATABASE_CONSTRAINTS_AND_INDEXES.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/DATABASE_CONSTRAINTS_AND_INDEXES.md)
- [SQLITE_TO_MYSQL_MIGRATION_PLAN.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/SQLITE_TO_MYSQL_MIGRATION_PLAN.md)
- [PHASE_2_FINAL_REVIEW.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_REVIEW.md)
- [PHASE_2_CORRECTIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_CORRECTIONS.md)
- [PHASE_2_SIGNOFF_CHECKLIST.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_SIGNOFF_CHECKLIST.md)
- [PHASE_2_FINAL_CORRECTION_REPORT.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_FINAL_CORRECTION_REPORT.md)
- [PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/documentation/phase-2/PHASE_2_INDEPENDENT_AUDIT_CORRECTIONS.md)

---

## 2. Master Table Inventory & Model-to-Table Mappings (20 Application Domain Tables)

The STUDENTLY application domain comprises exactly **20 physical application tables**. Framework-level Django tables (`django_migrations`, `django_content_type`, `django_session`, `django_admin_log`) are excluded from the application domain count.

| # | Physical Table Name | Django Model Class | Subdomain / App | PK Type | Cardinal Role in System |
| :-: | :--- | :--- | :--- | :---: | :--- |
| **1** | `studently_users` | `User` | `apps.accounts` | `UUIDv4` | Authentication principal, credentials, role, account status (`AbstractBaseUser`). |
| **2** | `studently_user_permissions` | `UserPermission` | `apps.accounts` | `UUIDv4` | Granular per-user RBAC overrides across the 14 frontend modules. |
| **3** | `studently_teachers` | `Teacher` | `apps.academics` | `UUIDv4` | Academic faculty profile, qualification, contact, and employment directory. |
| **4** | `studently_classes` | `Classroom` | `apps.academics` | `UUIDv4` | Class cohorts, sections, rooms, capacities, and homeroom lead allocation. |
| **5** | `studently_subjects` | `Subject` | `apps.academics` | `UUIDv4` | Academic curriculum subjects scoped per classroom. |
| **6** | `studently_teacher_class_assignments` | `TeacherClassAssignment` | `apps.academics` | `UUIDv4` | N:M junction mapping multiple teaching faculty members to a classroom cohort. |
| **7** | `studently_teacher_subject_assignments` | `TeacherSubjectAssignment`| `apps.academics` | `UUIDv4` | N:M junction mapping teachers to specific curriculum subjects (grading isolation). |
| **8** | `studently_students` | `Student` | `apps.students` | `UUIDv4` | Master student directory complying with the strict Phase 1 7-field contract. |
| **9** | `studently_attendance` | `AttendanceRecord` | `apps.attendance` | `UUIDv4` | Daily student roll call attendance and excused justification records. |
| **10** | `studently_examinations` | `Examination` | `apps.examinations` | `UUIDv4` | Exam session header scoped by class, type (`Midterm`/`Final`), year, and term. |
| **11** | `studently_examination_student_summaries` | `ExaminationStudentSummary`| `apps.examinations` | `UUIDv4` | Materialized aggregate session total, activity score, ranking, and GPA. |
| **12** | `studently_examination_marks` | `ExaminationMark` | `apps.examinations` | `UUIDv4` | 3NF normalized subject-level scores graded by assigned teachers. |
| **13** | `studently_promotions` | `PromotionHistory` | `apps.students` | `UUIDv4` | Immutable audit log of annual grade advancements and transfers. |
| **14** | `studently_fee_structures` | `FeeStructure` | `apps.finances` | `UUIDv4` | Master institutional catalog of tuition rates, fees, and billing cycles. |
| **15** | `studently_student_invoices` | `StudentInvoice` | `apps.finances` | `UUIDv4` | Materialized monthly student tuition billing invoices with balance tracking. |
| **16** | `studently_invoice_items` | `InvoiceItem` | `apps.finances` | `UUIDv4` | Line-item fee charges constituting a student invoice. |
| **17** | `studently_student_payments` | `StudentPayment` | `apps.finances` | `UUIDv4` | Immutable financial ledger for payments, reversals, and refund vouchers. |
| **18** | `studently_incomes` | `Income` | `apps.finances` | `UUIDv4` | Non-tuition revenue transactions and institutional inflow ledger. |
| **19** | `studently_expenses` | `Expense` | `apps.finances` | `UUIDv4` | Operational disbursement and expenditure general ledger. |
| **20** | `studently_system_settings` | `SystemSetting` | `apps.core` | `SmallInt` | Single-row singleton (`id=1`) institutional configuration and grading weights. |

### Architectural Distinction: Teacher vs. User Entities
1. **User (`studently_users`):** Authentication credential entity managing login (`email`), password hash, session security, active status, and administrative role (`ADMIN` vs `TEACHER`).
2. **Teacher (`studently_teachers`):** Academic employment entity storing faculty profile data (qualifications, designation, joining date, contact info).
3. **Uncoupled Lifecycle:** A faculty member can exist in the teacher directory before receiving a web login. Unlinking or deactivating a login account (`User.teacher_id -> studently_teachers.id`, `ON DELETE SET NULL`) preserves the teacher's historical exam marks, class schedules, and attendance records permanently.

---

## 3. Primary Key Architecture & Physical Storage

| Metric | Specification | SQLite Implementation (Dev) | MySQL 8.0.16+ InnoDB (Prod) |
| :--- | :--- | :--- | :--- |
| **UUID Entities (19 Tables)** | `models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)` | `TEXT` (`char(32)`). Secondary auxiliary unique index over internal 64-bit `rowid`. Non-clustered. | `CHAR(32)`. Forms the **clustered primary key index** directly containing leaf row data. (DRF formats as 36-char hyphenated string). |
| **Singleton Entity (1 Table)** | `models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)` | `INTEGER PRIMARY KEY`. Serves directly as the native 64-bit signed integer `rowid` alias. | `SMALLINT UNSIGNED`. Forms the **clustered primary key index** directly containing leaf row data. |
| **Security Scope** | Opaque identifier preventing sequential enumeration | Does NOT replace server-side authorization or prevent automated scraping. | Mandates JWT authentication, DRF permission classes, scoped querysets, rate limiting, and audit logs. |

---

## 4. Comprehensive Foreign Key Matrix & Exact `db_column` Mappings (32 Foreign Keys)

Every ForeignKey in the system is explicitly defined with `db_column` to prevent Django's default `_id` suffix from creating mismatched schema columns.

| # | Model Class | Attribute Name | Physical `db_column` | Target Model Class | Target Table | On-Delete Action | Cardinality |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | `User` | `teacher` | `teacher_id` | `Teacher` | `studently_teachers` | `SET_NULL` | 0..1 : 1 |
| **2** | `UserPermission` | `user` | `user_id` | `User` | `studently_users` | `CASCADE` | N : 1 |
| **3** | `Classroom` | `teacher` | `teacher_id` | `Teacher` | `studently_teachers` | `SET_NULL` | 0..1 : 1 |
| **4** | `Subject` | `classroom` | `class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **5** | `TeacherClassAssignment` | `teacher` | `teacher_id` | `Teacher` | `studently_teachers` | `CASCADE` | N : 1 |
| **6** | `TeacherClassAssignment` | `classroom` | `class_id` | `Classroom` | `studently_classes` | `CASCADE` | N : 1 |
| **7** | `TeacherSubjectAssignment`| `teacher` | `teacher_id` | `Teacher` | `studently_teachers` | `CASCADE` | N : 1 |
| **8** | `TeacherSubjectAssignment`| `subject` | `subject_id` | `Subject` | `studently_subjects` | `CASCADE` | N : 1 |
| **9** | `Student` | `classroom` | `class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **10** | `PromotionHistory` | `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **11** | `PromotionHistory` | `previous_classroom` | `previous_class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **12** | `PromotionHistory` | `new_classroom` | `new_class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **13** | `PromotionHistory` | `promoted_by` | `promoted_by_user_id` | `User` | `studently_users` | `RESTRICT` | N : 1 |
| **14** | `AttendanceRecord` | `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **15** | `AttendanceRecord` | `classroom` | `class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **16** | `AttendanceRecord` | `teacher` | `teacher_id` | `Teacher` | `studently_teachers` | `SET_NULL` | N : 0..1 |
| **17** | `Examination` | `classroom` | `class_id` | `Classroom` | `studently_classes` | `RESTRICT` | N : 1 |
| **18** | `ExaminationStudentSummary`| `examination` | `examination_id` | `Examination` | `studently_examinations`| `CASCADE` | N : 1 |
| **19** | `ExaminationStudentSummary`| `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **20** | `ExaminationMark` | `examination` | `examination_id` | `Examination` | `studently_examinations`| `CASCADE` | N : 1 |
| **21** | `ExaminationMark` | `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **22** | `ExaminationMark` | `subject` | `subject_id` | `Subject` | `studently_subjects` | `RESTRICT` | N : 1 |
| **23** | `ExaminationMark` | `recorded_by` | `recorded_by_teacher_id`| `Teacher`| `studently_teachers`| `SET_NULL` | N : 0..1 |
| **24** | `StudentInvoice` | `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **25** | `InvoiceItem` | `invoice` | `invoice_id` | `StudentInvoice`| `studently_student_invoices`| `CASCADE`| N : 1 |
| **26** | `InvoiceItem` | `fee_structure`| `fee_structure_id` | `FeeStructure` | `studently_fee_structures` | `RESTRICT` | N : 1 |
| **27** | `StudentPayment` | `invoice` | `invoice_id` | `StudentInvoice`| `studently_student_invoices`| `RESTRICT`| N : 0..1 |
| **28** | `StudentPayment` | `student` | `student_id` | `Student` | `studently_students` | `RESTRICT` | N : 1 |
| **29** | `StudentPayment` | `recorded_by` | `recorded_by_user_id` | `User` | `studently_users` | `RESTRICT` | N : 1 |
| **30** | `StudentPayment` | `reversed_payment` | `reversed_payment_id` | `StudentPayment`| `studently_student_payments`| `RESTRICT`| N : 0..1 |
| **31** | `Income` | `recorded_by` | `recorded_by_user_id` | `User` | `studently_users` | `SET_NULL` | N : 0..1 |
| **32** | `Expense` | `recorded_by` | `recorded_by_user_id` | `User` | `studently_users` | `SET_NULL` | N : 0..1 |

---

## 5. Exhaustive Database CHECK Constraints Matrix (35 Explicit Constraints)

All 35 constraints below are declared directly in Django ORM via `models.CheckConstraint` in `class Meta.constraints`, generating native SQL `CHECK` constraints on SQLite 3.35+ and MySQL 8.0.16+.

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

## 6. Master Unique Constraints Matrix (17 Unique Constraints)

| # | Physical Table Name | Constraint Name | Constrained Column(s) | Business Invariant Enforced |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `studently_users` | `unique_user_email` | `email` | User login emails must be globally unique. |
| **2** | `studently_user_permissions` | `unique_user_module_permission` | `user_id, module` | Exactly one permission configuration per user per module. |
| **3** | `studently_teachers` | `unique_teacher_email` | `email` | Faculty member emails must be unique in directory. |
| **4** | `studently_classes` | `unique_class_section_year` | `name, section, academic_year` | Prevents duplicate classroom cohorts in same year. |
| **5** | `studently_subjects` | `unique_class_subject_code` | `class_id, code` | Subject code unique within a classroom. |
| **6** | `studently_teacher_class_assignments` | `unique_teacher_class_assignment` | `teacher_id, class_id` | Prevents duplicate teacher assignment to same class. |
| **7** | `studently_teacher_subject_assignments`| `unique_teacher_subject_assignment`| `teacher_id, subject_id` | Prevents duplicate teacher assignment to same subject. |
| **8** | `studently_students` | `unique_student_admission_number` | `admission_number` | Admission numbers (`STD-XXXX`) must be globally unique. |
| **9** | `studently_attendance` | `unique_student_daily_attendance` | `student_id, date` | Exactly one roll call record per student per calendar day. |
| **10** | `studently_examinations` | `unique_class_exam_session` | `class_id, exam_type, academic_year, term` | Exactly one exam session header per class/type/term. |
| **11** | `studently_examination_student_summaries` | `unique_exam_student_summary` | `examination_id, student_id` | Exactly one aggregate summary per student per exam session. |
| **12** | `studently_examination_marks` | `unique_exam_student_subject_mark` | `examination_id, student_id, subject_id` | Exactly one grade score per student per subject per exam. |
| **13** | `studently_fee_structures` | `unique_fee_structure_code` | `code` | Fee structure standard codes must be unique. |
| **14** | `studently_student_invoices` | `unique_invoice_number` | `invoice_number` | Invoices (`INV-YYYY-MM-XXXX`) must be unique. |
| **15** | `studently_student_invoices` | `unique_student_month_invoice` | `student_id, month` | Exactly one tuition invoice per student per month (`YYYY-MM`). |
| **16** | `studently_student_payments` | `unique_receipt_number` | `receipt_number` | Receipt numbers (`REC-YYYY-MM-XXXX`) must be unique. |
| **17** | `studently_student_payments` | `unique_payment_method_transaction_ref` | `payment_method, transaction_ref` | Enforces durable global-per-method idempotency for both Mobile Money (`ZAAD`, `eDahab`) and `Cash` (`CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`). |

---

## 7. Master Database Index Inventory

Per `MEDIUM-01` (`DATABASE_CONSTRAINTS_AND_INDEXES.md` Section 6), the database index inventory is strictly segregated into three tiers — **Declared Application Indexes**, **Database-Generated & Constraint Index References (prior to DB deduplication)**, and **Physical Database Indexes on Disk (`NOT VERIFIED` pending Phase 3 migrations and `SHOW INDEX` introspection)**:

```
Declared Application Indexes:                  25 Explicit B-Tree Indexes (18 db_index + 7 Meta.indexes)
Potential Index References (Pre-Deduplication): 94 Theoretical References
├── Primary Key Indexes (20 References: 19 UUID + 1 Integer Singleton)
├── Unique Constraint Indexes (17 References: 6 Single-Column + 11 Composite)
├── Explicit Application B-Tree Indexes (25 Declared Indexes: 18 Single-Column + 7 Composite)
└── Automatically Generated ForeignKey Indexes (32 Theoretical Django ORM FK Declarations)
Physical Database Indexes on Disk:             NOT VERIFIED (Pending Phase 3 migrations & SHOW INDEX)
```

### 7.1. Explicit Application B-Tree Indexes (25 Indexes Total)

#### A. Single-Column Application B-Tree Indexes (18 Indexes via `db_index=True`)
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

*(Note: Duplicate `db_index=True` declarations on unique columns `User.email`, `Teacher.email`, `Student.admission_number`, `StudentInvoice.invoice_number`, and `StudentPayment.receipt_number` have been eliminated to avoid redundant index maintenance).*

#### B. Composite Multi-Column Application B-Tree Indexes (7 Indexes via `Meta.indexes`)
1. `idx_student_class_status` on `studently_students(class_id, status)`
2. `idx_attendance_class_date` on `studently_attendance(class_id, date)`
3. `idx_exam_class_year` on `studently_examinations(class_id, academic_year)`
4. `idx_marks_exam_subject` on `studently_examination_marks(examination_id, subject_id)`
5. `idx_invoice_student_status` on `studently_student_invoices(student_id, status)`
6. `idx_payment_student_date` on `studently_student_payments(student_id, payment_date)`
7. `idx_income_cat_date` on `studently_incomes(category, date)`

---

## 8. Payment Ledger Immutability & Financial Invariant Engine

### Architectural Ledger Invariants
1. **Positive Magnitude Model:** All vouchers store amounts as strictly positive numbers (`amount_paid > 0.00`). Money flow direction is determined strictly by `transaction_type`.
2. **Reversals (100% Voiding):**
   - Must be 100% full reversal (`reversal.amount_paid == original_payment.amount_paid`).
   - Partial reversals are strictly prohibited.
   - An original voucher can be reversed at most once.
   - A reversal cannot be refunded, and a payment with existing refunds cannot be reversed.
   - Sets `is_reversal = True` and links via `reversed_payment_id`.
3. **Refunds (Full or Sequential Partial Returns):**
   - Supports single full refund or multiple partial refunds.
   - Sets `is_reversal = False` and links via `reversed_payment_id`.
   - Mathematical Refund Ceiling Formula:
     $$\sum_{i=1}^{k} \text{refund}_i.\text{amount\_paid} \le \text{original\_payment}.\text{amount\_paid} - (\text{reversal}.\text{amount\_paid} \text{ if reversed else } 0)$$
4. **Ledger Immutability Enforcement:**
   - Overriding `.delete()` raises `PermissionDenied("Payment records cannot be deleted")`.
   - Overriding `.save()` blocks updates on existing records (`if self.pk and not self._state.adding: raise PermissionDenied(...)`).
   - Production MySQL enforces SQL-level append-only immutability via `BEFORE UPDATE` (`trg_studently_payments_no_update`) and `BEFORE DELETE` (`trg_studently_payments_no_delete`) triggers on `studently_student_payments` (see `SQLITE_TO_MYSQL_MIGRATION_PLAN.md`; triggers block runtime app tampering while acknowledging root/DBA boundaries).

### Architectural Pseudocode for Domain Services

```python
# apps/finances/services.py (Architectural Pseudocode Specification)

def process_payment(*, student, invoice, fee_category, month, amount, payment_method, user, idempotency_key=None, transaction_ref=None, notes=None):
    # 1. Option A Adopted: New operational payments MUST reference an active invoice
    if invoice is None:
        raise ValidationError("An active invoice is required for all new operational payments (Option A).")
    amount = Decimal(amount)
    if amount <= Decimal('0.00'):
        raise ValidationError("Payment amount must be strictly positive.")

    # 2. Durable Idempotency (MEDIUM-02-A): Derive CASH-IDEM-<NORMALIZED_KEY> BEFORE lookups & insert
    resolved_ref = derive_cash_transaction_ref(idempotency_key) if payment_method == 'Cash' else str(transaction_ref or '').strip()
    if not resolved_ref or len(resolved_ref) > 100:
        raise ValidationError("A valid transaction reference (<= 100 chars) or Idempotency-Key is required.")

    # 3. Build canonical logical payload fingerprint
    payload_fingerprint = _build_logical_payment_fingerprint(
        student=student, invoice=invoice, fee_category=fee_category,
        month=month, amount=amount, payment_method=payment_method,
    )

    # 4. Initial persistent duplicate lookup (prior to acquiring invoice lock)
    existing = _find_existing_payment(payment_method=payment_method, transaction_ref=resolved_ref)
    if existing is not None:
        return _validate_and_return_existing(existing, payload_fingerprint)

    # 5. Begin atomic transaction & acquire pessimistic row lock on target invoice
    with transaction.atomic():
        invoice_obj = StudentInvoice.objects.select_for_update().get(id=invoice.id)

        # 6. Validate cross-entity invoice ownership
        if str(invoice_obj.student_id) != str(student.id):
            raise ValidationError("Invoice student mismatch.")

        # 7. MANDATORY SECOND DUPLICATE LOOKUP (CONC-01: Current/Locking Read)
        # MUST occur after invoice lock & ownership check, and BEFORE balance calculation/validation.
        # Under MySQL InnoDB REPEATABLE READ, select_for_update() bypasses the MVCC snapshot.
        existing = _find_existing_payment_current_read(payment_method=payment_method, transaction_ref=resolved_ref)
        if existing is not None:
            return _validate_and_return_existing(existing, payload_fingerprint)

        # 8. Validate invoice status & outstanding balance ceiling (only when no duplicate exists)
        if invoice_obj.status == 'Cancelled':
            raise ValidationError("Cannot post payment to a Cancelled invoice.")
        remaining_balance = invoice_obj.total_amount_due - invoice_obj.total_amount_paid
        if remaining_balance <= Decimal('0.00'):
            raise ValidationError("This invoice has no remaining outstanding balance.")
        if amount > remaining_balance:
            raise ValidationError("Payment amount exceeds remaining invoice balance.")

        # 9. Atomic insert inside nested savepoint for UNIQUE(payment_method, transaction_ref) race recovery
        payment = StudentPayment(
            receipt_number=generate_receipt_number(),
            invoice=invoice_obj,
            student=student,
            fee_category=fee_category,
            month=month,
            amount_due=invoice_obj.total_amount_due,
            amount_paid=amount,
            payment_method=payment_method,
            payment_date=timezone.now().date(),
            transaction_ref=resolved_ref,
            recorded_by=user,
            transaction_type='Payment',
            is_reversal=False,
            notes=notes
        )
        try:
            with transaction.atomic():  # Inner savepoint isolates failed insert so outer tx remains usable
                payment.save()
        except IntegrityError as exc:
            # CONC-02: Recover ONLY from UNIQUE(payment_method, transaction_ref) via current/locking read
            if not _is_payment_ref_unique_violation(exc):
                raise  # Never suppress unrelated IntegrityError
            raced = _find_existing_payment_current_read(payment_method=payment_method, transaction_ref=resolved_ref)
            if raced is not None:
                return _validate_and_return_existing(raced, payload_fingerprint, cause=exc)
            raise

        # 10. Reconcile invoice ONLY for the single winning insert
        reconcile_invoice(invoice_id=invoice_obj.id)
        return payment, True

@transaction.atomic
def reverse_payment(*, original_payment_id, user, reason):
    orig = StudentPayment.objects.select_for_update().get(id=original_payment_id)
    if orig.transaction_type != 'Payment':
        raise ValidationError("Only standard payments can be reversed.")
    if orig.reversal_transactions.filter(transaction_type='Reversal').exists():
        raise ValidationError("Payment already reversed.")
    if orig.reversal_transactions.filter(transaction_type='Refund').exists():
        raise ValidationError("Cannot reverse payment with active refunds.")

    reversal = StudentPayment(
        receipt_number=f"REV-{orig.receipt_number}",
        invoice=orig.invoice,
        student=orig.student,
        fee_category=orig.fee_category,
        month=orig.month,
        amount_due=orig.amount_due,
        amount_paid=orig.amount_paid,  # Exactly 100% of original
        payment_method=orig.payment_method,
        payment_date=timezone.now().date(),
        transaction_ref=f"REV-{orig.transaction_ref}",
        recorded_by=user,
        transaction_type='Reversal',
        is_reversal=True,
        reversed_payment=orig,
        reversal_reason=reason
    )
    reversal.save()
    if orig.invoice_id:
        reconcile_invoice(invoice_id=orig.invoice_id)
    return reversal

@transaction.atomic
def process_refund(*, original_payment_id, amount, user, reason):
    orig = StudentPayment.objects.select_for_update().get(id=original_payment_id)
    if orig.transaction_type != 'Payment':
        raise ValidationError("Only standard payments can be refunded.")
    if orig.reversal_transactions.filter(transaction_type='Reversal').exists():
        raise ValidationError("Cannot refund a reversed payment.")

    refunded_sum = orig.reversal_transactions.filter(transaction_type='Refund').aggregate(
        total=models.Sum('amount_paid')
    )['total'] or Decimal('0.00')

    max_refundable = orig.amount_paid - refunded_sum
    if amount > max_refundable:
        raise ValidationError(f"Requested refund (${amount}) exceeds refundable ceiling (${max_refundable}).")

    seq = orig.reversal_transactions.filter(transaction_type='Refund').count() + 1
    refund = StudentPayment(
        receipt_number=f"REF-{orig.receipt_number}-{seq}",
        invoice=orig.invoice,
        student=orig.student,
        fee_category=orig.fee_category,
        month=orig.month,
        amount_due=orig.amount_due,
        amount_paid=amount,
        payment_method=orig.payment_method,
        payment_date=timezone.now().date(),
        transaction_ref=f"REF-{orig.transaction_ref}-{seq}",
        recorded_by=user,
        transaction_type='Refund',
        is_reversal=False,
        reversed_payment=orig,
        reversal_reason=reason
    )
    refund.save()
    if orig.invoice_id:
        reconcile_invoice(invoice_id=orig.invoice_id)
    return refund

@transaction.atomic
def reconcile_invoice(*, invoice_id):
    invoice = StudentInvoice.objects.select_for_update().get(id=invoice_id)
    if invoice.status == 'Cancelled':
        raise ValidationError("Cannot reconcile a Cancelled invoice.")

    inflow = StudentPayment.objects.filter(invoice=invoice, transaction_type='Payment').aggregate(
        s=models.Sum('amount_paid')
    )['s'] or Decimal('0.00')
    reversed_amt = StudentPayment.objects.filter(invoice=invoice, transaction_type='Reversal').aggregate(
        s=models.Sum('amount_paid')
    )['s'] or Decimal('0.00')
    refunded_amt = StudentPayment.objects.filter(invoice=invoice, transaction_type='Refund').aggregate(
        s=models.Sum('amount_paid')
    )['s'] or Decimal('0.00')

    net_settled = max(Decimal('0.00'), inflow - reversed_amt - refunded_amt)
    invoice.total_amount_paid = net_settled
    invoice.reconcile_status()
    invoice.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
    return invoice
```

---

## 9. Validation Hierarchy & Write-Path Defense

Because Django ORM methods `bulk_create()`, `QuerySet.update()`, and raw SQL bypass model-level `.clean()` and `.save()`, business integrity is enforced through four defensive layers:

```
[ Tier 1: Database Engine ]  -> CHECK constraints, ForeignKeys (ON DELETE RESTRICT), Unique constraints.
[ Tier 2: Model Layer ]      -> full_clean() in save(), delete() override, clean() validation logic.
[ Tier 3: Serializer Layer ] -> DRF ModelSerializers validating input payloads before calling models.
[ Tier 4: Service Layer ]    -> apps.*.services orchestrating multi-entity atomic transactions & locks.
```

---

## 10. Engine Compatibility & Post-Cutover Disaster Recovery Protocols

### Dual-Engine Concurrency
- **Development (SQLite 3.35+):** File-level write locking with `busy_timeout = 5000`. Does **NOT** support row-level locks; Django compiles `select_for_update()` as a plain `SELECT`. Cannot certify MySQL `REPEATABLE READ` row-locking concurrency behavior.
- **Production (MySQL 8.0.16+ InnoDB, default `REPEATABLE READ`):** Fine-grained row-level index locking via current reads (`SELECT ... FOR UPDATE`). Used for `StudentInvoice` row locking, the mandatory post-lock duplicate lookup (`CONC-01`), and post-`IntegrityError` unique-constraint race recovery (`CONC-02`), bypassing MVCC snapshots without changing the production isolation level.
- **Valid SQL Mode:** `STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION` (obsolete `NO_AUTO_CREATE_USER` removed).

### Post-Cutover Disaster Recovery Directive
> [!CAUTION]
> **STRICT BAN ON RESTORING PRE-CUTOVER SQLITE SNAPSHOT AFTER LIVE WRITES**  
> Once production cutover has executed and new transactions (payments, enrollments, roll calls, marks) have been recorded in MySQL, restoring the pre-cutover SQLite database is strictly prohibited. Recovery must follow either:
> 1. **Forward-Fix Protocol (Primary):** Apply hotfix migrations directly to MySQL within atomic transactions.
> 2. **Delta-Replay Protocol (Catastrophic Engine Failure):** Freeze MySQL tables, extract all delta records committed after $T_{\text{cutover}}$, and replay them into the fallback engine via Django ORM service functions.

---

## 11. Final Compliance & Sign-Off Verification Matrix

| Audit Dimension | Target Invariant | Architecture Status | Verification Verdict |
| :--- | :--- | :---: | :---: |
| **Physical Application Tables** | Exactly 20 canonical application domain tables | Fully Reconciled | **PASS** |
| **Relational Foreign Keys** | 31 cross-table FKs + 1 self-referential FK = 32 FKs | Fully Reconciled | **PASS** |
| **Explicit Column Mappings** | `db_column` declared on all 32 ForeignKeys | Fully Reconciled | **PASS** |
| **CHECK Constraints** | Exactly 35 explicit `models.CheckConstraint` | Fully Reconciled | **PASS** |
| **Unique Constraints** | Exactly 17 unique constraints (6 single + 11 composite) | Fully Reconciled | **PASS** |
| **Index Inventory** | 25 Explicit Application Indexes (18 `db_index` + 7 `Meta.indexes`); physical index count `NOT VERIFIED` pending Phase 3 introspection | Fully Reconciled | **PASS** |
| **Primary Key Architecture** | 19 UUID PKs + 1 Integer singleton PK (`id=1`) | Fully Reconciled | **PASS** |
| **Engine Storage Semantics** | SQLite rowid auxiliary index vs MySQL InnoDB clustered index; char(32) physical storage | Fully Reconciled | **PASS** |
| **PermissionsMixin & RBAC** | Omitted from User; 14-module RBAC with active check and teacher ceiling | Fully Reconciled | **PASS** |
| **Payment Ledger & Ownership** | Option A adopted (mandatory invoice for new ops; Option B unsupported under frozen 20-table schema); durable `CASH-IDEM-<KEY>` idempotency (global per method); post-lock current-read duplicate lookup (`CONC-01`); MySQL `REPEATABLE READ` current-read savepoint race recovery (`CONC-02`); balance ceiling & append-only immutability | Fully Reconciled | **PASS** |
| **Least-Privilege DB Accounts** | Dedicated runtime app, migration, and backup accounts + ledger immutability triggers | Fully Reconciled | **PASS** |
| **Migration Safety & Recovery** | MySQL 8.0.16+, valid sql_mode, zero-loss post-cutover protocols | Fully Reconciled | **PASS** |
| **Phase 1 Business Rules** | 100% preservation of student contract, ranking, assignments | Fully Reconciled | **PASS** |

---

## 12. Architectural Sign-Off Status

```
===================================================================================
FINAL PHASE 2 ARCHITECTURE SPECIFICATION STATUS:
[x] All 22 Phase 2 Markdown Documents Updated & Synchronized on Disk
[x] Zero Application Source Code Modified
[x] Zero Django Models, Serializers, Views, or Migrations Implemented in Code
[x] Zero External Packages Installed
[x] Phase 3 Implementation Held Until Formal External Sign-Off

STATUS: READY FOR FORMAL PHASE 2 APPROVAL (Pending Stakeholder Sign-Off & 3 Deferred Business Decisions)
===================================================================================
```
