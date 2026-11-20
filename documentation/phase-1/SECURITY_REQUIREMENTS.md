# STUDENTLY — Application Security Audit & Full-Stack Security Specification
**Document:** `SECURITY_REQUIREMENTS.md`  
**Phase:** Phase 1 — Complete Read-Only Technical Audit  
**Author:** Senior Application Security Auditor & Django Security Architect  
**Date:** November 2026  
**Status:** Verified & Complete  

---

## 1. Audit of Existing Client-Side Security Weaknesses

The existing browser-only implementation was developed as a rapid standalone prototype. Consequently, it contains fundamental security vulnerabilities inherent to client-side persistence and JavaScript-only authorization.

### 1.1. Plaintext Credential Storage & Insecure Password Verification
- **Vulnerability:** Passwords for all users (including the Chief Administrator) are stored in plain text inside browser `LocalStorage` under `studently_users` ([`assets/js/storage.js#L151, L160, L170`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/storage.js#L151), [`assets/js/data.js#L1157`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/data.js#L1157)).
- **Mechanism:** Authentication is verified using a direct JavaScript string inequality check:
  ```javascript
  // assets/js/auth.js:54
  if (user.password !== cleanPass) {
    return { success: false, error: 'Invalid password. Check credentials and try again.' };
  }
  ```
- **Severity:** **CRITICAL**. Any person with physical access to the device, any browser extension with storage permissions, or any Cross-Site Scripting (XSS) payload can instantly read the administrator password.

### 1.2. Complete Client-Side Exposure of Sensitive Data
- **Vulnerability:** The complete school database—including all student personal phone numbers, dates of birth, attendance excuse medical records, examination marks, staff payroll figures, and cash transaction vouchers—is loaded into the browser memory and persisted in `window.localStorage`.
- **Severity:** **HIGH**. There is zero confidentiality boundary. Even when logged in as a Teacher with restricted UI permissions, the teacher's browser machine possesses all financial records and admin passwords in `localStorage.getItem('studently_payments')` and `localStorage.getItem('studently_users')`.

### 1.3. Client-Side Authorization Bypass
- **Vulnerability:** Role-Based Access Control (RBAC) and Teacher class/subject scoping are executed entirely inside JavaScript functions (`Permissions.hasPermission`, `Permissions.canAccessClassMarks`, `Router.handleRoute`) ([`assets/js/permissions.js#L102-L110`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/permissions.js#L102-L110), [`assets/js/router.js#L99-L111`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/router.js#L99-L111)).
- **Exploitation:** A teacher can open browser Developer Tools (F12), type `localStorage.setItem('studently_session', JSON.stringify({ role: 'ADMIN', id: 'usr-1' }))`, refresh the page, and gain immediate unrestricted super-admin privileges.
- **Severity:** **CRITICAL**.

### 1.4. Insecure Mock Password Recovery
- **Vulnerability:** Password reset in `assets/js/auth.js` has no proof-of-ownership mechanism ([`assets/js/auth.js#L89-L113`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/auth.js#L89-L113)).
- **Mechanism:** Any user can supply an email address and immediately call `resetPassword(email, newPassword)` to overwrite that user's password without receiving an email verification token, cryptographic signature, or expiration timestamp.
- **Severity:** **HIGH**.

### 1.5. Dynamic HTML Injection & Cross-Site Scripting (XSS)
- **Vulnerability:** View modules dynamically concatenate strings into `container.innerHTML` across all modules (e.g., student full names, teacher notes, transaction reference strings, excuse reasons).
- **Status:** While helpers like `Components.stripHtml` and `escapeHtml` are used in certain export functions ([`assets/js/components.js#L77-L81`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/components.js#L77-L81), [`assets/js/certificates.js#L41-L49`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/certificates.js#L41-L49)), user input stored in student names or class rooms is interpolated directly into DOM template strings without universal escaping.
- **Severity:** **MEDIUM-HIGH**. A malicious name in a spreadsheet import (`<img src=x onerror=alert(document.cookie)>`) could execute arbitrary JavaScript in an administrator's browser.

### 1.6. Client-Side File Upload Parsing Vulnerabilities
- **Vulnerability:** File parsing in `StudentImport` ([`assets/js/student-import.js#L253-L275`](file:///c:/Users/My%20Computer/Desktop/studently-school-payment-management-system/assets/js/student-import.js#L253-L275)) parses binary spreadsheets client-side via SheetJS (`XLSX.read(arrayBuffer)`).
- **Severity:** **MEDIUM**. Corrupt, nested zip-bomb, or maliciously crafted spreadsheets could freeze or crash the user's browser tab.

---

## 2. Target Full-Stack Security Architecture (Phase 2+)

To eliminate these vulnerabilities, the Django backend will act as the single authoritative security and validation gate.

```
+-------------------------------------------------------------------------+
|                           BROWSER CLIENT                                |
|  - Vanilla JS ES Modules (Existing UI Preserved)                        |
|  - Access Token (JWT) in Memory / Headers                               |
|  - Zero Sensitive Data in LocalStorage (No Passwords, No Ledger Cache)  |
+-------------------------------------------------------------------------+
                                    |
                    HTTPS / Authorization: Bearer <JWT>
                                    |
+-------------------------------------------------------------------------+
|                       DJANGO REST API BACKEND                           |
|  +-------------------------------------------------------------------+  |
|  | Security Middleware: CORS, CSRF, Security Headers, Rate Limiting  |  |
|  +-------------------------------------------------------------------+  |
|  | SimpleJWT Authentication Middleware                               |  |
|  +-------------------------------------------------------------------+  |
|  | DRF Permissions: IsAuthenticated, IsAdminUser, Object Permissions |  |
|  +-------------------------------------------------------------------+  |
|  | Scoped QuerySets: Teachers ONLY see assigned classes & subjects   |  |
|  +-------------------------------------------------------------------+  |
|  | Serializer Validation: Data Type, Range, Business Rules           |  |
|  +-------------------------------------------------------------------+  |
|  | Django ORM (Parameterized SQL - 100% SQL Injection Immunity)      |  |
+-------------------------------------------------------------------------+
                                    |
+-------------------------------------------------------------------------+
|                  RELATIONAL DATABASE (SQLite / MySQL)                   |
|  - Passwords hashed with Argon2 / PBKDF2                                |
|  - Foreign Key Constraints & Check Constraints                          |
+-------------------------------------------------------------------------+
```

---

## 3. Detailed Security Requirements

### 3.1. Authentication & Token Management
1. **Password Hashing:**
   - Passwords must be hashed using Django's default PBKDF2 with SHA-256 (minimum 600,000 iterations) or Argon2.
   - Plaintext passwords must never be stored, logged, or returned in API responses.
2. **SimpleJWT Configuration:**
   - **Access Token Lifetime:** 15 to 30 minutes (short-lived).
   - **Refresh Token Lifetime:** 7 to 14 days (with token rotation enabled: `ROTATE_REFRESH_TOKENS = True` and `BLACKLIST_AFTER_ROTATION = True`).
   - **Session Revocation:** On logout, the refresh token is blacklisted in the database table `token_blacklist`.

### 3.2. Server-Side Authorization & QuerySet Isolation
1. **Never Trust the Client:**
   - The backend must never accept `userRole`, `teacherId`, or `permissions` sent in request bodies. Authorization attributes must be derived exclusively from `request.user` extracted from the validated JWT token.
2. **Teacher QuerySet Filtering (BOLA Prevention):**
   - In Django viewsets for Students, Attendance, Examinations, and Reports:
     ```python
     def get_queryset(self):
         user = self.request.user
         if user.role == 'ADMIN':
             return Student.objects.all()
         elif user.role == 'TEACHER':
             assigned_class_ids = user.teacher_profile.classes.values_list('id', flat=True)
             return Student.objects.filter(class_id__in=assigned_class_ids)
         return Student.objects.none()
     ```
   - This ensures that even if a teacher manually calls `/api/v1/students/STD-1020/` (a student in an unassigned class), Django returns `404 Not Found` or `403 Forbidden`.

3. **Atomic Marks Isolation on the Server:**
   - When a teacher submits marks to `/api/v1/examinations/save-marks/`:
     - The backend serializer checks that every subject in the payload is assigned to that teacher.
     - The backend refuses submissions containing `activity` marks from teachers (`403 Forbidden`).
     - Updates are executed inside an atomic transaction (`transaction.atomic()`).

### 3.3. Secure Password Reset Workflow
1. The user requests a password reset by providing their email.
2. The server generates a cryptographically secure, one-time token (`django.contrib.auth.tokens.PasswordResetTokenGenerator`).
3. The server dispatches an email containing a secure link: `https://app.example.com/#reset-password?token=<token>&uid=<uid>`.
4. Token expires automatically after 24 hours.

### 3.4. Input Validation & XSS Prevention
1. All incoming payloads must be strictly validated by DRF Serializers specifying field types, character limits, regex patterns, and range checks.
2. Text rendered in the frontend must use text nodes (`element.textContent = ...`) or an HTML entity encoding utility before template string interpolation.

### 3.5. CORS & Network Security
1. **CORS Configuration (`django-cors-headers`):**
   - Allow requests strictly from trusted frontend origins (e.g. `http://localhost:3000` in development; official production domain in production).
   - `CORS_ALLOW_ALL_ORIGINS = False`.
2. **Security Headers:**
   - `X-Content-Type-Options = "nosniff"`
   - `X-Frame-Options = "DENY"`
   - `Strict-Transport-Security = "max-age=31536000; includeSubDomains"` (production)
   - `Content-Security-Policy` configured to permit scripts only from self and trusted CDNs (Google Fonts).

### 3.6. Rate Limiting & Brute-Force Defense
- Apply DRF ScopedRateThrottle to authentication endpoints:
  - `/api/v1/auth/token/`: 5 attempts per minute per IP address.
  - `/api/v1/auth/password-reset/`: 3 attempts per hour per IP address.
