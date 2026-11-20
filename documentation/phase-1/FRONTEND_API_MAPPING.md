# STUDENTLY — Frontend-to-Django REST API Mapping Specification
**Document:** `FRONTEND_API_MAPPING.md`  
**Phase:** Phase 1 — Complete Read-Only Technical Audit  
**Author:** Senior Django Backend Architect & API Designer  
**Date:** November 2026  
**Status:** Verified & Complete  

---

## 1. API Architecture & Standards

The target backend architecture provides a secure, stateless JSON REST API powered by **Django REST Framework (DRF)**:
- **Authentication Scheme:** JSON Web Tokens (JWT) using `djangorestframework-simplejwt`.
- **Token Transmission:** `Authorization: Bearer <access_token>` in HTTP headers.
- **Base API Prefix:** `/api/v1/`
- **Error Format:** Standardized DRF RFC-7807 compatible error responses (`{ "error": string, "details": object|array }`).
- **Permissions Layer:** Custom DRF permission classes (`IsAdminUser`, `IsTeacherUser`, `HasModulePermission`, `IsAssignedTeacherOrAdmin`).

---

## 2. Complete Module-by-Module API Endpoint Mapping

### 2.1. Authentication & Session Module (`assets/js/auth.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Auth.login` ([`auth.js#L26-L77`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L26-L77)) | `/api/v1/auth/token/` | `POST` | `{"email": "...", "password": "..."}` | `{"access": "...", "refresh": "...", "user": {...}}` | `AllowAny` |
| Token Refresh | `/api/v1/auth/token/refresh/` | `POST` | `{"refresh": "..."}` | `{"access": "..."}` | `AllowAny` |
| `Auth.getCurrentUser` ([`auth.js#L10-L20`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L10-L20)) | `/api/v1/auth/me/` | `GET` | *None* | `{"id": "...", "fullName": "...", "email": "...", "role": "...", "teacherDetails": {...}, "permissions": {...}}` | `IsAuthenticated` |
| `Auth.logout` ([`auth.js#L79-L82`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L79-L82)) | `/api/v1/auth/logout/` | `POST` | `{"refresh": "..."}` | `{"success": true}` | `IsAuthenticated` |
| `Auth.requestPasswordReset` ([`auth.js#L89-L101`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L89-L101)) | `/api/v1/auth/password-reset/` | `POST` | `{"email": "..."}` | `{"success": true, "message": "..."}` | `AllowAny` |
| `Auth.resetPassword` ([`auth.js#L103-L113`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L103-L113)) | `/api/v1/auth/password-reset/confirm/` | `POST` | `{"token": "...", "newPassword": "..."}` | `{"success": true}` | `AllowAny` |

---

### 2.2. User Management Module (`assets/js/users.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getUsers` ([`data.js#L1137`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1137)) | `/api/v1/users/` | `GET` | *None* | `[{"id": "...", "fullName": "...", "email": "...", "role": "...", "status": "...", "teacherId": "..."}]` | `IsAdminUser` |
| `Data.addUser` ([`data.js#L1146-L1167`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1146-L1167)) | `/api/v1/users/` | `POST` | `{"fullName": "...", "email": "...", "password": "...", "role": "...", "teacherId": "..."}` | `{"id": "...", "fullName": "...", "email": "...", ...}` | `IsAdminUser` |
| `Data.updateUser` ([`data.js#L1169-L1190`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1169-L1190)) | `/api/v1/users/{id}/` | `PATCH` | `{"fullName": "...", "email": "...", "role": "...", "status": "...", "teacherId": "..."}` | Updated user object | `IsAdminUser` |
| `Data.resetUserPassword` ([`data.js#L1192-L1201`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1192-L1201)) | `/api/v1/users/{id}/reset-password/` | `POST` | `{"newPassword": "..."}` | `{"success": true}` | `IsAdminUser` |
| Save User Permissions ([`settings.js#L670-L685`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L670-L685)) | `/api/v1/users/{id}/permissions/` | `PUT` | `{"permissions": {"students": {...}, "attendance": {...}, ...}}` | `{"success": true, "permissions": {...}}` | `IsAdminUser` |

---

