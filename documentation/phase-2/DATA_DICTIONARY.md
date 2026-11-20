# STUDENTLY — Comprehensive Database Data Dictionary
**Document:** `DATA_DICTIONARY.md`  
**Phase:** Phase 2 — Database Architecture & Design  
**Author:** Senior Database Architect & Application Security Auditor  
**Date:** November 2026  
**Status:** Architecture Specification — Pending Stakeholder Sign-Off  

---

## 1. Overview & Conventions

This data dictionary defines every table, column, data type, key constraint, default value, and validation rule for the **STUDENTLY** relational database.

### Column Mapping Conventions
- **Django ORM:** Python field class (`models.UUIDField`, `models.CharField`, `models.DecimalField`, etc.).
- **SQLite Engine:** Native SQLite type affinity (`TEXT`, `INTEGER`, `REAL`). Note on UUIDs: Django's SQLite backend declares `char(32)`, which SQLite gives `TEXT` type affinity (stores 32 hexadecimal ASCII characters without hyphens).
- **MySQL 8.0 Engine:** Production column specification (`CHAR(32)` for UUIDs via Django ORM migration DDL, `VARCHAR(n)`, `DECIMAL(10,2)`, `TINYINT(1)`, etc.). Note: Standard Django `models.UUIDField` uses `char(32)` to store stripped hex strings; dedicated `BINARY(16)` storage is not natively used by standard Django ORM without custom field extensions and is unnecessary at school operational volume.
- **DRF Serialization:** Django REST Framework automatically formats `uuid.UUID` values as standard 36-character hyphenated RFC 4122 strings (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), preserving full contract compatibility with the Vanilla JavaScript frontend.
- **Char Encoding:** `utf8mb4` with collation `utf8mb4_unicode_ci` across all MySQL tables.

---

## 2. Table Specifications

### 2.1. Table: `studently_users`
- **Description:** System authentication accounts for administrators and teaching faculty. Replaces plaintext prototype storage.
  * *Authoritative Roles:* Strictly `ADMIN` and `TEACHER`, enforced by `CHECK(role IN ('ADMIN','TEACHER'))`.
  * *Bursar / Accountant:* An accountant or bursar is NOT a separate database role. In STUDENTLY, an accountant is an `ADMIN` user with dedicated financial permissions in `studently_user_permissions`.
  * *Superuser:* Standardized as `is_superuser = TRUE` on the user account (avoiding ambiguous labels like `SUPERADMIN` or `SUPER_ADMIN`).
- **Django Model:** `User` (subclass of `AbstractBaseUser` without `PermissionsMixin`; implements `is_staff`, `is_superuser`, and custom module permission bridges).

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Immutable internal identifier. |
| `email` | `EmailField` | `TEXT` | `VARCHAR(254)` | No | *None* | **UK** | Valid email, lowercase | Login username and communication handle. |
| `full_name` | `CharField` | `TEXT` | `VARCHAR(150)` | No | *None* | — | Max length 150 | Display name across header and audit trails. |
| `password` | `CharField` | `TEXT` | `VARCHAR(255)` | No | *None* | — | PBKDF2/Argon2 hash | Cryptographically salted password hash. |
| `role` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'TEACHER'` | — | `CHECK(role IN ('ADMIN','TEACHER'))` | Primary role discriminator. |
| `teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_teachers(id)` | Links user account to academic teacher profile. |
| `status` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Active'` | — | `CHECK(status IN ('Active','Deactivated'))` | Controls system login eligibility. |
| `is_active` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `TRUE` | — | Django standard flag | Django auth framework active user flag. |
| `is_staff` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Django standard flag | Grants access to Django admin console (Admin role only). |
| `is_superuser` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Institutional Superuser flag | Unrestricted system-wide authorization for active superusers. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Account creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last profile update timestamp. |

---

