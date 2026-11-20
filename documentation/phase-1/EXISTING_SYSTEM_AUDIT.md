# STUDENTLY — Existing System Technical Audit
**Document:** `EXISTING_SYSTEM_AUDIT.md`  
**Phase:** Phase 1 — Complete Read-Only Technical Audit  
**Author:** Senior Software Architect & Application Security Auditor  
**Date:** November 2026  
**Status:** Verified & Complete  

---

## 1. Executive Summary

This document presents a comprehensive, line-by-line read-only architectural audit of the existing client-side school management application. The current application operates as an in-browser Single-Page Application (SPA) powered by Vanilla JavaScript (ES6 Modules), Tailwind CSS v4, and Vite, with 100% of data persistence hosted in browser `LocalStorage`.

The project codebase currently carries institutional branding for **MADARASATUL AL-IMAAM** (Hargeisa, Somaliland), under the system designation **AL-IMAAMA**. In accordance with project instructions, the target product architecture is designated as **STUDENTLY**, separating the reusable software product identity from the specific institutional configuration.

The audit covers all 25 JavaScript modules located in `assets/js/`, the root HTML entry point (`index.html`), application stylesheets (`assets/css/styles.css`), Vite build configuration (`vite.config.ts`), package manifests (`package.json`), and the `src/` directory.

---

## 2. Technology Stack & Build Pipeline