### 2.3. Classes Module (`assets/js/classes.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getClasses` ([`data.js#L100`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L100)) | `/api/v1/classes/` | `GET` | Query params: `?academic_year=...` | `[{"id": "cls-1", "name": "Grade 1", "section": "A", "room": "...", "capacity": 30, "teacherId": "...", "academicYear": "..."}]` | `IsAuthenticated` (Scoped for teachers) |
| `Data.getClassById` ([`data.js#L104`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L104)) | `/api/v1/classes/{id}/` | `GET` | *None* | Detailed class object | `IsAuthenticated` |
| `Data.addClass` ([`data.js#L109-L123`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L109-L123)) | `/api/v1/classes/` | `POST` | `{"name": "...", "section": "...", "room": "...", "capacity": 30, "teacherId": "...", "academicYear": "..."}` | Created class object | `IsAdminUser` |
| `Data.updateClass` ([`data.js#L125-L141`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L125-L141)) | `/api/v1/classes/{id}/` | `PUT`/`PATCH` | Partial or full class fields | Updated class object | `IsAdminUser` |
| `Data.deleteClass` ([`data.js#L143-L153`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L143-L153)) | `/api/v1/classes/{id}/` | `DELETE` | *None* | `204 No Content` (or `400 Bad Request` if students enrolled) | `IsAdminUser` |

---

### 2.4. Subjects Module (`assets/js/subjects.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getSubjects` ([`data.js#L156`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L156)) | `/api/v1/subjects/` | `GET` | Query params: `?class_id=...` | `[{"id": "sub-1", "classId": "...", "name": "...", "code": "...", "maxMarks": 100}]` | `IsAuthenticated` (Scoped for teachers) |
| `Data.addSubject` ([`data.js#L165-L177`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L165-L177)) | `/api/v1/subjects/` | `POST` | `{"classId": "...", "name": "...", "code": "...", "maxMarks": 100}` | Created subject object | `IsAdminUser` |
| `Data.updateSubject` ([`data.js#L179-L193`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L179-L193)) | `/api/v1/subjects/{id}/` | `PUT`/`PATCH` | `{"name": "...", "code": "...", "maxMarks": 100, "classId": "..."}` | Updated subject object | `IsAdminUser` |
| `Data.deleteSubject` ([`data.js#L195-L220`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L195-L220)) | `/api/v1/subjects/{id}/` | `DELETE` | *None* | `204 No Content` (or `400 Bad Request` if marks exist) | `IsAdminUser` |

---

### 2.5. Teachers Module (`assets/js/teachers.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getTeachers` ([`data.js#L223`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L223)) | `/api/v1/teachers/` | `GET` | *None* | `[{"id": "tch-1", "fullName": "...", "email": "...", "phone": "...", "assignedClassIds": [...], "assignedSubjectIds": [...], "accountStatus": "..."}]` | `IsAdminUser` |
| `Data.getTeacherById` ([`data.js#L227`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L227)) | `/api/v1/teachers/{id}/` | `GET` | *None* | Teacher detail object | `IsAdminUser` or self teacher |
| `Data.addTeacher` ([`data.js#L237-L255`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L237-L255)) | `/api/v1/teachers/` | `POST` | `{"fullName": "...", "email": "...", "phone": "...", "assignedClassIds": [...], "assignedSubjectIds": [...], "specialization": "..."}` | Created teacher object | `IsAdminUser` |
| `Data.updateTeacher` ([`data.js#L257-L274`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L257-L274)) | `/api/v1/teachers/{id}/` | `PUT`/`PATCH` | Partial teacher fields | Updated teacher object | `IsAdminUser` |
| `Data.deleteTeacher` ([`data.js#L276-L281`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L276-L281)) | `/api/v1/teachers/{id}/` | `DELETE` | *None* | `204 No Content` | `IsAdminUser` |

---