### 2.2. Table: `studently_user_permissions`
- **Description:** Granular per-user permission overrides across modules and actions.
- **Django Model:** `UserPermission`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `user_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_users(id)` `ON DELETE CASCADE` | Parent user account. |
| `module` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | — | `CHECK(module IN ('students', 'attendance', 'examinations', 'reports', 'fees', 'payments', 'income', 'expenses', 'teachers', 'classes', 'subjects', 'users', 'certificates', 'settings'))` | Target functional module. |
| `can_view` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Read permission for the module. |
| `can_add` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Creation permission for records in module. |
| `can_edit` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Update/revision permission. |
| `can_delete`| `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Deletion permission. |
| `can_import`| `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Spreadsheet bulk import permission. |
| `can_print` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | Printable layout generation permission. |
| `can_export`| `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `FALSE` | — | Boolean flag | CSV / Excel file export permission. |

*Table Constraints & Architecture:*
- `UNIQUE(user_id, module)`
- `CHECK(module IN ('students', 'attendance', 'examinations', 'reports', 'fees', 'payments', 'income', 'expenses', 'teachers', 'classes', 'subjects', 'users', 'certificates', 'settings'))`
- *Validation Layering:* Django model choices (`MODULE_CHOICES` containing all 14 modules) provide application-level form and serializer validation, while the SQL CHECK constraint provides relational database-level enforcement.

---

### 2.3. Table: `studently_teachers`
- **Description:** Academic faculty directory, specialization, and employment contact information.
- **Django Model:** `Teacher`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Internal primary key. |
| `full_name` | `CharField` | `TEXT` | `VARCHAR(150)` | No | *None* | — | Max length 150 | Full legal name of the faculty member. |
| `email` | `EmailField` | `TEXT` | `VARCHAR(254)` | No | *None* | **UK** | Valid email | Institutional contact email. |
| `phone` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | — | Max length 30 | Faculty telephone number. |
| `account_status`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Active'` | — | `CHECK(account_status IN ('Active','Deactivated'))` | Active teaching status. |
| `specialization`| `CharField` | `TEXT` | `VARCHAR(150)` | Yes | `NULL` | — | Max length 150 | Teaching discipline (e.g. STEM, Humanities). |
| `joined_date`| `DateField` | `TEXT` | `DATE` | No | *None* | — | `YYYY-MM-DD` | Date joined faculty. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Record creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Record update timestamp. |

---

### 2.4. Table: `studently_classes`
- **Description:** Classrooms, cohort sections, room assignments, and enrollment capacities.
- **Django Model:** `Classroom`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `name` | `CharField` | `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "Grade 1", "Grade 2" | Grade or level name. |
| `section` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'A'` | — | e.g. "A", "B", "C" | Section stream identifier. |
| `room` | `CharField` | `TEXT` | `VARCHAR(50)` | Yes | `NULL` | — | e.g. "Room 101" | Physical classroom location. |
| `capacity` | `PositiveIntegerField` | `INTEGER` | `INT UNSIGNED` | No | `30` | — | `CHECK(capacity > 0)` | Maximum student enrollment capacity. |
| `academic_year`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'2026-2027'` | — | Format: `YYYY-YYYY` | Academic calendar year. |
| `teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_teachers(id)` `ON DELETE SET NULL` | Assigned homeroom teacher (single administrative/pastoral lead; co-teaching handled via assignment tables). |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Update timestamp. |

*Table Constraint:* `UNIQUE(name, section, academic_year)`.

---

### 2.5. Table: `studently_subjects`
- **Description:** Curriculum subjects configured per class with maximum grading marks.
- **Django Model:** `Subject`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Parent class offering this subject. |
| `name` | `CharField` | `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "Mathematics" | Subject curriculum title. |
| `code` | `CharField` | `TEXT` | `VARCHAR(30)` | Yes | `NULL` | — | Uppercase, e.g. "MATH101" | Short syllabus or catalog code. |
| `max_marks` | `PositiveIntegerField` | `INTEGER` | `INT UNSIGNED` | No | `100` | — | `CHECK(max_marks > 0)` | Maximum achievable score in exams. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Update timestamp. |

*Table Constraint:* `UNIQUE(class_id, code)`.

---

