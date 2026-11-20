# STUDENTLY — Phase 3.3 Security Correction Report

**Document:** `PHASE_3_3_SECURITY_CORRECTION_REPORT.md`  
**Scope:** Stage 3.3 Targeted Security Correction — ADMIN / TEACHER Superuser Privilege Enforcement  
**Date:** November 19, 2026  
**Status:** Complete — Ready for Independent Verification  

---

## 1. Root Cause Analysis

During independent review of Stage 3.3, a defense-in-depth privilege escalation vulnerability was identified in the custom `User` authentication layer:

1. **Manager Layer (`CustomUserManager.create_user`):** `create_user()` accepted arbitrary `**extra_fields` without blocking `is_superuser=True`, allowing a caller to pass `role="TEACHER", is_superuser=True` (or `role="ADMIN", is_superuser=True`) through the ordinary user creation method.
2. **Permission Layer (`User.has_perm` & `User.has_module_perms`):** Both methods checked `if self.is_superuser: return True` without verifying `self.role == "ADMIN"` and before enforcing the Teacher Hard Safety Ceiling. Consequently, any `TEACHER` record with `is_superuser=True` (even if malformed or manually modified) could bypass the Teacher Hard Safety Ceiling.
3. **Django Admin Forms (`CustomUserCreationForm`, `CustomUserChangeForm`):** Neither form performed server-side validation rejecting `role="TEACHER"` combined with `is_superuser=True` during creation or modification.
4. **Database Layer (`studently_users`):** No SQL `CHECK` constraint prevented persisting a row with `role = 'TEACHER'` and `is_superuser = 1` if application-layer validation were bypassed.

---

## 2. Exact Files Modified & Created

### Modified
| File | Targeted Correction |
| :--- | :--- |
| `backend/apps/accounts/models.py` | Added internal `_create_user(..., allow_superuser=False)` to `CustomUserManager`; blocked `is_superuser=True` in `create_user()`; preserved strict `create_superuser()`; hardened `User.clean()`, `User.has_perm()`, and `User.has_module_perms()` so only active `ADMIN` superusers receive superuser privileges and `TEACHER` accounts can never bypass the Teacher Hard Safety Ceiling; added database `CheckConstraint` `chk_user_superuser_admin_only`. |
| `backend/apps/accounts/admin.py` | Added server-side `clean()` validation to both `CustomUserCreationForm` and `CustomUserChangeForm` rejecting `is_superuser=True` when `role != "ADMIN"` (and rejecting contradictory `status="Deactivated"` + `is_active=True`). Preserved password hashing and `ReadOnlyPasswordHashField`. |
| `backend/apps/accounts/tests.py` | Added `SuperuserPrivilegeSecurityRegressionTests` with 15 targeted regression tests covering manager, permissions, admin forms, and database `IntegrityError` constraint enforcement while preserving all 15 existing Stage 3.3 tests. |

### Created
| File | Purpose |
| :--- | :--- |
| `backend/apps/accounts/migrations/0002_user_chk_user_superuser_admin_only.py` | Adds SQLite/SQL `CheckConstraint` `chk_user_superuser_admin_only` (`is_superuser = False OR role = 'ADMIN'`) to `studently_users`. |
| `PHASE_3_3_SECURITY_CORRECTION_REPORT.md` | This security correction report. |
| `PHASE_3_3_SECURITY_CORRECTION_VERIFICATION_REPORT.md` | Verification evidence and test execution report. |
| `STUDENTLY_PHASE_3_3_SECURITY_CORRECTION_REVIEW.zip` | Clean review archive containing backend source code, migrations, and Stage 3.3 reports (excluding `.env`, `.venv/`, `db.sqlite3`, and `__pycache__`). |

---

## 3. Exact Code-Level Corrections

