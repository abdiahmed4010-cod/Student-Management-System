# STUDENTLY — Comprehensive Business Rules Specification
**Document:** `BUSINESS_RULES_SPECIFICATION.md`  
**Phase:** Phase 1 — Complete Read-Only Technical Audit  
**Author:** Senior Software Architect & Database Architect  
**Date:** November 2026  
**Status:** Verified & Complete  

---

## 1. Product Identity vs. Institutional Identity

An essential architectural requirement for this project is decoupling the generic software product from the specific institution:

1. **Product Architecture (`STUDENTLY`):**
   - The overarching software product name, technical brand, database name, and codebase foundation is **STUDENTLY** (School & Payment Management System).
   - All internal code namespaces, database tables, API routes, and configuration keys use the `studently_` prefix or standard RESTful paths.
2. **Institutional Identity (`MADARASATUL AL-IMAAM` / `AL-IMAAMA`):**
   - In the sample seed data and existing deployment, the client institution is configured as **MADARASATUL AL-IMAAM** (Hargeisa, Somaliland), with the Arabic brand designation **AL-IMAAMA**.
   - This identity is fully configurable via the System Settings module ([`assets/js/settings.js#L122-L130`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L122-L130), [`assets/js/data.js#L1204-L1228`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1204-L1228)).
   - Printed certificates, letterheads, scorecards, payment receipts, and reports dynamically pull the institution's name, logo, phone, email, and address from the database settings table, ensuring multi-tenant or white-label adaptability.

---

## 2. Student Domain & Registration Rules

### 2.1. Strict 7-Field Student Model
Both manual student registration ([`assets/js/students.js#L293-L368`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L293-L368)) and programmatic student addition ([`assets/js/data.js#L42-L60`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L42-L60)) mandate exactly 7 fields:

| Field # | Field Name | Data Type | Validation Rules & Defaults | Source Reference |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `id` (Student ID) | String (PK) | Formatted as `STD-XXXX`. Auto-generated if omitted or blank. Read-only in manual UI. | [`data.js#L49`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L49), [`storage.js#L600-L611`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L600-L611) |
| **2** | `fullName` | String | Required. Non-empty string; trimmed on input. | [`data.js#L50`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L50) |
| **3** | `gender` | Enum | Required. Allowed values: `'Male'`, `'Female'`. | [`data.js#L51`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L51) |
| **4** | `dateOfBirth` | Date | Required. Valid date string formatted as `YYYY-MM-DD`. | [`data.js#L52`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L52) |
| **5** | `parentPhone` | String | Required. Valid telephone string; trimmed. | [`data.js#L53`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L53) |
| **6** | `classId` | String (FK) | Required. Must reference a valid class ID in the system. | [`data.js#L54`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L54) |
| **7** | `registrationDate` | Date | Required. Formatted as `YYYY-MM-DD`. Defaults to current date if omitted. | [`data.js#L55`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L55) |

### 2.2. Student ID Generation Algorithm
Implemented in `Storage.generateNextStudentId()` ([`assets/js/storage.js#L600-L611`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L600-L611)):
1. Retrieves all existing student objects.
2. Initializes numeric tracker `maxNum = 1000`.
3. Evaluates each student's `id` against regular expression `/STD-(\d+)/`.
4. If the parsed integer is greater than `maxNum`, `maxNum` is updated.
5. Returns formatted string: `STD-${maxNum + 1}` (e.g. `STD-1001`, `STD-1024`).

### 2.3. Bulk Student Import Business Rules
Implemented in `StudentImport` ([`assets/js/student-import.js#L1-L689`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L1-L689)):
- **Permitted File Formats:** `.csv`, `.xlsx`, `.xls` ([`#L181-L187`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L181-L187)).
- **File Size Limit:** Maximum 5 megabytes (`5 * 1024 * 1024` bytes) ([`#L190-L194`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L190-L194)).
- **Template Schema:** Exact 7 columns: `Student ID`, `Full Name`, `Gender`, `Date of Birth`, `Parent Phone Number`, `Class`, `Registration Date` ([`#L212-L220`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L212-L220)).
- **Header Flexibility:** Header matching is case-insensitive with key aliases (e.g. `Full Name`, `name`, `full name`; `Class`, `Grade`, `Classroom`) ([`#L292-L308`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L292-L308)).
- **Gender Normalization:** Tolerates `M`, `Male`, `m`, `male` -> `'Male'`; `F`, `Female`, `f`, `female` -> `'Female'` ([`#L310-L313`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L310-L313)).
- **Class Resolution:** The value in `Class` must match an existing class record by either `class.name` or `class.id` (case-insensitive). If unmatched, row is marked invalid ([`#L315-L318, L328`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L315-L318)).
- **Auto ID on Import:** If the `Student ID` column is blank or empty, an official sequential ID is auto-generated ([`#L351-L365`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L351-L365)).
- **Deduplication Check:**
  - Duplicate against existing database: flags error if student ID exists in `studently_students`.
  - Duplicate within file: flags error if student ID is repeated multiple times in the upload sheet ([`#L367-L377`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L367-L377)).
