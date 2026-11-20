# STUDENTLY — Architectural Decisions & Open Business Questions
**Document:** `OPEN_QUESTIONS_AND_DECISIONS.md`  
**Phase:** Phase 1 — Complete Read-Only Technical Audit  
**Author:** Senior Software Architect, Database Architect & Application Security Auditor  
**Date:** November 2026  
**Status:** Pending Stakeholder Review Prior to Phase 2  

---

## 1. Overview

During the Phase 1 read-only technical audit of the 25 JavaScript modules and associated configuration files, several key architectural design choices, data modeling trade-offs, and ambiguous business workflows were identified.

This document enumerates these items, separating:
1. **Confirmed Technical Decisions:** Architectural decisions established by project specifications.
2. **Recommended Architectural Defaults:** Best-practice recommendations prepared for implementation.
3. **Open Business & Policy Questions:** Decisions requiring clarification or approval from stakeholders before proceeding with Phase 2 (Django Backend Foundation & Database Models).

---

## 2. Confirmed Technical Decisions

The following foundational decisions are established:

1. **Frontend Preservation:**
   - The existing Vanilla JavaScript ES Modules, HTML markup, and Tailwind CSS v4 styling will be **strictly preserved**.
   - The frontend will not be rewritten in React. The vestigial starter files in `src/` (`App.tsx`, `main.tsx`) will remain untouched or deprecated.
2. **Backend Stack:**
   - Backend framework: **Python Django** with **Django REST Framework (DRF)**.
   - Authentication: Stateless **JWT** using `djangorestframework-simplejwt`.
   - Development database: **SQLite**.
   - Future production database: **MySQL 8.0+**.
3. **Product vs. Institution Decoupling:**
   - The reusable product architecture is named **STUDENTLY**.
   - The current institutional identity (**MADARASATUL AL-IMAAM** / **AL-IMAAMA**) is treated as configurable tenant data stored in the settings table.

---

## 3. Recommended Architectural Defaults

The architecture team proposes the following defaults for Phase 2:

### Recommendation 1: Normalizing the Examination Marks Matrix
- **Existing Behavior:** In LocalStorage, all student marks for an exam session are stored in an unstructured nested JSON dictionary: `exam.marks = { studentId: { subjectId: score, activity: score, total: score } }` ([`assets/js/storage.js#L218-L257`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L218-L257)).
- **Proposed Architecture:** In the relational database, normalize marks into two related tables:
  1. `studently_examinations`: Exam session metadata (`class_id, exam_type, academic_year, term, recorded_date`).
  2. `studently_examination_marks`: Individual grade rows (`examination_id, student_id, subject_id, score`).
  3. `studently_examination_student_summaries`: Student-level session metadata (`examination_id, student_id, activity_score, total_score`).
- **Rationale:** Ensures referential integrity, eliminates concurrency race conditions between teachers saving marks simultaneously, and enables fast SQL aggregation for ranking and report generation.

### Recommendation 2: Preserving Client-Side PDF & Excel Generation
- **Existing Behavior:** The client application uses SheetJS (`xlsx`) and jsPDF (`jspdf` + `jspdf-autotable`) to generate `.xlsx` workbooks, certificate cards, and PDF reports directly in the user's browser ([`assets/js/components.js#L84-L248`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L84-L248)).
- **Proposed Architecture:** Retain client-side document export in Phase 2. The Django REST API will supply clean, structured JSON payloads, and the existing client-side export functions will render them.
- **Rationale:** Zero server CPU load, immediate responsiveness for end users, and 100% preservation of existing layout templates and custom fonts.

---

## 4. Open Business & Policy Questions for Stakeholders

The following questions require stakeholder alignment before Phase 2 implementation begins:

### Question 1: Single-Tenant vs. Multi-Tenant Architecture
- **Context:** The system settings table currently holds a single institution profile (`MADARASATUL AL-IMAAM`).
- **Question:** Should Phase 2 implement a strictly single-tenant schema (where one Django instance serves one school), or should we introduce an `institution_id` / `tenant_id` foreign key across all tables to support multi-school SaaS hosting in the future?
- **Impact:** Affects foreign key schemas, database indexes, and API scoping.

---

### Question 2: Monthly Fee Obligation Model — Dynamic vs. Materialized Invoicing
- **Context:** In `assets/js/data.js:1068-1134`, student fee obligations are calculated dynamically on the fly: $\text{Total Due} = \text{Settings Class Fee} + \text{Settings School Fee}$.
- **Question:**
  1. Should fee obligations remain dynamically computed per month, OR should the backend generate explicit monthly fee invoices/bills for each student?
  2. If the school changes the default Class Fee in Settings from $45 to $50 in November, should past months (e.g. October) retain the historical $45 obligation, or will dynamic calculation retroactively change past obligations?
  3. Are partial discounts, waqf sponsorships, or sibling scholarships needed for certain students?
- **Impact:** Determines whether a `StudentInvoice` / `FeeObligation` table is required in the database.

---

### Question 3: Student Withdrawal & Deletion Policy
- **Context:** Currently, `Data.deleteStudent(id)` completely and permanently purges the student from `studently_students` ([`assets/js/data.js#L87-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L87-L97)). However, this student may already have historical attendance logs, examination marks, and cash payment receipts.
- **Question:** Should Phase 2 implement a soft-delete mechanism (`is_active = False` or `status = 'Withdrawn'`) to preserve historical accounting and academic audit trails, while preventing the student from appearing on active daily attendance rosters?
- **Impact:** Prevents orphan records and foreign key constraint violations (`ON DELETE RESTRICT`).

---

### Question 4: Multi-Teacher Subject Collaboration
- **Context:** In `assets/js/permissions.js:213-228`, a teacher is granted access to grade a subject if that subject is in `teacher.assignedSubjectIds`.
- **Question:**
  1. Can multiple teachers be assigned to the same subject in the same class (e.g., co-teachers or assistants)?
  2. If Teacher A enters marks, and Teacher B is subsequently assigned to that subject, can Teacher B overwrite Teacher A's marks, or should the audit log track which specific teacher entered each score?
- **Impact:** Affects database constraints on `teacher_subject_assignments` and examination marks audit fields.

---

### Question 5: Mid-Year Promotion & Class Transfer
- **Context:** `assets/js/promotion.js` advances an entire class batch after the Final Examination.
- **Question:** What is the business rule for transferring an individual student mid-term between classes (e.g. from Grade 1-A to Grade 1-B)? Does this require Final Examination registration, or can an administrator perform an administrative class reassignment at any time?
- **Impact:** Differentiates annual academic promotion from individual student class transfers.

---

### Question 6: Grading Scale & Letter Grades
- **Context:** Currently, `results.js` and `examinations.js` operate purely on numerical scores and totals (e.g. 92/100, combined total 180).
- **Question:** Does the institution require an official letter grading scale (e.g., A: 90-100%, B: 80-89%, C: 70-79%, D: 60-69%, F: <60%) or GPA calculation to be printed on scorecards and academic transcripts, or should scores remain exclusively numeric?
- **Impact:** Determines whether a `GradingScale` configuration table is needed.

---

## 5. Next Steps — Transition to Phase 2

Upon stakeholder approval of this audit and resolution of the open decisions:
1. **Phase 2 Delivery:**
   - Initialize Django backend directory structure (`backend/`).
   - Configure SQLite development database and MySQL production settings.
   - Implement Django models in accordance with `DATABASE_REQUIREMENTS.md`.
   - Implement database migrations and automated LocalStorage seed data import command.
   - Configure SimpleJWT authentication, user models, and permission guards.