### 3.1. Fix 1 — `CustomUserManager` (`backend/apps/accounts/models.py`)
- Introduced internal `_create_user(self, email, password=None, *, allow_superuser=False, **extra_fields)`:
  - Raises `ValueError` if `is_superuser=True` when `allow_superuser=False` (blocking both `create_user(role="TEACHER", is_superuser=True)` and `create_user(role="ADMIN", is_superuser=True)`).
  - Raises `ValueError` if `is_superuser=True` and `role != "ADMIN"`.
- `create_user()` delegates exclusively to `_create_user(..., allow_superuser=False)`.
- `create_superuser()` enforces `role="ADMIN"`, `is_superuser=True`, `is_staff=True`, `is_active=True`, `status="Active"`, and non-empty `password`, then delegates to `_create_user(..., allow_superuser=True)`.

### 3.2. Fix 2 — `User.has_perm()` & `User.has_module_perms()` (`backend/apps/accounts/models.py`)
- Evaluation order strictly enforced:
  1. Reject unauthenticated users.
  2. Reject inactive (`is_active=False`) or deactivated (`status != "Active"`) users.
  3. Reject malformed permission / app-label identifiers.
  4. Apply Teacher Hard Safety Ceiling before any permission grant — `TEACHER` accounts NEVER enter the superuser branch even if `is_superuser=True` is forced on the instance.
  5. Grant superuser privileges **only** when `self.role == "ADMIN" and self.is_superuser` (for active accounts).
  6. Standard `ADMIN` and `TEACHER` accounts evaluate explicit `module_permissions` records.
  7. Missing `UserPermission` records fail closed (`False`); no implicit `ADMIN` bypass.
- Added `User.clean()` rejecting `is_superuser=True` when `role != "ADMIN"`.

### 3.3. Fix 3 — Django Admin Forms (`backend/apps/accounts/admin.py`)
- Added server-side `clean()` validation on `CustomUserCreationForm` and `CustomUserChangeForm` that attaches a field error on `is_superuser` whenever `is_superuser=True` and `role != "ADMIN"` (blocking both TEACHER superuser creation, TEACHER promotion to superuser, and demoting an ADMIN superuser to TEACHER while retaining `is_superuser=True`).
- Preserved `set_password()`, `validate_password()`, and `ReadOnlyPasswordHashField`.

### 3.4. Fix 4 — Database Integrity Constraint (`backend/apps/accounts/models.py` & Migration `0002`)
- Added `models.CheckConstraint(condition=models.Q(is_superuser=False) | models.Q(role="ADMIN"), name="chk_user_superuser_admin_only")` to `User.Meta.constraints`.
- Pre-migration check confirmed `0` existing rows and `0` constraint violations in `backend/db.sqlite3`.
- Generated and applied `backend/apps/accounts/migrations/0002_user_chk_user_superuser_admin_only.py` containing only `migrations.AddConstraint`.

### 3.5. Fix 5 — Automated Security Regression Tests (`backend/apps/accounts/tests.py`)
- Added `SuperuserPrivilegeSecurityRegressionTests` (15 tests, `test_01` through `test_15`) exercising the real manager, permission methods, admin creation/change forms, and SQLite `IntegrityError` constraint enforcement.

---

## 4. Existing Stage 3.3 Functionality Preserved

- `AbstractBaseUser` inheritance without `PermissionsMixin` preserved.
- UUID primary key (`char(32) NOT NULL PRIMARY KEY`) and all existing `studently_users` columns and constraints (`chk_user_role`, `chk_user_status`) preserved.
- SimpleJWT configuration (`ACCESS_TOKEN_LIFETIME`, `REFRESH_TOKEN_LIFETIME`, `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`), authentication endpoints (`/api/v1/auth/token/`, `/refresh/`, `/verify/`), and `ScopedRateThrottle` preserved unchanged.
- Zero business models (`Teacher`, `UserPermission`, etc.) introduced; zero frontend files modified.

---

## 5. Unresolved Issues

**None.** All 5 required fixes are implemented and verified. Work has **STOPPED** pending independent verification before Stage 3.4.