- **Commitment Safety:** The user is presented with a preview summary card (Total, Valid, Invalid, Duplicate). Only valid records are committed upon user confirmation. An error log CSV can be downloaded for rejected rows ([`#L550-L688`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L550-L688)).

---

## 3. Academic Structure Domain Rules

### 3.1. Classes & Classrooms
- Each class belongs to an `academicYear` (default: `'2026-2027'`).
- Attributes: `name` (e.g. "Grade 1"), `section` (e.g. "A"), `room` (e.g. "Room 101"), `capacity` (integer, default 30), `teacherId` (optional homeroom teacher reference) ([`assets/js/data.js#L111-L121`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L111-L121)).
- **Deletion Constraint:** A class cannot be deleted if active students are assigned to it (`students.filter(s => s.classId === id).length > 0`) ([`assets/js/data.js#L143-L153`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L143-L153)).

### 3.2. Curriculum & Subjects
- Subjects are explicitly scoped to a `classId` ([`assets/js/data.js#L168-L174`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L168-L174)).
- Attributes: `name` (e.g. "Mathematics"), `code` (e.g. "MATH101", auto-uppercased), `maxMarks` (integer, default 100), `classId` (FK).
- **Referential Integrity on Delete:** A subject **cannot be deleted** if examination marks have already been recorded for it in any examination session (`marksExist = true`) ([`assets/js/data.js#L195-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L195-L215)).

### 3.3. Teacher Assignments & Workload
- Attributes: `fullName`, `email`, `phone`, `specialization`, `accountStatus` (`Active` / `Deactivated`), `assignedClassIds` (Array of class IDs), `assignedSubjectIds` (Array of subject IDs), `joinedDate` ([`assets/js/data.js#L239-L252`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L239-L252)).
- Teachers can be assigned to multiple classes and multiple subjects.
- In the frontend, teacher accounts in `studently_users` link to `studently_teachers` via `user.teacherId` or matching email address ([`assets/js/auth.js#L15-L18`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L15-L18)).

---

## 4. Attendance Domain Rules

### 4.1. Roll Call & Allowed Statuses
- Attributes: `id`, `studentId`, `classId`, `teacherId`, `date` (`YYYY-MM-DD`), `status`, `excusedReason` (optional), `recordedAt`, `updatedAt` ([`assets/js/storage.js#L182-L205`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L182-L205), [`assets/js/data.js#L313-L322`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L313-L322)).
- **Role Scoping & Status Permissions:**
  - **Teachers:**
    * May take attendance **only** for classes assigned to them (`assignedClassIds.includes(classId)`) ([`assets/js/attendance.js#L34-L39`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L34-L39)).
    * Allowed attendance statuses are strictly: **`Present`** and **`Absent`** ([`assets/js/attendance.js#L173-L195`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L173-L195)).
    * Teachers are **never permitted** to mark a student as `Excused`. If an unprivileged request submits `Excused`, `Data.saveAttendanceBatch` automatically coerces the status to `Absent` ([`assets/js/data.js#L312`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L312)).
  - **Administrators:**
    * May take or edit attendance for any class across the institution.
    * Allowed attendance statuses: **`Present`**, **`Absent`**, and **`Excused`** ([`assets/js/attendance.js#L197-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L197-L215)).
    * When setting status to `Excused`, an explanatory reason is mandatory ([`assets/js/attendance.js#L370-L435`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L370-L435), [`assets/js/data.js#L338`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L338)).

### 4.2. Daily Overwrite Logic
- When attendance is saved for a given `(classId, date)`, all existing attendance records matching that `(classId, date)` pair are purged and replaced with the new submission batch ([`assets/js/data.js#L306-L308`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L306-L308)).
- This guarantees that re-taking roll call updates records cleanly without duplicate daily entries.

---

## 5. Examination, Marks Entry & Calculations Domain Rules

### 5.1. Examination Structure
- Examination records are identified by: `classId`, `examType` (`Midterm` | `Final`), `academicYear` (e.g. `'2026-2027'`), and `term` (`Term 1`, `Term 2`, `Term 3`) ([`assets/js/data.js#L494-L499`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L494-L499)).
- Marks payload structure:
  ```json
  marks: {
    "<studentId>": {
      "<subjectId_1>": 95,
      "<subjectId_2>": 88,
      "activity": 10,
      "total": 193
    }
  }
  ```

### 5.2. Strict Teacher Marks Scoping & Isolation
- A teacher can access and enter marks for a class if and only if:
  1. The class is in the teacher's `assignedClassIds`.
  2. At least one subject in that class is in the teacher's `assignedSubjectIds` ([`assets/js/permissions.js#L197-L211`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L197-L211)).
- When a teacher views the spreadsheet or queries examinations:
  - `Data.getExaminations` dynamically filters the marks payload: all subjects not assigned to that teacher are stripped from the response ([`assets/js/data.js#L402-L426`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L402-L426)).
  - The `activity` score and cross-teacher cumulative `total` are hidden from the teacher view.
- When a teacher saves marks via `Data.saveExaminationRecord`:
  - The incoming payload is validated: attempts to submit marks for unassigned subjects, non-class students, or the `activity` field are rejected with an authorization error ([`assets/js/data.js#L463-L489`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L463-L489)).
  - The engine performs an atomic deep-merge: it modifies only the keys assigned to the current teacher and recalculates the grand stored `total` across all subjects (preserving previously saved marks from other teachers) ([`assets/js/data.js#L501-L533`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L501-L533)).

### 5.3. Activity Marks
- `activity` is an optional score (typically 0-10 or 0-20 pts) representing co-curricular or behavioral performance.
- Only **Administrators** can view, edit, or save `activity` marks ([`assets/js/data.js#L471-L474`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L471-L474), [`assets/js/examinations.js#L240-L255`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L240-L255)).

---

## 6. Ranking, Results & Scorecard Domain Rules

### 6.1. Combined Score Calculation Formulas
Implemented in `Data.calculateRankings` ([`assets/js/data.js#L684-L797`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L684-L797)). The combined total depends on `settings.resultCalcMethod`:

1. **`sum` (Simple Sum - Default):**
   $$\text{Combined Total} = \text{Midterm Total} + \text{Final Total}$$
2. **`average` (Equal 50/50 Average):**
   $$\text{Combined Total} = \frac{\text{Midterm Total} + \text{Final Total}}{2}$$
   *(Rounded to 1 decimal place: `Math.round(val * 10) / 10`)*
3. **`weighted` (Configurable Weighting):**
   $$\text{Combined Total} = \left(\text{Midterm Total} \times \frac{\text{weightedMidterm}}{100}\right) + \left(\text{Final Total} \times \frac{\text{weightedFinal}}{100}\right)$$
   *(Default weights: 40% Midterm / 60% Final; rounded to 1 decimal place).*

If only one exam session exists (e.g. Midterm completed, Final pending), `Combined Total` equals the score of that single session ([`assets/js/data.js#L750-L756`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L750-L756)).

### 6.2. Position Ranking & Tie-Handling Rules
- Students are sorted descending by `combinedTotal` ([`assets/js/data.js#L771`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L771)).
- Students without recorded scores receive `position = null`.
- **Tie-Breaking Rule:** Standard competition ranking (1224 ranking):
  - If Student $i$ has the exact same `combinedTotal` as Student $i-1$, Student $i$ receives the **same position** as Student $i-1$ (`results[i].position = results[i-1].position`).
  - The rank counter advances continuously (`currentRank++`).
  - *Example:* If two students tie for 1st place with 480 points, both receive Rank 1. The next student with 450 points receives Rank 3 ([`assets/js/data.js#L774-L786`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L774-L786)).
- **Teacher View Limitation:** Full class rank positions are reserved for Administrators; teachers view sorted student totals without absolute class merit positions ([`assets/js/data.js#L773`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L773)).

---

## 7. Promotion Domain Rules

### 7.1. Final Examination Prerequisite Rule
Implemented in `Data.checkPromotionEligibility` ([`assets/js/data.js#L800-L809`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L800-L809)) and `PromotionView` ([`assets/js/promotion.js#L49-L53, L111-L121`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L49-L53)):
- **Mandatory Condition:** A class is eligible for promotion **if and only if** a `Final` examination record has been registered and saved for that class in the active academic year and term.
- If no Final exam exists, promotion is strictly **blocked**:
  * The destination class selector and promotion execution buttons are disabled.
  * An explicit banner displays: *"Final Examination has not been registered yet. Academic promotion for this class is blocked."*

### 7.2. Promotion Execution & Historical Continuity
- Executed exclusively by Administrators (`canAccessPromotion`) ([`assets/js/permissions.js#L130`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L130)).
- Moves selected students to `destinationClassId` ([`assets/js/data.js#L811-L840`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L811-L840)).
- Appends an entry into `studently_promotions`:
  ```json
  {
    "id": "prm-xxx",
    "studentId": "STD-1007",
    "previousClassId": "cls-1",
    "newClassId": "cls-2",
    "academicYear": "2025-2026",
    "promotedDate": "2026-08-15",
    "promotedBy": "Chief Administrator"
  }
  ```
- All past attendance records, historical examination marks, and fee payment receipts remain linked to the student under their original historical class contexts.

---

## 8. Financial Ledger & Income/Expense Domain Rules

### 8.1. Fee Structure & Monthly Obligations
- Configured in system settings ([`assets/js/storage.js#L454-L455`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L454-L455), [`assets/js/data.js#L1079-L1081`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1079-L1081)):
  - **Class Fee:** $45.00 / month (default)
  - **School Fee:** $35.00 / month (default)
  - **Total Monthly Obligation per Student:** $80.00 / month
- Fee ledger is tracked per student, per calendar month (format: `YYYY-MM`).

### 8.2. Payment Records & Partial Payments
- Each payment transaction records: `id, studentId, feeCategory` ('Class Fee' | 'School Fee'), `month` (`YYYY-MM`), `amountDue`, `amountPaid`, `paymentMethod` ('Cash' | 'ZAAD' | 'eDahab'), `paymentDate`, `transactionRef`, `recordedBy`, `notes` ([`assets/js/data.js#L861-L879`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L861-L879)).
- **Partial Payments:** Multiple partial payments are permitted for the same student and month.
- **Payment Status Logic (`Data.getStudentFeeLedger`):**
  - If `amountPaid >= amountDue`: Status is **`Paid`**.
  - If `amountPaid > 0` and `amountPaid < amountDue`: Status is **`Partially Paid`**.
  - If `amountPaid == 0`: Status is **`Unpaid`** ([`assets/js/data.js#L1102-L1130`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1102-L1130)).

### 8.3. Income, Expenses & Non-Duplication Rule
- Implemented in `Data.getFinancialOverview` ([`assets/js/data.js#L1025-L1066`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1025-L1066)):
  - **Student Fee Collections ($):** Computed strictly by summing `amountPaid` from `studently_payments`.
  - **Other Institutional Income ($):** Computed strictly by summing `amount` from `studently_incomes` (categories: Donations, Book Sales, Registration, Waqf, etc.).
  - **Total Operating Expenses ($):** Computed strictly by summing `amount` from `studently_expenses` (categories: Salaries, Utilities, Supplies, Maintenance, etc.).
  - **Total Income ($):** $\text{Student Fee Collections} + \text{Other Income}$
  - **Net Balance ($):** $\text{Total Income} - \text{Total Operating Expenses}$
- **Non-Duplication Guard:** Tuition fee payments are stored exclusively in `studently_payments`. General non-tuition revenues are stored exclusively in `studently_incomes`. This prevents student fee revenue from being counted twice in the financial overview.

---

## 9. Certificates & Academic Transcripts Domain Rules

Implemented in `assets/js/certificates.js` ([`#L1-L1832`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L1-L1832)). Admin-only module.

### 9.1. The 4 Certificate Types & Eligibility Criteria
1. **Academic Year Completion Certificate (`academic-completion`):**
   - *Requirement:* Verified `Final` examination marks recorded OR a recorded promotion entry for the student in that academic year ([`#L16-L20, L158-L175`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L16-L20)).
2. **Examination Achievement Certificate (`academic-achievement`):**
   - *Requirement:* Verified `Final` examination marks in that academic year. Dynamically displays verified combined score and official merit class rank position ([`#L22-L26, L177-L200`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L22-L26)).
3. **Academic Progress & Enrollment Certificate (`enrollment-progress`):**
   - *Requirement:* At least one verified examination record (either Midterm or Final) in that academic year ([`#L28-L32, L202-L220`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L28-L32)).
4. **Attendance & Regularity Certificate (`attendance-standing`):**
   - *Requirement:* Recorded attendance logs for the student in school records ([`#L34-L38, L222-L245`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L34-L38)).

### 9.2. Cumulative Academic Transcript Specification
- Aggregates multi-year and multi-term academic performance without inventing missing data.
- Includes:
  1. Student Demographics (Full Name, ID, Date of Birth, Gender, Current Class).
  2. Tabular Subject Scores per term: Max marks, Midterm score, Final score, Total score, Subject Grade/Status.
  3. Cumulative Summary: Total Marks Scored, Total Maximum Possible, Cumulative Percentage (%), Class Standing Position.
  4. Attendance Performance: Days Present, Days Absent, Days Excused, Overall Attendance Rate (%).
  5. Progression Timeline: Chronological promotion history from initial admission.
  6. Official Verification: Principal signature line, Academic Dean signature line, and official school seal area ([`#L275-L490`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L275-L490)).

---

## 10. Reporting Catalog Specification

The reporting module ([`assets/js/reports.js#L33-L143`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L33-L143)) defines exactly **7 Categories** and **25 Sub-Reports**:

| # | Category ID | Category Name | Sub-Report ID | Sub-Report Name | Access Roles |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | `students` | Student Reports | `all` | Complete Student List | Admin only |
| | | | `by-class` | Class Student List | Admin, Permitted Teacher |
| | | | `individual` | Individual Student Report | Admin, Permitted Teacher |
| **2** | `attendance` | Attendance Reports | `daily` | Daily Attendance Report | Admin, Permitted Teacher |
| | | | `monthly` | Monthly Attendance Summary | Admin, Permitted Teacher |
| | | | `individual` | Student Attendance History | Admin, Permitted Teacher |
| | | | `class` | Class Attendance Summary | Admin, Permitted Teacher |
| **3** | `examinations` | Examination Reports | `midterm` | Midterm Examination Report | Admin, Permitted Teacher |
| | | | `final` | Final Examination Report | Admin, Permitted Teacher |
| | | | `subject` | Subject Marks Report | Admin, Permitted Teacher |
| | | | `class-summary` | Class Examination Summary | Admin, Permitted Teacher |
| | | | `individual` | Individual Student Examination Report | Admin, Permitted Teacher |
| | | | `historical` | Historical Examination Records | Admin, Permitted Teacher |
| **4** | `results` | Results & Ranking | `class-results` | Class Results | Admin, Permitted Teacher |
| | | | `class-ranking` | Student Ranking | Admin only |
| | | | `individual` | Individual Student Results | Admin, Permitted Teacher |
| **5** | `promotion` | Promotion Reports | `class-summary` | Class Promotion Summary | Admin only |
| | | | `individual` | Individual Student Promotion History | Admin only |
| **6** | `payments` | Fee & Payment Reports | `class-fee` | Class Fee Report | Admin only |
| | | | `school-fee` | School Fee Report | Admin only |
| | | | `individual` | Student Payment History | Admin only |
| | | | `outstanding` | Outstanding Fees Report | Admin only |
| **7** | `income-expenses` | Income & Expenses Reports | `income` | Income Report | Admin only |
| | | | `expenses` | Expenses Report | Admin only |
| | | | `summary` | Financial Summary (Net Balance) | Admin only |

---

## 11. Internationalization & Arabic RTL Specification

- Managed in `I18n` ([`assets/js/i18n.js#L1-L1066`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/i18n.js#L1-L1066)) and `assets/css/styles.css` ([`#L66-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L66-L97)).
- Stored key: `studently_lang` in LocalStorage.
- Supported languages:
  1. `en` (English): LTR layout, font `Plus Jakarta Sans`.
  2. `so` (Af-Soomaali): LTR layout, font `Plus Jakarta Sans`.
  3. `ar` (العربية): RTL layout, font `Cairo`, `<html dir="rtl">`.
- In RTL mode:
  - Sidebar anchors to right (`right: 0`, `border-left` active, `border-right` none).
  - Main container padding switches from `padding-left: 16rem` to `padding-right: 16rem`.
  - Icon margins and chevron orientations flip automatically.
  - Form field inputs and text columns align to the right.