### 2.6. Table: `studently_teacher_class_assignments`
- **Description:** Relational junction table mapping multiple teachers to assigned classes.
- **Django Model:** `TeacherClassAssignment`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_teachers(id)` `ON DELETE CASCADE` | Assigned teacher. |
| `class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE CASCADE` | Assigned class. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Assignment timestamp. |

*Table Constraint:* `UNIQUE(teacher_id, class_id)`.

---

### 2.7. Table: `studently_teacher_subject_assignments`
- **Description:** Relational junction table mapping teachers to curriculum subjects.
- **Django Model:** `TeacherSubjectAssignment`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_teachers(id)` `ON DELETE CASCADE` | Teaching faculty member. |
| `subject_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_subjects(id)` `ON DELETE CASCADE` | Assigned subject. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Assignment timestamp. |

*Table Constraint:* `UNIQUE(teacher_id, subject_id)`.

---

### 2.8. Table: `studently_students`
- **Description:** Master student registry strictly preserving the audited seven-field contract from Phase 1 (`admission_number`, `full_name`, `gender`, `date_of_birth`, `parent_phone`, `class_id`, `registration_date`), with an architectural `status` lifecycle extension for soft deletion and graduation tracking.
- **Django Model:** `Student`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Internal primary key. |
| `admission_number`| `CharField` | `TEXT` | `VARCHAR(36)` | No | *None* | **UK** | Format `/STD-(\d+)/` | Human-facing Student ID (Field 1). |
| `full_name` | `CharField` | `TEXT` | `VARCHAR(150)` | No | *None* | — | Max length 150, trimmed | Student full legal name (Field 2). |
| `gender` | `CharField` | `TEXT` | `VARCHAR(10)` | No | *None* | — | `CHECK(gender IN ('Male','Female'))` | Demographic gender (Field 3). |
| `date_of_birth`| `DateField` | `TEXT` | `DATE` | No | *None* | — | `YYYY-MM-DD` | Date of birth (Field 4). |
| `parent_phone` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | — | Max length 30 | Primary guardian phone (Field 5). |
| `class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Currently enrolled class (Field 6). |
| `registration_date`| `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Initial admission date (Field 7). |
| `status` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Active'` | — | `CHECK(status IN ('Active','Withdrawn','Graduated','Suspended'))` | Student lifecycle status. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Record creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last profile update timestamp. |

---

### 2.9. Table: `studently_attendance`
- **Description:** Daily student attendance tracking with status permissions and excuse documentation.
- **Django Model:** `AttendanceRecord`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Enrolled student. |
| `class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Class at time of roll call. |
| `teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_teachers(id)` `ON DELETE SET NULL` | Teacher who conducted roll call. |
| `date` | `DateField` | `TEXT` | `DATE` | No | *None* | — | `YYYY-MM-DD` | Attendance calendar date. |
| `status` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Present'` | — | `CHECK(status IN ('Present','Absent','Excused'))` | Daily attendance status. |
| `excused_reason`| `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Mandatory if status='Excused' | Formal doctor/parent excuse note. |
| `recorded_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | First recording timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Modification timestamp. |

*Table Constraint:* `UNIQUE(student_id, date)`.

---