### 2.6. Students & Student Import Module (`assets/js/students.js`, `assets/js/student-import.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getStudents` ([`data.js#L28-L40`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L28-L40)) | `/api/v1/students/` | `GET` | Query params: `?class_id=...&search=...&gender=...` | List of student objects (strictly scoped for teachers) | `HasPermission('students', 'view')` |
| `Data.getStudentById` ([`data.js#L32-L35`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L32-L35)) | `/api/v1/students/{id}/` | `GET` | *None* | Student profile object | `HasPermission('students', 'view')` |
| `Data.addStudent` ([`data.js#L42-L60`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L42-L60)) | `/api/v1/students/` | `POST` | `{"id": "STD-...", "fullName": "...", "gender": "...", "dateOfBirth": "...", "parentPhone": "...", "classId": "...", "registrationDate": "..."}` | Created student object | `HasPermission('students', 'add')` (Admin) |
| `Data.updateStudent` ([`data.js#L66-L85`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L66-L85)) | `/api/v1/students/{id}/` | `PUT`/`PATCH` | Exact 7 fields payload | Updated student object | `HasPermission('students', 'edit')` (Admin) |
| `Data.deleteStudent` ([`data.js#L87-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L87-L97)) | `/api/v1/students/{id}/` | `DELETE` | *None* | `204 No Content` | `HasPermission('students', 'delete')` (Admin) |
| Next Student ID | `/api/v1/students/next-id/` | `GET` | *None* | `{"nextId": "STD-1024"}` | `HasPermission('students', 'add')` |
| `StudentImport.validateFile` ([`student-import.js#L253`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L253)) | `/api/v1/students/import/validate/` | `POST` | `multipart/form-data` (`file`) | `{"summary": {"total": 20, "valid": 18, "invalid": 1, "duplicate": 1}, "preview": [...], "errors": [...]}` | `HasPermission('students', 'import')` (Admin) |
| `StudentImport.commitImport` ([`student-import.js#L550`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L550)) | `/api/v1/students/import/commit/` | `POST` | `{"students": [...]}` | `{"success": true, "importedCount": 18}` | `HasPermission('students', 'import')` (Admin) |

---

### 2.7. Attendance Module (`assets/js/attendance.js`, `assets/js/attendance-history.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getAttendance` ([`data.js#L284-L291`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L284-L291)) | `/api/v1/attendance/` | `GET` | Query params: `?class_id=...&date=...&student_id=...` | List of attendance records | `HasPermission('attendance', 'view')` |
| `Data.saveAttendanceBatch` ([`data.js#L293-L326`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L293-L326)) | `/api/v1/attendance/batch/` | `POST` | `{"classId": "cls-1", "date": "2026-11-18", "teacherId": "tch-1", "studentStatusMap": {"STD-1001": "Present", "STD-1002": "Absent"}}` | `{"success": true, "count": 2, "wasUpdate": false}` | `HasPermission('attendance', 'add' \| 'edit')` (Enforces no 'Excused' for teachers) |
| `Data.updateAttendanceRecord` ([`data.js#L328-L345`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L328-L345)) | `/api/v1/attendance/{id}/` | `PATCH` | `{"status": "Excused", "excusedReason": "..."}` | Updated attendance object | `IsAdminUser` |
| Attendance Sessions History ([`attendance-history.js#L42-L75`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js#L42-L75)) | `/api/v1/attendance/sessions/` | `GET` | Query params: `?class_id=...&date=...` | `[{"classId": "...", "date": "...", "totalStudents": 30, "presentCount": 28, "absentCount": 2, "excusedCount": 0}]` | `HasPermission('attendance', 'view')` |

---

### 2.8. Examinations & Marks Module (`assets/js/examinations.js`, `assets/js/marks-history.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getExaminations` ([`data.js#L357-L430`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L357-L430)) | `/api/v1/examinations/` | `GET` | Query params: `?class_id=...&exam_type=...&academic_year=...&term=...` | List of exam sessions with sanitized marks payload according to requesting user role | `HasPermission('examinations', 'view')` |
| `Data.saveExaminationRecord` ([`data.js#L432-L554`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L432-L554)) | `/api/v1/examinations/save-marks/` | `POST` | `{"classId": "...", "examType": "Midterm", "academicYear": "2026-2027", "term": "Term 1", "marks": {"STD-1001": {"sub-1": 92, "sub-2": 88}}}` | `{"success": true, "recordId": "...", ...}` | `HasPermission('examinations', 'add' \| 'edit')` (Atomic merge & teacher subject validation) |
| `Data.getStudentHistoricalExams` ([`data.js#L557-L681`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L557-L681)) | `/api/v1/examinations/historical/` | `GET` | Query params: `?student_id=...&class_id=...&subject_id=...` | Array of historical exam results per student | `HasPermission('examinations', 'view')` |

---

### 2.9. Results & Ranking Module (`assets/js/results.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.calculateRankings` ([`data.js#L684-L797`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L684-L797)) | `/api/v1/results/rankings/` | `GET` | Query params: `?class_id=...&academic_year=...&term=...` | `{"results": [{"studentId": "...", "combinedTotal": 180, "position": 1, ...}], "midtermExists": true, "finalExists": true}` | `IsAuthenticated` (Merit positions filtered for teachers) |
| Student Scorecard Data ([`results.js#L258-L300`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L258-L300)) | `/api/v1/results/scorecard/{student_id}/` | `GET` | Query params: `?academic_year=...&term=...` | Comprehensive scorecard payload (institution info, student info, subject breakdown, position, attendance) | `IsAuthenticated` |

---

### 2.10. Promotion Module (`assets/js/promotion.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.checkPromotionEligibility` ([`data.js#L800-L809`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L800-L809)) | `/api/v1/promotions/check-eligibility/` | `GET` | Query params: `?class_id=...&academic_year=...&term=...` | `{"eligible": true, "message": "Final examination marks are registered..."}` | `IsAdminUser` |
| `Data.promoteStudents` ([`data.js#L811-L840`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L811-L840)) | `/api/v1/promotions/execute/` | `POST` | `{"studentIds": ["STD-1001", ...], "currentClassId": "cls-1", "destinationClassId": "cls-2", "academicYear": "2026-2027"}` | `{"success": true, "count": 1}` | `IsAdminUser` |
| `Data.getPromotionHistory` ([`data.js#L842-L846`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L842-L846)) | `/api/v1/promotions/history/` | `GET` | Query params: `?student_id=...` | `[{"id": "prm-1", "studentId": "...", "previousClassId": "...", "newClassId": "...", "promotedDate": "..."}]` | `IsAdminUser` |

---

### 2.11. Payments & Ledger Module (`assets/js/payments.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getStudentFeeLedger` ([`data.js#L1068-L1134`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1068-L1134)) | `/api/v1/payments/ledger/` | `GET` | Query params: `?month=YYYY-MM&class_id=...` | Array of student ledger status objects (Class Fee paid/due, School Fee paid/due, outstanding, transactions) | `CanAccessFinances` (Admin) |
| `Data.getPayments` ([`data.js#L849-L859`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L849-L859)) | `/api/v1/payments/transactions/` | `GET` | Query params: `?student_id=...&month=...&start_date=...` | Array of raw payment transaction records | `CanAccessFinances` (Admin) |
| `Data.recordPayment` ([`data.js#L861-L880`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L861-L880)) | `/api/v1/payments/transactions/` | `POST` | `{"studentId": "STD-1001", "feeCategory": "Class Fee", "month": "2026-10", "amountDue": 45, "amountPaid": 45, "paymentMethod": "ZAAD", "transactionRef": "ZAAD-884129"}` | Created payment transaction object | `HasPermission('payments', 'add')` (Admin) |
| Receipt Data ([`payments.js#L460-L580`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js#L460-L580)) | `/api/v1/payments/receipt/{transaction_id}/` | `GET` | *None* | Formatted receipt payload with institution metadata | `CanAccessFinances` (Admin) |

---

### 2.12. Incomes & Expenses Module (`assets/js/payments.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getIncomes` ([`data.js#L883-L901`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L883-L901)) | `/api/v1/finances/incomes/` | `GET` | Query params: `?category=...&start_date=...` | List of non-tuition income records | `CanAccessFinances` (Admin) |
| `Data.addIncome` ([`data.js#L903-L921`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L903-L921)) | `/api/v1/finances/incomes/` | `POST` | `{"title": "...", "category": "...", "amount": 320, "paymentMethod": "ZAAD", "date": "...", "referenceNumber": "..."}` | Created income object | `HasPermission('payments', 'add')` (Admin) |
| `Data.updateIncome` ([`data.js#L923-L942`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L923-L942)) | `/api/v1/finances/incomes/{id}/` | `PUT`/`PATCH` | Partial income fields | Updated income object | `HasPermission('payments', 'edit')` (Admin) |
| `Data.deleteIncome` ([`data.js#L944-L952`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L944-L952)) | `/api/v1/finances/incomes/{id}/` | `DELETE` | *None* | `204 No Content` | `HasPermission('payments', 'delete')` (Admin) |
| `Data.getExpenses` ([`data.js#L954-L972`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L954-L972)) | `/api/v1/finances/expenses/` | `GET` | Query params: `?category=...&start_date=...` | List of expense records | `CanAccessFinances` (Admin) |
| `Data.addExpense` ([`data.js#L974-L992`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L974-L992)) | `/api/v1/finances/expenses/` | `POST` | `{"title": "...", "category": "Salaries", "amount": 650, "paymentMethod": "ZAAD", "date": "...", "referenceNumber": "..."}` | Created expense object | `HasPermission('payments', 'add')` (Admin) |
| `Data.updateExpense` ([`data.js#L994-L1013`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L994-L1013)) | `/api/v1/finances/expenses/{id}/` | `PUT`/`PATCH` | Partial expense fields | Updated expense object | `HasPermission('payments', 'edit')` (Admin) |
| `Data.deleteExpense` ([`data.js#L1015-L1023`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1015-L1023)) | `/api/v1/finances/expenses/{id}/` | `DELETE` | *None* | `204 No Content` | `HasPermission('payments', 'delete')` (Admin) |
| `Data.getFinancialOverview` ([`data.js#L1025-L1066`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1025-L1066)) | `/api/v1/finances/overview/` | `GET` | Query params: `?month=...&start_date=...&end_date=...` | `{"studentFeeCollections": ..., "otherIncome": ..., "totalIncome": ..., "totalExpenses": ..., "netBalance": ...}` | `CanAccessFinances` (Admin) |

---

### 2.13. Certificates & Transcripts Module (`assets/js/certificates.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `evaluateCertificateEligibility` ([`certificates.js#L135-L270`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L135-L270)) | `/api/v1/certificates/eligibility/` | `GET` | Query params: `?student_id=...&certificate_type=...&academic_year=...` | `{"eligible": true, "reason": null, "details": {...}}` | `IsAdminUser` |
| `buildCumulativeTranscript` ([`certificates.js#L275-L490`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L275-L490)) | `/api/v1/transcripts/{student_id}/` | `GET` | Query params: `?academic_year=...` | Verified cumulative transcript data model | `IsAdminUser` |

---

### 2.14. Reports Engine (`assets/js/reports.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| Report Data Query ([`reports.js#L250-L400`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L250-L400)) | `/api/v1/reports/{category}/{sub_report}/` | `GET` | Query params: `?class_id=...&date=...&month=...&start_date=...` | Structured tabular report payload (`{ "headers": [...], "rows": [...], "totals": [...], "meta": {...} }`) | `HasPermission('reports', 'view')` (Category scoped) |

---

### 2.15. System Settings & Dashboard Module (`assets/js/settings.js`, `assets/js/data.js`)

| Frontend Method & Trigger | Proposed Django REST API Endpoint | HTTP Method | Request Payload | Response Schema | Required Permission |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `Data.getSettings` ([`data.js#L1204-L1220`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1204-L1220)) | `/api/v1/settings/` | `GET` | *None* | `{"institutionName": "...", "contactPhone": "...", "classFeeMonthly": 45, "schoolFeeMonthly": 35, ...}` | `IsAuthenticated` |
| `Data.updateSettings` ([`data.js#L1222-L1227`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1222-L1227)) | `/api/v1/settings/` | `PUT`/`PATCH` | Partial or full settings fields | Updated settings object | `IsAdminUser` |
| `Data.getDashboardMetrics` ([`data.js#L1230-L1283`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1230-L1283)) | `/api/v1/dashboard/metrics/` | `GET` | *None* | `{"totalStudents": 23, "totalTeachers": 4, "totalClasses": 5, "attendancePercentage": 96, "monthlyFeesCollected": 315.00, ...}` | `IsAuthenticated` (Scoped metrics for teachers) |
| Factory Reset / Reset to Seed ([`storage.js#L582-L597`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L582-L597)) | `/api/v1/system/reset-demo/` | `POST` | *None* | `{"success": true, "message": "Demo data restored."}` | `IsSuperAdminUser` |