| Layer | Component | Version / Specification | Source Reference |
| :--- | :--- | :--- | :--- |
| **Runtime / Build Tool** | Vite | `^8.3.0` | [`package.json#L27`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/package.json#L27) |
| **CSS Framework** | Tailwind CSS (v4) with `@tailwindcss/vite` | `^4.3.3` | [`package.json#L15, L37`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/package.json#L15) |
| **Frontend Architecture** | Native Vanilla JavaScript (ES6 Modules) | ES2022+ | [`index.html#L21`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/index.html#L21) |
| **Spreadsheet Engine** | SheetJS (`xlsx`) | `^0.18.5` | [`package.json#L28`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/package.json#L28) |
| **PDF Generation** | jsPDF & jsPDF-AutoTable | `^4.2.1` / `^5.0.9` | [`package.json#L19-L20`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/package.json#L19-L20) |
| **Archive Utilities** | JSZip | `^3.10.2` | [`package.json#L21`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/package.json#L21) |
| **Iconography** | Embedded Lucide SVG path definitions | Hand-curated paths | [`assets/js/components.js#L13-L66`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L13-L66) |
| **Typography** | Google Fonts (Cairo, Inter, Plus Jakarta Sans) | Web font import | [`index.html#L14-L16`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/index.html#L14-L16) |
| **Persistence** | Browser `window.localStorage` | Key-value JSON strings | [`assets/js/storage.js#L6-L20`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L6-L20) |

### Note on `src/` Directory and React Dependencies
While `package.json` includes `react` (`^19.0.1`), `react-dom`, and `@vitejs/plugin-react`, inspection of `src/` reveals:
- [`src/App.tsx#L1-L8`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/src/App.tsx#L1-L8): Contains an empty dummy component `export default function App() { return <div></div>; }`.
- [`src/main.tsx#L1-L5`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/src/main.tsx#L1-L5): Mounts `#root`, which does not exist in `index.html`.
- [`index.html#L19-L22`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/index.html#L19-L22): Mounts `<div id="app-root"></div>` directly through `<script type="module" src="/assets/js/app.js"></script>`.

**Finding:** The running application is 100% Vanilla JS ES Modules. The React files in `src/` are vestigial starter files and are not executed by the browser application.

---

## 3. Comprehensive Audit of All 25 JavaScript Modules

### Module 1: `assets/js/app.js`
- **Path:** [`assets/js/app.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/app.js) (15 lines)
- **Role:** Main application bootstrap entry point.
- **Dependencies:** `Storage` (`./storage.js`), `Router` (`./router.js`).
- **Core Operations:**
  - Listens to `DOMContentLoaded` ([`app.js#L9`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/app.js#L9)).
  - Calls `Storage.init()` to seed default database collections if uninitialized, and applies migration logic ([`app.js#L11`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/app.js#L11)).
  - Calls `Router.init()` to mount the hash-change listener and evaluate the current route ([`app.js#L14`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/app.js#L14)).

---

### Module 2: `assets/js/storage.js`
- **Path:** [`assets/js/storage.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js) (619 lines)
- **Role:** Centralized LocalStorage persistence manager, seed data factory, and ID generator.
- **Dependencies:** None (Pure Browser APIs).
- **Exported Symbols:**
  - `Storage`: `{ get, set, remove, init, resetToSeed, generateNextStudentId, uuid, KEYS }`.
- **LocalStorage Keys Managed (`Storage.KEYS`):**
  - `studently_users` ([`#L7`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L7))
  - `studently_students` ([`#L8`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L8))
  - `studently_classes` ([`#L9`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L9))
  - `studently_subjects` ([`#L10`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L10))
  - `studently_teachers` ([`#L11`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L11))
  - `studently_attendance` ([`#L12`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L12))
  - `studently_examinations` ([`#L13`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L13))
  - `studently_payments` ([`#L14`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L14))
  - `studently_promotions` ([`#L15`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L15))
  - `studently_incomes` ([`#L16`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L16))
  - `studently_expenses` ([`#L17`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L17))
  - `studently_settings` ([`#L18`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L18))
  - `studently_session` ([`#L19`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L19))
- **Core Workflows:**
  - `init()`: Checks `studently_initialized` or legacy `alimaama_initialized`. If empty, writes full seed data ([`#L510-L514`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L510-L514)). If already present, executes non-destructive migrations (seeds missing `incomes`/`expenses`, updates institution defaults, aliases old demo emails) ([`#L515-L579`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L515-L579)).
  - `generateNextStudentId()`: Scans all existing student IDs via regex `/STD-(\d+)/`, finds the maximum numeric suffix (starting baseline 1000), and outputs `STD-${maxNum + 1}` ([`#L600-L611`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L600-L611)).
  - `uuid(prefix)`: Generates string identifiers: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}` ([`#L614-L616`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L614-L616)).

---

### Module 3: `assets/js/auth.js`
- **Path:** [`assets/js/auth.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js) (114 lines)
- **Role:** Authentication state, mock login verification, session storage, and mock password reset.
- **Dependencies:** `Storage` (`./storage.js`), `Data` (`./data.js`).
- **Exported Symbols:**
  - `Auth`: `{ getCurrentUser, isAuthenticated, login, logout, getRememberedEmail, requestPasswordReset, resetPassword }`.
- **Core Operations:**
  - `getCurrentUser()`: Reads `studently_session`. If user role is `TEACHER`, enriches the object with matching teacher profile from `Data.getTeacherByEmail` or `Data.getTeacherById` ([`#L10-L20`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L10-L20)).
  - `login(email, password, rememberMe)`: Finds user in `Data.getUsers()` matching email (with fallback demo alias checks). Checks `user.status === 'Deactivated'`. Verifies plaintext password `user.password !== cleanPass`. On success, writes session snapshot to `studently_session` and stores remembered email in `alimaama_remembered_email` ([`#L26-L77`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L26-L77)).
  - `logout()`: Clears `studently_session` ([`#L79-L82`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L79-L82)).
  - `resetPassword(email, newPassword)`: Finds user by email, validates `newPassword.length >= 6`, and updates `user.password` via `Data.updateUser` ([`#L103-L113`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L103-L113)).

---

### Module 4: `assets/js/permissions.js`
- **Path:** [`assets/js/permissions.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js) (306 lines)
- **Role:** Role-Based Access Control (RBAC) engine, default permission matrices, teacher scoping guards, and navigation menu generation.
- **Dependencies:** `Storage` (`./storage.js`).
- **Exported Symbols:**
  - `ROLES`: `{ ADMIN: 'ADMIN', TEACHER: 'TEACHER' }` ([`#L8-L11`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L8-L11)).
  - `PERMISSION_MODULES`: `[students, attendance, examinations, reports, payments]` ([`#L13-L19`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L13-L19)).
  - `PERMISSION_ACTIONS`: `[view, add, edit, delete, import, print, export]` ([`#L21-L29`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L21-L29)).
  - `Permissions`: Object containing authorization methods.
- **Key Methods & Rules:**
  - `getDefaultPermissions(role)`: Outlines standard permissions for ADMIN and TEACHER roles ([`#L40-L59`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L40-L59)).
  - `getUserPermissions(user)`: Merges role defaults with custom user permissions from `user.permissions`. Enforces safety ceiling: Teachers **never** gain `payments.*`, `students.add/edit/delete/import`, or `attendance.delete`, `examinations.delete` ([`#L69-L100`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L69-L100)).
  - Super Administrator Safeguard: User `usr-1` with role `ADMIN` has unconditional full access ([`#L95-L97, L105`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L95)).
  - `canAccessFinances(user)`: Admin role + `payments.view` ([`#L125-L127`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L125-L127)).
  - Admin-only checks: `canAccessPromotion`, `canAccessCertificates`, `canManageUsers`, `canManageClasses`, `canManageSubjects`, `canManageTeachers` ([`#L129-L151`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L129-L151)).
  - `canMarkExcusedAttendance(user)`: Admin role + `attendance.edit` ([`#L153-L155`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L153-L155)).
  - Teacher Class & Subject Marks Authorization:
    * `canAccessClassMarks(user, classId)`: Checks teacher is assigned to `classId` and assigned to at least 1 subject in that class ([`#L197-L211`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L197-L211)).
    * `canAccessSubjectMarks(user, classId, subjectId)`: Checks teacher is assigned to both `classId` and `subjectId` ([`#L213-L228`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L213-L228)).
  - `getNavItems(user)`: Dynamically builds sidebar navigation items based on role and active permissions ([`#L248-L305`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L248-L305)).

---

### Module 5: `assets/js/data.js`
- **Path:** [`assets/js/data.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js) (1,284 lines)
- **Role:** High-level relational data query layer, validation, CRUD handlers, calculation engine for rankings and financials.
- **Dependencies:** `Storage` (`./storage.js`), `Permissions` (`./permissions.js`).
- **Core Entities & CRUD Handlers:**
  - **Students:** `getStudents`, `getStudentById`, `getStudentsByClass`, `addStudent`, `updateStudent`, `deleteStudent` ([`#L28-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L28-L97)). Enforces exact 7 fields on insert/update.
  - **Classes:** `getClasses`, `getClassById`, `addClass`, `updateClass`, `deleteClass` ([`#L100-L153`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L100-L153)). Enforces constraint: cannot delete class with active students.
  - **Subjects:** `getSubjects`, `getSubjectsByClass`, `addSubject`, `updateSubject`, `deleteSubject` ([`#L156-L220`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L156-L220)). Enforces constraint: cannot delete subject if marks exist in any exam.
  - **Teachers:** `getTeachers`, `getTeacherById`, `getTeacherByEmail`, `addTeacher`, `updateTeacher`, `deleteTeacher` ([`#L223-L281`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L223-L281)).
  - **Attendance:** `getAttendance`, `saveAttendanceBatch`, `updateAttendanceRecord` ([`#L284-L345`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L284-L345)). Batch save removes existing records for (classId, date) and inserts new ones. Teachers cannot save status "Excused" (coerced to "Absent").
  - **Examinations:** `_getRawExaminations`, `getExaminations`, `saveExaminationRecord`, `getStudentHistoricalExams` ([`#L348-L681`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L348-L681)). Sanitizes marks for teachers to assigned subjects only; strips `activity` scores and cross-teacher totals. On save, recomputes cumulative student exam total across all subjects.
  - **Rankings & Results:** `calculateRankings(classId, academicYear, term)` ([`#L684-L797`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L684-L797)). Fetches Midterm and Final. Calculates combined score based on `settings.resultCalcMethod` ('sum', 'average', or 'weighted'). Computes rank positions with tie handling for Admin; teachers receive scoped results without full-class positions.
  - **Promotion:** `checkPromotionEligibility`, `promoteStudents`, `getPromotionHistory` ([`#L800-L846`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L800-L846)). Promotion blocked if Final Examination marks are not registered.
  - **Payments:** `getPayments`, `recordPayment`, `getStudentFeeLedger` ([`#L849-L880, L1068-L1134`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L849-L880)). Computes fee ledger status per student for Class Fee ($45) and School Fee ($35).
  - **Incomes & Expenses:** `getIncomes`, `addIncome`, `updateIncome`, `deleteIncome`, `getExpenses`, `addExpense`, `updateExpense`, `deleteExpense`, `getFinancialOverview` ([`#L883-L1066`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L883-L1066)). Prevents double counting: Fee collections + Other Incomes - Expenses = Net Balance.
  - **Users:** `getUsers`, `getUserByEmail`, `addUser`, `updateUser`, `resetUserPassword` ([`#L1137-L1201`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1137-L1201)).
  - **Settings & Dashboard:** `getSettings`, `updateSettings`, `getDashboardMetrics` ([`#L1204-L1283`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1204-L1283)).

---

### Module 6: `assets/js/i18n.js`
- **Path:** [`assets/js/i18n.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/i18n.js) (1,066 lines)
- **Role:** Multi-language internationalization catalog and RTL layout controller.
- **Dependencies:** None.
- **Storage Key:** `studently_lang` (default: `'en'`) ([`#L9`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/i18n.js#L9)).
- **Supported Languages:**
  - `en`: English (LTR)
  - `so`: Af-Soomaali (LTR)
  - `ar`: العربية (RTL)
- **Core Operations:**
  - `setLanguage(lang)`: Stores preference in `localStorage.getItem('studently_lang')`, toggles `<html dir="rtl">` or `<html dir="ltr">`, sets `<html lang="...">`, and notifies listeners ([`#L998-L1017`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/i18n.js#L998-L1017)).
  - `t(path, fallback)`: Resolves nested dot-notated translation keys (e.g. `'dashboard.totalStudents'`). Falls back to English catalog if missing, then to fallback string ([`#L1029-L1052`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/i18n.js#L1029-L1052)).

---

### Module 7: `assets/js/components.js`
- **Path:** [`assets/js/components.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js) (694 lines)
- **Role:** Reusable UI elements, Lucide SVG icon paths, modal dialog manager, toast alerts, Excel export (SheetJS), PDF export (jsPDF), and Project ZIP packager.
- **Dependencies:** `xlsx`, `jspdf`, `jspdf-autotable`.
- **Key Methods:**
  - `icon(name, extraClass)`: Renders embedded SVG icon from dictionary of 35+ Lucide icon paths ([`#L13-L66`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L13-L66)).
  - `getLogoHtml(sizeClass, extraClass)`: Renders official emblem `/assets/aistudio/image_6159b039.png` with `.official-logo-img` class ([`#L72-L74`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L72-L74)).
  - `exportToExcel(filename, sheetName, headers, rows, totalsRow, meta)`: Uses `XLSX.utils.aoa_to_sheet` to construct and download formatted `.xlsx` workbook ([`#L84-L137`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L84-L137)).
  - `exportToPdf(options)`: Generates branded PDF using `jspdf` and `autoTable` with institution letterhead and page numbers ([`#L152-L248`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L152-L248)).
  - `openModal(contentHtml, title, options)`, `closeModal()`: Standardized modal dialog host ([`#L280-L368`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L280-L368)).
  - `showToast(message, type, duration)`: Temporary toast notifications (success, warning, danger, info) ([`#L370-L408`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L370-L408)).
  - `confirmDialog(options)`: Modal confirmation prompt with destructive styling option ([`#L410-L450`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L410-L450)).
  - `downloadCompleteProjectZip()`: Packages project files into downloadable ZIP archive using JSZip ([`#L520-L690`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L520-L690)).

---

### Module 8: `assets/js/router.js`
- **Path:** [`assets/js/router.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js) (1,021 lines)
- **Role:** Single-Page Application (SPA) router, hash navigation handler, auth routing guards, layout shell mounting, sidebar management, and user menu dropdowns.
- **Dependencies:** `Auth`, `Data`, `Storage`, `Permissions`, `Components`, `I18n`, and all view modules.
- **Route Table (`ROUTE_CONFIG`):**
  - `dashboard`: View `DashboardView` (All roles) ([`#L32`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L32))
  - `students`: View `StudentsView` (Guarded: `permModule: 'students'`) ([`#L33`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L33))
  - `classes`: View `ClassesView` (Admin only) ([`#L34`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L34))
  - `subjects`: View `SubjectsView` (Admin only) ([`#L35`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L35))
  - `teachers`: View `TeachersView` (Admin only) ([`#L36`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L36))
  - `attendance`: View `AttendanceView` (Guarded: `permModule: 'attendance'`) ([`#L37`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L37))
  - `examinations`: View `ExaminationsView` (Guarded: `permModule: 'examinations'`) ([`#L38`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L38))
  - `results`: View `ResultsView` (Admin only, `permModule: 'examinations'`) ([`#L39`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L39))
  - `promotion`: View `PromotionView` (Admin only) ([`#L40`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L40))
  - `payments`: View `PaymentsView` (Admin only, `permModule: 'payments'`) ([`#L41`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L41))
  - `reports`: View `ReportsView` (Guarded: `permModule: 'reports'`) ([`#L42`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L42))
  - `certificates`: View `CertificatesView` (Admin only) ([`#L43`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L43))
  - `users`: View `UsersView` (Admin only) ([`#L44`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L44))
  - `settings`: View `SettingsView` (Admin only) ([`#L45`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L45))
  - `attendance-history`: View `AttendanceHistoryView` (Guarded: `permModule: 'attendance'`) ([`#L46`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L46))
  - `marks-history`: View `MarksHistoryView` (Guarded: `permModule: 'examinations'`) ([`#L47`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L47))
  - Auth screens: `login`, `forgot-password`, `reset-password` ([`#L79-L82`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L79-L82))
- **Security & Authorization Interceptions:**
  - Redirects unauthenticated users to `#login` ([`#L84-L88`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L84-L88)).
  - Blocks teachers from `adminOnly` routes ([`#L99-L104`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L99-L104)).
  - Verifies URL query parameters (e.g. `classId`, `subjectId`, `category`): if a teacher alters URL parameters to access unassigned classes/subjects, routing aborts and returns to dashboard with a security warning ([`#L114-L150`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L114-L150)).

---

### Module 9: `assets/js/dashboard.js`
- **Path:** [`assets/js/dashboard.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/dashboard.js) (828 lines)
- **Role:** Role-based dashboard view renderer (Admin Console vs Teacher Workspace).
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`, and view modules.
- **Workflows:**
  - `renderAdminDashboard(container, user)`: Renders 6 KPI cards (Total Students, Teaching Staff, Classrooms, Attendance Today %, Fees Collected, Outstanding Fees), analytical progress bars for fee reconciliation, daily attendance summary (Present, Absent, Excused), class enrollment distribution, recent student registrations table, and recent financial transactions ([`#L31-L364`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/dashboard.js#L31-L364)).
  - `renderTeacherDashboard(container, user)`: Scopes metrics strictly to teacher's assigned classes and subjects. Shows assigned classes list, teaching subjects count, registered students count in teacher's classes, today's roll call status schedule (Completed vs Pending Roll Call with direct launchpad), and searchable student roster for their assigned classes ([`#L366-L827`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/dashboard.js#L366-L827)).

---

### Module 10: `assets/js/users.js`
- **Path:** [`assets/js/users.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js) (292 lines)
- **Role:** User account administration module (Admin Only).
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`.
- **Operations:**
  - Renders user account table (`id, fullName, email, role, status, createdAt, linkedTeacher`) ([`#L30-L102`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js#L30-L102)).
  - Create User Modal: collects `fullName`, `email`, `password`, `role` (ADMIN or TEACHER), linked `teacherId` (if teacher), and sets default permissions ([`#L137-L200`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js#L137-L200)).
  - Edit User Modal: updates `fullName`, `email`, `role`, and linked `teacherId` ([`#L202-L260`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js#L202-L260)).
  - Password Reset: prompts admin for new plaintext password and updates user record ([`#L112-L123`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js#L112-L123)).
  - Toggle Account Status: toggles between `Active` and `Deactivated` (blocks deactivating current user) ([`#L125-L135`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/users.js#L125-L135)).

---

### Module 11: `assets/js/teachers.js`
- **Path:** [`assets/js/teachers.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/teachers.js) (364 lines)
- **Role:** Teaching faculty directory and assignment management (Admin Only).
- **Dependencies:** `Data`, `Components`.
- **Operations:**
  - Displays teacher directory table (`id, fullName, email, phone, assignedClasses, assignedSubjects, status`) ([`#L28-L96`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/teachers.js#L28-L96)).
  - Add / Edit Teacher Modal: multi-select for `assignedClassIds` and `assignedSubjectIds` grouped by class; collects `specialization`, `phone`, `email`, `fullName` ([`#L152-L290`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/teachers.js#L152-L290)).
  - View Schedule Modal: displays assigned class schedule, subject allocations, and student count ([`#L292-L362`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/teachers.js#L292-L362)).
  - Delete Teacher: confirms deletion via `Data.deleteTeacher` ([`#L132-L148`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/teachers.js#L132-L148)).

---

### Module 12: `assets/js/classes.js`
- **Path:** [`assets/js/classes.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js) (348 lines)
- **Role:** Class and grade management (Admin Only).
- **Dependencies:** `Data`, `Components`.
- **Operations:**
  - Renders class cards grid displaying class name, section, academic year, room location, assigned homeroom teacher, subject count, and visual capacity fill bar ([`#L30-L96`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js#L30-L96)).
  - Add / Edit Class Modal: `name, section, room, capacity, teacherId, academicYear` ([`#L162-L235`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js#L162-L235)).
  - Delete Class: checks `Data.deleteClass(id)`. If class has active students, returns error and blocks deletion ([`#L143-L158`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js#L143-L158)).
  - View Class Students Modal: lists all enrolled students in the class with gender, phone, and DOB ([`#L237-L289`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js#L237-L289)).
  - View Class Subjects Modal: lists curriculum subjects for that class with code and max marks ([`#L291-L346`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/classes.js#L291-L346)).

---

### Module 13: `assets/js/subjects.js`
- **Path:** [`assets/js/subjects.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/subjects.js) (259 lines)
- **Role:** Curriculum subjects setup (Admin Only).
- **Dependencies:** `Data`, `Components`.
- **Operations:**
  - Filters curriculum subjects by class dropdown ([`#L40-L56`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/subjects.js#L40-L56)).
  - Renders subjects table (`name, code, assignedClass, maxMarks`) ([`#L59-L96`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/subjects.js#L59-L96)).
  - Add / Edit Subject Modal: `name`, `code` (uppercase), `classId`, `maxMarks` (integer, default 100) ([`#L142-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/subjects.js#L142-L215)).
  - Delete Subject: delegates to `Data.deleteSubject(id)`. Blocks deletion if examination marks exist in any exam session ([`#L122-L138`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/subjects.js#L122-L138)).

---

### Module 14: `assets/js/students.js`
- **Path:** [`assets/js/students.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js) (736 lines)
- **Role:** Student directory, manual registration, profile modal tabs, CSV export, and role-based student scoping.
- **Dependencies:** `Data`, `Storage`, `Auth`, `Permissions`, `Components`, `I18n`, `StudentImport`.
- **Operations:**
  - Scoping: Admins see all students; Teachers see **only** students in their assigned classes in read-only mode ([`#L27-L35`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L27-L35)).
  - Filter & Search: searches `fullName`, `id`, `parentPhone`; filters by `classId` and `gender` ([`#L38-L48`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L38-L48)).
  - Student Registration Modal (Exact 7 fields):
    1. `Student ID` (auto-generated, readonly: `Storage.generateNextStudentId()`)
    2. `Full Name` (required text)
    3. `Gender` (`Male` / `Female`)
    4. `Date of Birth` (YYYY-MM-DD)
    5. `Parent Phone Number` (required text)
    6. `Class` (selected `classId`)
    7. `Registration Date` (defaults to current date) ([`#L286-L370`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L286-L370)).
  - Student Profile Modal: Comprehensive multi-tab profile viewer:
    * **General Profile:** Demographics, age calculation, guardian contact.
    * **Attendance Record:** Summary (present, absent, excused counts, % rate) and recent attendance records table.
    * **Academic Record:** Historical exams breakdown. If viewed by a teacher, displays **only** scores for that teacher's assigned subjects; if viewed by an Admin, shows full class subject breakdown and activity marks.
    * **Fee Payments (Admin Only):** Complete ledger of student's payment transactions, amounts paid, payment methods, transaction references, and outstanding balance.
    * **Promotion History:** Record of previous classes, promotions, academic years, dates, and authorizing admin ([`#L413-L735`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L413-L735)).
  - Export CSV: Exports active filtered student directory ([`#L210-L245`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/students.js#L210-L245)).

---

### Module 15: `assets/js/student-import.js`
- **Path:** [`assets/js/student-import.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js) (689 lines)
- **Role:** Bulk Excel (`.xlsx`) and `.csv` student import wizard (Admin Only).
- **Dependencies:** `Data`, `Components`, `I18n`, `xlsx`.
- **Operations:**
  - Download Template: Generates CSV or Excel template with the exact 7 required columns and sample row ([`#L209-L251`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L209-L251)).
  - Upload & File Checks: Drag-and-drop or file input; validates extensions (`.csv, .xlsx, .xls`) and size limit (max 5 MB) ([`#L180-L194`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L180-L194)).
  - Parsing & Validation (`processRawRows`):
    * Case-insensitive key matching for the 7 fields.
    * Validates required `Full Name` and `Class`.
    * Matches class against existing classes in `Data.getClasses()` by class name or class ID.
    * Validates gender (`Male` / `Female`).
    * Parses DOB and Registration Date; provides defaults if empty.
    * Auto-generates student ID (`Storage.generateNextStudentId()`) if ID column is empty.
    * Detects duplicate IDs against existing storage records and within the uploaded file itself ([`#L277-L380`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L277-L380)).
  - Preview Screen: Displays 4 summary metrics (Total Rows, Valid Records, Invalid Records, Duplicate Records) and tabular preview ([`#L382-L520`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L382-L520)).
  - Safe Confirmation & Commitment: Only inserts valid records; updates `studently_students` collection and notifies callback ([`#L550-L620`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L550-L620)).
  - Error Export: Generates downloadable CSV error log for invalid rows ([`#L622-L688`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L622-L688)).

---

### Module 16: `assets/js/attendance.js`
- **Path:** [`assets/js/attendance.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js) (436 lines)
- **Role:** Daily attendance roll call management and log auditing.
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Workflows:**
  - Class Scoping: Teachers see only their assigned classes; Admins see all classes ([`#L34-L45`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L34-L45)).
  - Status Rules:
    * Teacher status choices: **Present**, **Absent** only. Teachers **cannot** select or mark "Excused" ([`#L173-L195`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L173-L195)).
    * Admin status choices: **Present**, **Absent**, **Excused** (with mandatory reason modal) ([`#L197-L215, L370-L435`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L197-L215)).
  - Batch Save: "Mark All Present" shortcut. Calls `Data.saveAttendanceBatch(selectedClassId, selectedDate, teacherId, statusMap)`. Overwrites any prior roll call for that class & date ([`#L265-L300`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L265-L300)).
  - Printable Attendance Sheet: Generates blank or populated daily printable roster sheet ([`#L310-L368`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance.js#L310-L368)).

---

### Module 17: `assets/js/attendance-history.js`
- **Path:** [`assets/js/attendance-history.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js) (323 lines)
- **Role:** Attendance history auditing, session grouping, and attendance log inspection.
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Operations:**
  - Scoped to teacher's assigned classes (or all classes for Admin) ([`#L25-L35`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js#L25-L35)).
  - Groups raw attendance records by unique session key: `${classId}__${date}` ([`#L42-L75`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js#L42-L75)).
  - Renders session log cards with class name, date, total students, present count, absent count, excused count, and attendance percentage ([`#L140-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js#L140-L215)).
  - Modal Roster Inspector: opens full student roll call breakdown for selected historical session ([`#L260-L322`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/attendance-history.js#L260-L322)).

---

### Module 18: `assets/js/examinations.js`
- **Path:** [`assets/js/examinations.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js) (636 lines)
- **Role:** High-density spreadsheet marks entry grid, auto-totaling, keyboard navigation, and teacher marks isolation.
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Workflows:**
  - Filter Controls: Class selector, Exam Type (`Midterm` / `Final`), Academic Year (`2026-2027`), Term (`Term 1`, `Term 2`, `Term 3`), Subject filter dropdown ([`#L12-L17`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L12-L17)).
  - Strict Teacher Subject Scoping:
    * Teachers only see classes where they are assigned to both the class and at least one subject ([`#L71-L88`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L71-L88)).
    * Dynamic spreadsheet columns: Teachers see **only** columns for their assigned subjects; other teachers' subjects and the `Activity` column are omitted ([`#L97-L110, L210-L260`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L97-L110)).
  - Spreadsheet Mechanics:
    * Keyboard navigation (Arrow keys, Enter, Tab) ([`#L420-L480`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L420-L480)).
    * Real-time client score validation against `subject.maxMarks` (0 to maxMarks) ([`#L490-L530`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L490-L530)).
    * Automatic row total calculation ([`#L535-L560`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L535-L560)).
    * `hasUnsavedChanges` dirty state flag and badge ([`#L137-L145`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L137-L145)).
  - Persistence: Calls `Data.saveExaminationRecord`. Backend-style merge ensures saving one teacher's subject marks never overwrites or clears marks previously entered by other teachers ([`#L570-L635`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/examinations.js#L570-L635)).

---

### Module 19: `assets/js/marks-history.js`
- **Path:** [`assets/js/marks-history.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/marks-history.js) (372 lines)
- **Role:** Examination marks audit history viewer.
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Operations:**
  - Scoped to teacher's assigned classes and subjects (or full school for Admin) ([`#L40-L50`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/marks-history.js#L40-L50)).
  - Breaks down exam records by subject: displays class, subject, exam type, term, academic year, graded student count, class average score, and recorded date ([`#L60-L135`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/marks-history.js#L60-L135)).
  - Detailed Roster Mark Viewer Modal: inspects all student scores for that specific exam and subject ([`#L260-L370`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/marks-history.js#L260-L370)).

---

### Module 20: `assets/js/results.js`
- **Path:** [`assets/js/results.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js) (395 lines)
- **Role:** Term academic results, class position rankings, merit list exports, and printable student scorecards.
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Operations:**
  - Calls `Data.calculateRankings(selectedClassId, selectedYear, selectedTerm)` ([`#L36-L40`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L36-L40)).
  - Displays summary banner: Top Performer, Highest Score, Class Average Score, Active Calculation Formula ([`#L43-L54`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L43-L54)).
  - Class Ranking Table: Student ID, Student Name, Gender, Midterm Total, Final Total, Combined Total, Class Position Rank ([`#L140-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L140-L215)).
  - Export Merit List: Downloads clean Excel spreadsheet of rankings via `Components.exportToExcel` ([`#L365-L394`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L365-L394)).
  - Student Scorecard Modal & Print: Displays individual student scorecard with official letterhead, Midterm vs Final subject marks breakdown, Activity score, total, and position rank with browser print formatting ([`#L258-L364`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/results.js#L258-L364)).

---

### Module 21: `assets/js/promotion.js`
- **Path:** [`assets/js/promotion.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js) (353 lines)
- **Role:** Academic promotion and grade advancement engine (Admin Only).
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`.
- **Operations:**
  - Select Source Class and Target Destination Class ([`#L75-L108`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L75-L108)).
  - **Core Business Rule Verification:** Calls `Data.checkPromotionEligibility(sourceClassId, academicYear, term)`. If the Final Examination has not been registered and saved for that class, promotion is **blocked** with an explicit warning banner and disabled controls ([`#L49-L53, L111-L121`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L49-L53)).
  - Student Selection List: Multi-checkbox selection of eligible students to promote ([`#L130-L200`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L130-L200)).
  - Execution (`Data.promoteStudents`): Updates `student.classId = destinationClassId` and creates an audit record in `studently_promotions` (`id, studentId, previousClassId, newClassId, academicYear, promotedDate, promotedBy`) ([`#L250-L310`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L250-L310)).
  - Promotion History Table: Audit table showing past student class progressions ([`#L210-L245`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/promotion.js#L210-L245)).

---

### Module 22: `assets/js/payments.js`
- **Path:** [`assets/js/payments.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js) (1,301 lines)
- **Role:** Fee Ledger, Institutional Income & Expenses CRUD, Receipts, and Transaction History (Admin Only).
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Workflows & Sub-Tabs:**
  - **Sub-Tab 1: Student Fee Ledger:**
    * Monthly filter (`activeMonth`, e.g. `'2026-10'`).
    * Reads `Data.getStudentFeeLedger(activeMonth)`.
    * Computes obligations: Class Fee ($45), School Fee ($35), Total ($80).
    * Tracks payment statuses: `Paid`, `Partially Paid`, `Unpaid` for each fee category.
    * Record Payment Modal: records student fee payment with `feeCategory` ('Class Fee' | 'School Fee'), `amountPaid`, `paymentMethod` ('Cash' | 'ZAAD' | 'eDahab'), and `transactionRef` ([`#L60-L82, L138-L450`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js#L60-L82)).
    * Payment Receipt Modal: Formats official receipt voucher with school letterhead, student info, transaction reference, amount paid, and printable layout ([`#L460-L580`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js#L460-L580)).
  - **Sub-Tab 2: Income & Expenses:**
    * Full CRUD for Non-fee Incomes (`studently_incomes`) and Operating Expenses (`studently_expenses`).
    * Financial Overview KPIs: Student Fee Collections ($) + Other Income ($) = Total Income ($); Total Expenses ($); Net Balance ($) ([`#L590-L950`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js#L590-L950)).
  - **Sub-Tab 3: Unified Transaction History:**
    * Combines student fee payments, other incomes, and operating expenses into a single chronologically sorted financial audit journal with Excel export ([`#L960-L1300`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/payments.js#L960-L1300)).

---

### Module 23: `assets/js/certificates.js`
- **Path:** [`assets/js/certificates.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js) (1,832 lines)
- **Role:** Student certificates generator and cumulative academic transcripts (Admin Only).
- **Dependencies:** `jsPDF`, `jspdf-autotable`, `Auth`, `Data`, `Permissions`, `Components`.
- **Exported Types & Functions:**
  - `CERTIFICATE_TYPES`:
    1. `academic-completion`: Academic Year Completion Certificate (Requires Final Exam marks or recorded promotion) ([`#L16-L20`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L16-L20)).
    2. `academic-achievement`: Examination Achievement Certificate (Requires Final Exam marks; includes verified score and rank position) ([`#L22-L26`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L22-L26)).
    3. `enrollment-progress`: Academic Progress & Enrollment Certificate (Requires at least 1 Midterm or Final exam) ([`#L28-L32`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L28-L32)).
    4. `attendance-standing`: Attendance & Regularity Certificate (Requires recorded attendance entries) ([`#L34-L38`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L34-L38)).
  - `evaluateCertificateEligibility(student, certificateType, academicYear, ...)`: Strictly evaluates eligibility from existing database records; never invents fake scores or unearned awards ([`#L135-L270`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L135-L270)).
  - `buildCumulativeTranscript(student, academicYearFilter, user)`: Aggregates historical exams, attendance logs, promotion records, weighted cumulative averages, and standing ([`#L275-L450`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L275-L450)).
  - Interactive Preview & Layouts:
    * Certificates: A4 Landscape, Islamic ornamental border, official emblem, dual signature lines (Principal & Academic Dean).
    * Transcripts: A4 Portrait, institutional letterhead, student profile header, cumulative academic table by term and subject, attendance summary block, signature and stamp areas ([`#L500-L1830`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L500-L1830)).

---

### Module 24: `assets/js/reports.js`
- **Path:** [`assets/js/reports.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js) (2,525 lines)
- **Role:** Institutional reporting engine (7 Categories · 25 Sub-Reports).
- **Dependencies:** `Data`, `Auth`, `Permissions`, `Components`, `I18n`.
- **Report Catalog Structure (`CATEGORY_DEFINITIONS`):**
  1. **Student Reports (`students`):** Complete Student List (`all`), Class Student List (`by-class`), Individual Student Report (`individual`) ([`#L34-L48`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L34-L48)).
  2. **Attendance Reports (`attendance`):** Daily Attendance Report (`daily`), Monthly Attendance Summary (`monthly`), Student Attendance History (`individual`), Class Attendance Summary (`class`) ([`#L50-L64`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L50-L64)).
  3. **Examination Reports (`examinations`):** Midterm Examination Report (`midterm`), Final Examination Report (`final`), Subject Marks Report (`subject`), Class Examination Summary (`class-summary`), Individual Student Examination Report (`individual`), Historical Examination Records (`historical`) ([`#L66-L82`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L66-L82)).
  4. **Results & Ranking Reports (`results`):** Class Results (`class-results`), Student Ranking (`class-ranking`), Individual Student Results (`individual`) ([`#L84-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L84-L97)).
  5. **Promotion Reports (`promotion`):** Class Promotion Summary (`class-summary`), Individual Student Promotion History (`individual`) ([`#L99-L111`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L99-L111)).
  6. **Fee & Payment Reports (`payments`):** Class Fee Report (`class-fee`), School Fee Report (`school-fee`), Student Payment History (`individual`), Outstanding Fees Report (`outstanding`) ([`#L113-L127`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L113-L127)).
  7. **Income & Expenses Reports (`income-expenses`):** Income Report (`income`), Expenses Report (`expenses`), Financial Summary (`summary`) ([`#L129-L143`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/reports.js#L129-L143)).
- **Export & Print Capabilities:**
  - Dedicated print layouts with official header (`MADARASATUL AL-IMAAM`), date generated, filters applied, tabular content, summary totals, and official signature footer.
  - Export to Excel (`.xlsx`) via SheetJS preserving raw numeric values for financial and marks columns.
  - Export to PDF via `jspdf` and `jspdf-autotable`.
  - Role-based scoping: Teachers can only view reports in categories `students`, `attendance`, `examinations`, `results`, and only for their assigned classes/subjects. Financial and promotion reports are strictly Admin-only.

---

### Module 25: `assets/js/settings.js`
- **Path:** [`assets/js/settings.js`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js) (698 lines)
- **Role:** System preferences, institutional identity, academic calendars, fee parameters, and granular user permissions management matrix (Admin Only).
- **Dependencies:** `Data`, `Auth`, `Storage`, `Permissions`, `Components`, `I18n`.
- **Configuration Sections:**
  - **Section 0: Interface Language:** Multi-language selector (`en`, `so`, `ar`).
  - **Section 1: Institution Profile & Logo:** Institution name (`institutionName`), logo path (`institutionLogo`), address (`address`), contact phone (`contactPhone`), bursar email (`contactEmail`) ([`#L98-L170`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L98-L170)).
  - **Section 2: Academic Calendar & Term:** `academicYear`, `currentTerm` ([`#L172-L215`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L172-L215)).
  - **Section 3: Fee Rates & Currency:** `classFeeMonthly`, `schoolFeeMonthly`, `currencySymbol` ([`#L217-L260`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L217-L260)).
  - **Section 4: Results Calculation Formula:** `resultCalcMethod` (`sum`, `average`, `weighted`), `weightedMidterm` (%), `weightedFinal` (%) ([`#L262-L330`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L262-L330)).
  - **Section 5: Granular User Permissions Matrix:** Visual interactive checkbox matrix for all users and all 5 permission modules across 7 actions (`view, add, edit, delete, import, print, export`). Saves permissions into `user.permissions` ([`#L332-L460`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L332-L460)).
  - **Section 6: Project Source Export:** Download clean project source code archive as a ZIP file ([`#L462-L490`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L462-L490)).
  - **Section 7: Factory Reset:** Resets all LocalStorage collections to initial seed data via `Storage.resetToSeed()` ([`#L492-L530`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/settings.js#L492-L530)).

---

## 4. Audit of Non-JavaScript Application Assets

### 4.1. Stylesheet: `assets/css/styles.css`
- **Path:** [`assets/css/styles.css`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css) (400 lines)
- **Role:** Tailwind CSS v4 design tokens, custom colors, RTL layout styling, and print CSS rules.
- **Brand Palette Tokens (`@theme`):**
  - Royal Navy & Blue: `--color-blue-50` (`#EEF4FF`) through `--color-blue-950` (`#071A4A`) ([`#L6-L16`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L6-L16)).
  - Official Gold / Amber: `--color-amber-50` (`#FEF9E7`) through `--color-amber-800` (`#6E4E09`) ([`#L19-L27`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L19-L27)).
  - Emerald / Success: `--color-emerald-50` through `--color-emerald-800` ([`#L30-L36`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L30-L36)).
  - Neutral / Surfaces: `--color-slate-50` (`#F7F9FC`) to `--color-slate-900` (`#0B1F4B`) ([`#L39-L43`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L39-L43)).
- **RTL Specifications:**
  - `html[dir="rtl"]`: Applies font `'Cairo'`, text alignment right ([`#L67-L71`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L67-L71)).
  - Flips sidebar positioning from `left: 0` to `right: 0`, reverses slide transitions, and changes container padding from left to right ([`#L81-L97`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L81-L97)).
- **Print Rules (`@media print`):**
  - Hides navigation bars, sidebars, interactive buttons (`.no-print`, `#app-sidebar`, `#app-header`) ([`#L180-L240`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L180-L240)).
  - Resets backgrounds to pure white, enforces dark text contrast, and manages page breaks ([`#L245-L390`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/css/styles.css#L245-L390)).

### 4.2. HTML Entry Point: `index.html`
- **Path:** [`index.html`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/index.html) (23 lines)
- **Role:** Web shell and resource loader.
- **Head Tags:**
  - Title: `AL-IMAAMA - School & Payment Management System`.
  - Fonts preconnect and Google Fonts link (`Cairo`, `Inter`, `Plus Jakarta Sans`).
  - Stylesheet link: `/assets/css/styles.css`.
  - Body tag contains `<div id="app-root"></div>`.
  - Script tag: `<script type="module" src="/assets/js/app.js"></script>`.

### 4.3. Build Configuration: `vite.config.ts`
- **Path:** [`vite.config.ts`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/vite.config.ts) (137 lines)
- **Role:** Vite development server and build configuration.
- **Plugins:**
  - `@tailwindcss/vite` plugin ([`#L1`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/vite.config.ts#L1)).
  - `@vitejs/plugin-react` plugin ([`#L2`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/vite.config.ts#L2)).
  - Custom virtual module plugin `alimaamaProjectZipPlugin`: scans project directories excluding sensitive paths (`.env`, `node_modules`, `.git`), creates virtual archive payload `virtual:alimaama-project-files`, and registers `/AL-IMAAMA-Complete-Project.zip` endpoint ([`#L7-L100`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/vite.config.ts#L7-L100)).

---

## 5. LocalStorage Data Schema Audit

The following table documents all LocalStorage keys discovered in `assets/js/storage.js` and their confirmed JSON structures.

### Key 1: `studently_users`
```json
[
  {
    "id": "usr-1",
    "fullName": "Chief Administrator",
    "email": "admin@alimaama.demo",
    "password": "Admin123!",
    "role": "ADMIN",
    "status": "Active",
    "permissions": {
      "students": { "view": true, "add": true, "edit": true, "delete": true, "import": true, "print": true, "export": true },
      "attendance": { "view": true, "add": true, "edit": true, "delete": true, "import": false, "print": true, "export": true },
      "examinations": { "view": true, "add": true, "edit": true, "delete": true, "import": false, "print": true, "export": true },
      "reports": { "view": true, "add": false, "edit": false, "delete": false, "import": false, "print": true, "export": true },
      "payments": { "view": true, "add": true, "edit": true, "delete": true, "import": false, "print": true, "export": true }
    },
    "createdAt": "2025-08-01"
  },
  {
    "id": "usr-2",
    "fullName": "Ahmed Jama",
    "email": "teacher@alimaama.demo",
    "password": "Teacher123!",
    "role": "TEACHER",
    "teacherId": "tch-1",
    "status": "Active",
    "permissions": { /* ... */ },
    "createdAt": "2025-08-15"
  }
]
```

### Key 2: `studently_classes`
```json
[
  {
    "id": "cls-1",
    "name": "Grade 1",
    "section": "A",
    "room": "Room 101",
    "capacity": 30,
    "teacherId": "tch-1",
    "academicYear": "2026-2027"
  }
]
```

### Key 3: `studently_subjects`
```json
[
  {
    "id": "sub-1",
    "classId": "cls-1",
    "name": "Mathematics",
    "code": "MATH101",
    "maxMarks": 100
  }
]
```

### Key 4: `studently_teachers`
```json
[
  {
    "id": "tch-1",
    "fullName": "Ahmed Jama",
    "email": "teacher@alimaama.demo",
    "phone": "+252 63 444 1122",
    "assignedClassIds": ["cls-1", "cls-2"],
    "assignedSubjectIds": ["sub-1", "sub-2", "sub-3", "sub-6", "sub-7", "sub-8"],
    "accountStatus": "Active",
    "specialization": "STEM & Languages",
    "joinedDate": "2025-08-15"
  }
]
```

### Key 5: `studently_students`
```json
[
  {
    "id": "STD-1001",
    "fullName": "Ayan Hersi Warsame",
    "gender": "Female",
    "dateOfBirth": "2019-04-12",
    "parentPhone": "+252 63 411 2233",
    "classId": "cls-1",
    "registrationDate": "2026-08-20"
  }
]
```

### Key 6: `studently_attendance`
```json
[
  {
    "id": "att-1",
    "studentId": "STD-1001",
    "classId": "cls-1",
    "teacherId": "tch-1",
    "date": "2026-11-18",
    "status": "Present",
    "excusedReason": "Medical appointment certified by doctor",
    "recordedAt": "2026-11-18T10:00:00.000Z",
    "updatedAt": "2026-11-18T11:00:00.000Z"
  }
]
```

### Key 7: `studently_examinations`
```json
[
  {
    "id": "exam-1",
    "classId": "cls-1",
    "examType": "Midterm",
    "academicYear": "2026-2027",
    "term": "Term 1",
    "recordedDate": "2026-10-15",
    "updatedAt": "2026-10-16T08:00:00.000Z",
    "marks": {
      "STD-1001": {
        "sub-1": 92,
        "sub-2": 88,
        "sub-3": 95,
        "sub-4": 90,
        "sub-5": 96,
        "activity": 10,
        "total": 471
      }
    }
  }
]
```

### Key 8: `studently_payments`
```json
[
  {
    "id": "pay-1",
    "studentId": "STD-1001",
    "feeCategory": "Class Fee",
    "month": "2026-10",
    "amountDue": 45,
    "amountPaid": 45,
    "paymentMethod": "ZAAD",
    "paymentDate": "2026-10-02",
    "transactionRef": "ZAAD-884129",
    "recordedBy": "Chief Administrator",
    "notes": "Full payment received"
  }
]
```

### Key 9: `studently_promotions`
```json
[
  {
    "id": "prm-1",
    "studentId": "STD-1007",
    "previousClassId": "cls-1",
    "newClassId": "cls-2",
    "academicYear": "2025-2026",
    "promotedDate": "2026-08-15",
    "promotedBy": "Chief Administrator"
  }
]
```

### Key 10: `studently_incomes`
```json
[
  {
    "id": "inc-1",
    "title": "Registration & Admission Fees",
    "category": "Registration",
    "description": "New student registration fees for Term 1",
    "amount": 320,
    "paymentMethod": "ZAAD",
    "date": "2026-10-03",
    "referenceNumber": "INC-ZAAD-101",
    "notes": "Term 1 admissions desk",
    "createdAt": "2026-10-03T09:00:00.000Z"
  }
]
```

### Key 11: `studently_expenses`
```json
[
  {
    "id": "exp-1",
    "title": "Teacher Monthly Payroll",
    "category": "Salaries",
    "description": "Monthly teaching staff honorarium and salaries",
    "amount": 650,
    "paymentMethod": "ZAAD",
    "date": "2026-10-05",
    "referenceNumber": "EXP-PAY-201",
    "notes": "October teacher salary disbursement",
    "createdAt": "2026-10-05T12:00:00.000Z"
  }
]
```

### Key 12: `studently_settings`
```json
{
  "institutionName": "MADARASATUL AL-IMAAM",
  "institutionLogo": "/assets/aistudio/image_6159b039.png",
  "contactPhone": "063-4129440",
  "contactEmail": "admin@alimaama.demo",
  "address": "Hargeisa, Somaliland",
  "academicYear": "2026-2027",
  "currentTerm": "Term 1",
  "classFeeMonthly": 45,
  "schoolFeeMonthly": 35,
  "currencySymbol": "$",
  "resultCalcMethod": "sum",
  "weightedMidterm": 40,
  "weightedFinal": 60
}
```

### Key 13: `studently_session`
```json
{
  "id": "usr-1",
  "fullName": "Chief Administrator",
  "email": "admin@alimaama.demo",
  "role": "ADMIN",
  "teacherId": "",
  "loginAt": "2026-11-18T16:00:00.000Z"
}
```

### Ancillary Keys
- `studently_initialized` (String: `'true'`)
- `alimaama_initialized` (Legacy fallback initialization flag)
- `studently_lang` (String: `'en'`, `'so'`, or `'ar'`)
- `alimaama_remembered_email` / `studently_remembered_email` (String)

---

## 6. Audit Conclusion & Phase 1 Compliance

All 25 modules in `assets/js/` have been rigorously audited along with the stylesheets, HTML markup, build tooling, and package configurations. The existing client-side logic is well-structured and functional, but inherently vulnerable due to storing all database tables, plaintext passwords, and business logic inside the user's browser `LocalStorage`.

The transition to **STUDENTLY** with a full Python Django + Django REST Framework backend will preserve the existing frontend design while migrating persistence and authorization to a secure, relational server-side environment.