### 2.10. Table: `studently_examinations`
- **Description:** Master examination session headers scoped by class, type, year, and term.
- **Django Model:** `Examination`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Target class examined. |
| `exam_type` | `CharField` | `TEXT` | `VARCHAR(20)` | No | *None* | — | `CHECK(exam_type IN ('Midterm','Final'))` | Exam session category. |
| `academic_year`| `CharField` | `TEXT` | `VARCHAR(20)` | No | *None* | — | e.g. "2026-2027" | Academic calendar year. |
| `term` | `CharField` | `TEXT` | `VARCHAR(20)` | No | *None* | — | `CHECK(term IN ('Term 1','Term 2','Term 3'))` | Academic term period. |
| `recorded_date`| `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Date exam session commenced. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Record creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last spreadsheet edit timestamp. |

*Table Constraint:* `UNIQUE(class_id, exam_type, academic_year, term)`.

---

### 2.11. Table: `studently_examination_student_summaries`
- **Description:** Aggregated session scores and Admin-only activity marks per student per exam session.
- **Django Model:** `ExaminationStudentSummary`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `examination_id`| `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_examinations(id)` `ON DELETE CASCADE` | Parent exam session. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Target student. |
| `activity_score`| `DecimalField`| `REAL` | `DECIMAL(5,2)` | Yes | `NULL` | — | `CHECK(activity_score >= 0.00)` | Admin-only co-curricular points. |
| `total_score` | `DecimalField`| `REAL` | `DECIMAL(6,2)` | No | `0.00` | — | `CHECK(total_score >= 0.00)` | Materialized session total. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last calculation timestamp. |

*Table Constraint:* `UNIQUE(examination_id, student_id)`.

---

### 2.12. Table: `studently_examination_marks`
- **Description:** Normalized individual subject score rows. Replaces nested prototype JSON map.
- **Django Model:** `ExaminationMark`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `examination_id`| `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_examinations(id)` `ON DELETE CASCADE` | Parent exam session. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Graded student. |
| `subject_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_subjects(id)` `ON DELETE RESTRICT` | Curriculum subject graded. |
| `score` | `DecimalField`| `REAL` | `DECIMAL(5,2)` | No | *None* | — | `CHECK(score >= 0.00)` | Numeric score earned. |
| `recorded_by_teacher_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_teachers(id)` `ON DELETE SET NULL` | Teacher who entered mark. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last grade update timestamp. |

*Table Constraint:* `UNIQUE(examination_id, student_id, subject_id)`.

---

### 2.13. Table: `studently_promotions`
- **Description:** Permanent historical audit log of student grade advancements.
- **Django Model:** `PromotionHistory`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Promoted student. |
| `previous_class_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Source classroom cohort. |
| `new_class_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_classes(id)` `ON DELETE RESTRICT` | Destination classroom cohort. |
| `academic_year`| `CharField` | `TEXT` | `VARCHAR(20)` | No | *None* | — | Academic year completed | Academic year of promotion. |
| `promoted_date`| `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Date promotion was committed. |
| `promoted_by_user_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_users(id)` `ON DELETE RESTRICT` | Admin who authorized action. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Audit timestamp. |

---

### 2.14. Table: `studently_fee_structures`
- **Description:** Standard catalog of institutional tuition fees and auxiliary rates.
- **Django Model:** `FeeStructure`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `name` | `CharField` | `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "Class Monthly Tuition" | Fee title. |
| `code` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | **UK** | Uppercase, e.g. "CLASS_FEE" | Standard fee code. |
| `fee_category` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | — | `CHECK(fee_category IN ('Class Fee','School Fee','Registration','Other'))` | Fee category group. |
| `default_amount`| `DecimalField`| `REAL` | `DECIMAL(10,2)`| No | `0.00` | — | `CHECK(default_amount >= 0.00)` | Standard billing rate. |
| `currency` | `CharField` | `TEXT` | `VARCHAR(10)` | No | `'$'` | — | Currency symbol or ISO | Monetary currency unit. |
| `billing_frequency`| `CharField`| `TEXT` | `VARCHAR(20)` | No | `'Monthly'` | — | `CHECK(billing_frequency IN ('Monthly', 'Termly', 'Annually', 'One-Time'))` | Billing recurrence rule. |
| `is_active` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `TRUE` | — | Boolean flag | Active billing flag. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Update timestamp. |

*Table Constraints:*
- `UNIQUE(code)`
- `CHECK(fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other'))`
- `CHECK(default_amount >= 0.00)`

---

### 2.15. Table: `studently_student_invoices`
- **Description:** Materialized monthly student fee invoices. Replaces ad-hoc dynamic obligation calculations.
- **Django Model:** `StudentInvoice`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `invoice_number`| `CharField` | `TEXT` | `VARCHAR(50)` | No | *None* | **UK** | Format `INV-YYYY-MM-XXXX` | Human-facing invoice number. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Billed student. |
| `month` | `CharField` | `TEXT` | `VARCHAR(7)` | No | *None* | — | Format `YYYY-MM` | Billing calendar month. |
| `total_amount_due`| `DecimalField`| `REAL`| `DECIMAL(10,2)`| No | `0.00` | — | `CHECK(total_amount_due >= 0.00)` | Total invoice obligation ($). |
| `total_amount_paid`| `DecimalField`| `REAL`| `DECIMAL(10,2)`| No | `0.00` | — | `CHECK(total_amount_paid >= 0.00)` | Reconciled payments sum ($). |
| `status` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Unpaid'` | — | `CHECK(status IN ('Unpaid','Partially Paid','Paid','Cancelled'))` | Payment status. |
| `due_date` | `DateField` | `TEXT` | `DATE` | No | *None* | — | `YYYY-MM-DD` | Payment deadline. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Bill generation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Reconciliation update timestamp. |

*Table Constraint:* `UNIQUE(student_id, month)`.

---

### 2.16. Table: `studently_invoice_items`
- **Description:** Itemized charges for an invoice (e.g. Class Fee $45.00, School Fee $35.00).
- **Django Model:** `InvoiceItem`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `invoice_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_student_invoices(id)` `ON DELETE CASCADE` | Parent invoice. |
| `fee_structure_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_fee_structures(id)` `ON DELETE RESTRICT` | Referenced fee structure. |
| `description` | `CharField` | `TEXT` | `VARCHAR(150)` | No | *None* | — | Max length 150 | Charge line description. |
| `amount` | `DecimalField` | `REAL` | `DECIMAL(10,2)`| No | *None* | — | `CHECK(amount >= 0.00)` | Line item amount ($). |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |

*Table Constraints:*
- `CHECK(amount >= 0.00)`

---

### 2.17. Table: `studently_student_payments`
- **Description:** Immutable financial payment transactions and official receipts.
- **Django Model:** `StudentPayment`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `receipt_number`| `CharField` | `TEXT` | `VARCHAR(50)` | No | *None* | **UK** | Format `REC-YYYY-MM-XXXX` | Human-readable receipt number. |
| `invoice_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_student_invoices(id)` `ON DELETE RESTRICT` | Linked student invoice. DB-nullable strictly for Phase 1 legacy migration; **mandatory (`NOT NULL`) at API/service layer for all new operational payments (Option A)**. Never reassigned after creation. |
| `student_id` | `ForeignKey` | `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_students(id)` `ON DELETE RESTRICT` | Enrolled student. |
| `fee_category` | `CharField` | `TEXT` | `VARCHAR(30)` | No | *None* | — | `CHECK(fee_category IN ('Class Fee', 'School Fee', 'Registration', 'Other'))` | Fee target category. |
| `month` | `CharField` | `TEXT` | `VARCHAR(7)` | No | *None* | — | Format `YYYY-MM` | Accounting month. |
| `amount_due` | `DecimalField` | `REAL` | `DECIMAL(10,2)`| No | `0.00` | — | Snapshot of bill due ($) | Baseline due at payment. |
| `amount_paid` | `DecimalField` | `REAL` | `DECIMAL(10,2)`| No | *None* | — | `CHECK(amount_paid > 0.00)` | Actual monetary sum received. |
| `payment_method`| `CharField` | `TEXT` | `VARCHAR(20)` | No | *None* | — | `CHECK(payment_method IN ('Cash','ZAAD','eDahab'))` | Remittance channel. |
| `payment_date` | `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Date payment received. |
| `transaction_ref`| `CharField`| `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. `ZAAD-884129` or `CASH-IDEM-<NORMALIZED_KEY>` | External gateway ref (`ZAAD`/`eDahab`) or deterministic idempotency ref (`Cash`). |
| `recorded_by_user_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | No | *None* | **FK** | References `studently_users(id)` `ON DELETE RESTRICT` | Cashier/Admin user who logged receipt. |
| `transaction_type`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Payment'` | — | `CHECK(transaction_type IN ('Payment','Reversal','Refund'))` | Ledger transaction direction/type. |
| `is_reversal` | `BooleanField` | `INTEGER` | `TINYINT(1)` | No | `0` (`False`) | — | Boolean flag | Indicates reversal or refund transaction. |
| `reversed_payment_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_student_payments(id)` `ON DELETE RESTRICT` | Self-referencing link to original payment voucher. |
| `reversal_reason` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Mandatory if is_reversal=True | Formal audit justification for reversal/refund. |
| `notes` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Additional remarks | Memo notes on receipt. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Audit log timestamp. |

*Table Constraints & Financial Invariants:*
- `UNIQUE(payment_method, transaction_ref)` (Durable database-level idempotency for both Mobile Money gateway refs and deterministic Cash references `CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>`; survives cache eviction, process restarts, and concurrent retries)
- `CHECK(amount_paid > 0.00)` (Strictly positive magnitude model across payments, reversals, and refunds)
- `CHECK(payment_method IN ('Cash', 'ZAAD', 'eDahab'))`
- `CHECK(transaction_type IN ('Payment', 'Reversal', 'Refund'))`
- *Adopted Option A — Mandatory Operational Invoice:* All new operational payments MUST reference an existing, active invoice belonging to the student (`invoice.student_id == payment.student_id`). `invoice_id = NULL` is strictly reserved for historical Phase 1 legacy migration records. Existing payments are immutable and can NEVER be reassigned to another invoice. Option B (unallocated advance deposits) is NOT supported under the current frozen 20-table schema.
- *Balance Ceiling & Immutability:* Payment amount cannot exceed the invoice's remaining balance. Payments are append-only; updates and deletions are blocked by ORM overrides and database triggers.

---

### 2.18. Table: `studently_incomes`
- **Description:** Non-tuition revenue entries (book sales, donations, endowment waqf, events).
- **Django Model:** `Income`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `title` | `CharField` | `TEXT` | `VARCHAR(200)` | No | *None* | — | Max length 200 | Revenue transaction summary. |
| `category` | `CharField` | `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "Donation", "Books" | Income category. |
| `description` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Narrative description | Transaction details. |
| `amount` | `DecimalField` | `REAL` | `DECIMAL(10,2)`| No | *None* | — | `CHECK(amount >= 0.00)` | Revenue amount received ($). |
| `payment_method`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Cash'` | — | `CHECK(payment_method IN ('Cash','ZAAD','eDahab'))` | Inflow payment channel. |
| `date` | `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Date funds settled. |
| `reference_number`| `CharField`| `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "INC-ZAAD-101" | Bank/mobile voucher reference. |
| `recorded_by_user_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_users(id)` `ON DELETE SET NULL` | Administrator logging entry. |
| `notes` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Supplementary notes | Audit memo. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Update timestamp. |

*Table Constraints:*
- `CHECK(amount >= 0.00)`
- `CHECK(payment_method IN ('Cash', 'ZAAD', 'eDahab'))`

---

### 2.19. Table: `studently_expenses`
- **Description:** Operating expenditures, teaching staff payroll disbursements, utility bills, and campus maintenance.
- **Django Model:** `Expense`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `UUIDField` | `TEXT` (`char(32)`) | `CHAR(32)` | No | `uuid4` | **PK** | UUIDv4 format (32 hex chars) | Primary key. |
| `title` | `CharField` | `TEXT` | `VARCHAR(200)` | No | *None* | — | Max length 200 | Expense title or payee. |
| `category` | `CharField` | `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "Salaries", "Utilities" | Expense category. |
| `description` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Narrative description | Expense details. |
| `amount` | `DecimalField` | `REAL` | `DECIMAL(10,2)`| No | *None* | — | `CHECK(amount >= 0.00)` | Disbursed amount ($). |
| `payment_method`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Cash'` | — | `CHECK(payment_method IN ('Cash','ZAAD','eDahab'))` | Outflow payment method. |
| `date` | `DateField` | `TEXT` | `DATE` | No | `CURRENT_DATE` | — | `YYYY-MM-DD` | Disbursement date. |
| `reference_number`| `CharField`| `TEXT` | `VARCHAR(100)` | No | *None* | — | e.g. "EXP-PAY-201" | Bank/utility receipt ref. |
| `recorded_by_user_id`| `ForeignKey`| `TEXT` (`char(32)`) | `CHAR(32)` | Yes | `NULL` | **FK** | References `studently_users(id)` `ON DELETE SET NULL` | Administrator logging entry. |
| `notes` | `TextField` | `TEXT` | `TEXT` | Yes | `NULL` | — | Supplementary notes | Audit memo. |
| `created_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now add | Creation timestamp. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Update timestamp. |

*Table Constraints:*
- `CHECK(amount >= 0.00)`
- `CHECK(payment_method IN ('Cash', 'ZAAD', 'eDahab'))`

---

### 2.20. Table: `studently_system_settings`
- **Description:** Singleton configuration model storing the active institution's profile, academic parameters, fee rates, and ranking formula.
- **Django Model:** `SystemSetting`.

| Column Name | Django Field Type | SQLite Type | MySQL 8.0 Type | Nullable | Default | Key | Constraints & Validation | Business Description |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `id` | `PositiveSmallIntegerField` | `INTEGER` | `SMALLINT UNSIGNED` | No | `1` | **PK** | `CHECK(id = 1)` | Enforces singleton single row. |
| `institution_name`| `CharField` | `TEXT` | `VARCHAR(200)` | No | `'MADARASATUL AL-IMAAM'` | — | Max length 200 | Client institution legal name. |
| `institution_logo`| `CharField` | `TEXT` | `VARCHAR(255)` | No | `'/assets/aistudio/image_6159b039.png'` | — | File path or URL | Official emblem URL. |
| `contact_phone`| `CharField` | `TEXT` | `VARCHAR(50)` | No | `'063-4129440'` | — | Max length 50 | Campus phone number. |
| `contact_email`| `EmailField` | `TEXT` | `VARCHAR(254)` | No | `'admin@alimaama.demo'` | — | Valid email | Institutional bursar email. |
| `address` | `CharField` | `TEXT` | `VARCHAR(255)` | No | `'Hargeisa, Somaliland'` | — | Max length 255 | Campus physical address. |
| `academic_year`| `CharField` | `TEXT` | `VARCHAR(20)` | No | `'2026-2027'` | — | Format `YYYY-YYYY` | Current institutional academic year. |
| `current_term` | `CharField` | `TEXT` | `VARCHAR(20)` | No | `'Term 1'` | — | `CHECK(current_term IN ('Term 1','Term 2','Term 3'))` | Current academic term. |
| `class_fee_monthly`| `DecimalField`| `REAL` | `DECIMAL(8,2)` | No | `45.00` | — | `CHECK(class_fee_monthly >= 0.00)` | Monthly class fee rate ($). |
| `school_fee_monthly`| `DecimalField`| `REAL`| `DECIMAL(8,2)` | No | `35.00` | — | `CHECK(school_fee_monthly >= 0.00)` | Monthly school fee rate ($). |
| `currency_symbol`| `CharField` | `TEXT` | `VARCHAR(10)` | No | `'$'` | — | Max length 10 | Primary currency symbol. |
| `result_calc_method`| `CharField`| `TEXT` | `VARCHAR(20)` | No | `'sum'` | — | `CHECK(result_calc_method IN ('sum','average','weighted'))` | Active ranking formula. |
| `weighted_midterm`| `PositiveIntegerField`| `INTEGER`| `INT UNSIGNED`| No| `40` | — | `CHECK(weighted_midterm BETWEEN 0 AND 100)` | Midterm weight percentage. |
| `weighted_final` | `PositiveIntegerField`| `INTEGER`| `INT UNSIGNED`| No| `60` | — | `CHECK(weighted_final BETWEEN 0 AND 100)` | Final exam weight percentage. |
| `updated_at` | `DateTimeField` | `TEXT` | `DATETIME(6)` | No | `CURRENT_TIMESTAMP` | — | Auto now | Last settings revision timestamp. |

*Table Constraints:*
- `CHECK (id = 1)` (Singleton enforcement)
- `CHECK (result_calc_method IN ('sum', 'average', 'weighted'))`
- `CHECK (current_term IN ('Term 1', 'Term 2', 'Term 3'))`
- `CHECK (class_fee_monthly >= 0.00 AND school_fee_monthly >= 0.00)`
- `CHECK (weighted_midterm BETWEEN 0 AND 100 AND weighted_final BETWEEN 0 AND 100)`
- `CHECK (result_calc_method <> 'weighted' OR (weighted_midterm + weighted_final = 100))`
