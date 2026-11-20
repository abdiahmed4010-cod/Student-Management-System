# STUDENTLY — Phase 3.3 Implementation Report

**Document:** `PHASE_3_3_IMPLEMENTATION_REPORT.md`  
**Stage:** Phase 3.3 — Custom User Model & Authentication  
**Date:** November 19, 2026  
**Status:** Complete — Ready for Independent Review & Stage 3.4 Authorization  

---

## 1. Executive Summary

Stage 3.3 implements STUDENTLY's custom Django `User` model (`apps.accounts.User`), `CustomUserManager`, fail-closed custom permission methods (`has_perm`, `has_module_perms`), `AUTH_USER_MODEL` configuration, SimpleJWT authentication with refresh-token rotation and blacklisting, Django Admin integration, initial database migrations, and a 15-test automated verification suite.

All strict Stage 3.3 scope boundaries were observed:
- No complete RBAC permission matrix (`UserPermission`) was implemented (deferred to Stage 3.6).
- No other canonical business models (`Teacher`, `Classroom`, `Subject`, `Student`, `Attendance`, `Examination`, `StudentInvoice`, `StudentPayment`, etc.) were created.
- No MySQL production connectivity was configured.
- Zero existing frontend HTML, CSS, TypeScript, or JavaScript files were modified.

---

## 2. Custom User Model & Manager Design (`backend/apps/accounts/models.py`)

### 2.1. Inheritance & Table Mapping
- **App:** `apps.accounts` (`label = "accounts"`, `AUTH_USER_MODEL = "accounts.User"`)
- **Base Class:** `django.contrib.auth.models.AbstractBaseUser`
- **`PermissionsMixin`:** Explicitly **omitted** per Phase 2 (`DATABASE_ARCHITECTURE.md` Section 3.1, `DJANGO_MODEL_SPECIFICATIONS.md` Section 2.1) to avoid redundant `studently_users_groups` / `studently_users_user_permissions` tables and preserve STUDENTLY's custom fail-closed RBAC architecture.
- **Database Table:** `studently_users`
- **Ordering:** `["full_name"]`
- **Identity Fields:** `USERNAME_FIELD = "email"`, `REQUIRED_FIELDS = ["full_name"]`

### 2.2. Exact User Model Fields & Database Constraints
| Field | Django Field Type | SQLite DDL Column | Constraints / Defaults |
| :--- | :--- | :--- | :--- |
| `id` | `UUIDField` | `char(32) NOT NULL PRIMARY KEY` | `default=uuid.uuid4`, `editable=False` |
| `email` | `EmailField` | `varchar(254) NOT NULL UNIQUE` | Normalized lowercase on manager creation & `save()` |
| `full_name` | `CharField` | `varchar(150) NOT NULL` | Required, stripped non-blank |
| `password` | `CharField` (inherited) | `varchar(128) NOT NULL` | PBKDF2-SHA256 hashed via `set_password()` |
| `last_login` | `DateTimeField` (inherited) | `datetime NULL` | Updated on JWT login (`UPDATE_LAST_LOGIN=True`) |
| `role` | `CharField(max_length=20)` | `varchar(20) NOT NULL` | Choices: `ADMIN`, `TEACHER`; default `'TEACHER'`; `db_index=True`; `CHECK ("role" IN ('ADMIN', 'TEACHER'))` (`chk_user_role`) |
| `status` | `CharField(max_length=20)` | `varchar(20) NOT NULL` | Choices: `Active`, `Deactivated`; default `'Active'`; `db_index=True`; `CHECK ("status" IN ('Active', 'Deactivated'))` (`chk_user_status`) |
| `is_active` | `BooleanField` | `bool NOT NULL` | Default `True` (automatically `False` when `status='Deactivated'`) |
| `is_staff` | `BooleanField` | `bool NOT NULL` | Default `False` |
| `is_superuser` | `BooleanField` | `bool NOT NULL` | Default `False` |
| `created_at` | `DateTimeField` | `datetime NOT NULL` | `auto_now_add=True` |
| `updated_at` | `DateTimeField` | `datetime NOT NULL` | `auto_now=True` |

### 2.3. Custom User Manager (`CustomUserManager`)
- **`create_user(email, password=None, **extra_fields)`:**
  - Validates non-empty, syntactically valid email (normalized lowercase) and non-blank `full_name`.
  - Validates `role` in `{"ADMIN", "TEACHER"}` and `status` in `{"Active", "Deactivated"}`.
  - Rejects contradictory `status='Deactivated'` with `is_active=True`; automatically sets `is_active=False` for deactivated accounts.
  - Validates supplied passwords against Django's `AUTH_PASSWORD_VALIDATORS` (`validate_password`) and stores only salted PBKDF2 hashes via `set_password()` (or unusable password when `password is None`).
- **`create_superuser(email, password=None, **extra_fields)`:**
  - Enforces non-empty password, `role='ADMIN'`, `is_staff=True`, `is_superuser=True`, `status='Active'`, and `is_active=True`, rejecting any invalid override with `ValueError`.

### 2.4. Fail-Closed Permission Methods (`has_perm`, `has_module_perms`)
Implements the Phase 2 fail-closed evaluation sequence (`HIGH-01`, `HIGH-02`):
1. Unauthenticated, inactive (`is_active=False`), or deactivated (`status != 'Active'`) users always receive `False`.
2. Malformed permission strings (not `<module>.<action>`) always receive `False`.
3. Active superusers (`is_superuser=True`) receive `True` for valid formatted permissions/modules.
4. Teacher Hard Safety Ceiling is evaluated **before** any DB lookup (unconditionally blocking financial/admin modules and destructive actions).
5. Standard `ADMIN` and `TEACHER` lookups against `self.module_permissions` fail closed (`False`) when no permission relation or record exists (no implicit `ADMIN` bypass).

---

## 3. JWT Authentication Configuration & Endpoints

### 3.1. Package & Settings (`backend/config/settings.py`)
- **Installed Package:** `djangorestframework_simplejwt==5.5.1` (`PyJWT==2.15.1`), pinned in `backend/requirements.txt`.
- **DRF Default Auth:** `rest_framework_simplejwt.authentication.JWTAuthentication`.
- **SimpleJWT Settings (aligned with `documentation/phase-1/SECURITY_REQUIREMENTS.md` Section 3.1.2):**
  - `ACCESS_TOKEN_LIFETIME`: `30` minutes (env `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`)
  - `REFRESH_TOKEN_LIFETIME`: `7` days (env `JWT_REFRESH_TOKEN_LIFETIME_DAYS`)
  - `ROTATE_REFRESH_TOKENS`: `True`
  - `BLACKLIST_AFTER_ROTATION`: `True` (`rest_framework_simplejwt.token_blacklist` installed)
  - `UPDATE_LAST_LOGIN`: `True`
  - `ALGORITHM`: `HS256` (env `JWT_ALGORITHM`), `SIGNING_KEY`: `SECRET_KEY`
  - `AUTH_HEADER_TYPES`: `("Bearer",)`, `USER_ID_FIELD`: `"id"`, `USER_ID_CLAIM`: `"user_id"`
- **Throttling (`ScopedRateThrottle`, aligned with `SECURITY_REQUIREMENTS.md` Section 3.6):**
  - `auth_token`: `5/min` (env `THROTTLE_AUTH_TOKEN`)
  - `auth_token_refresh`: `30/min` (env `THROTTLE_AUTH_TOKEN_REFRESH`)
  - `auth_token_verify`: `60/min` (env `THROTTLE_AUTH_TOKEN_VERIFY`)

### 3.2. Authentication Endpoints (`backend/apps/accounts/urls.py`, mounted at `/api/v1/auth/`)
| Method | Endpoint | Purpose |
| :---: | :--- | :--- |
| `POST` | `/api/v1/auth/token/` | Obtain JWT access & refresh tokens (case-insensitive email normalization; enforces `is_active=True` and `status='Active'`; throttled at `5/min`) |
| `POST` | `/api/v1/auth/token/refresh/` | Rotate refresh token, blacklist old refresh token, issue new access & refresh tokens |
| `POST` | `/api/v1/auth/token/verify/` | Verify JWT token signature and expiration |

---

## 4. Django Admin Integration & Known Limitation

- Registered `User` in `backend/apps/accounts/admin.py` using `CustomUserAdmin(BaseUserAdmin)`, `CustomUserCreationForm`, and `CustomUserChangeForm`.
- Uses `set_password()`, `validate_password()`, and `ReadOnlyPasswordHashField`; removes `groups`/`user_permissions` references cleanly.
- **Documented Limitation (Custom Permission Model):** Because `has_perm()` and `has_module_perms()` are strictly fail-closed and `UserPermission` is deferred to Stage 3.6, only active superusers (`is_superuser=True`, `is_staff=True`, `is_active=True`, `status='Active'`) can access Django Admin models in Stage 3.3. Standard `is_staff=True` admins will remain denied until Stage 3.6 provisions `UserPermission`.

---

## 5. Initial Migrations & Database Tables Created

- **Migration File Created:** `backend/apps/accounts/migrations/0001_initial.py` (`initial = True`, `dependencies = []`, creates `User` → `studently_users` with UUID PK, `chk_user_role`, and `chk_user_status`).
- **Migration Order Verified:** `accounts.0001_initial` applied first, followed by `contenttypes`, `admin`, `auth`, `sessions`, and `token_blacklist`.
- **Database Tables Created in `backend/db.sqlite3`:**
  - Application table (1 of 20): `studently_users`
  - Django framework tables: `django_migrations`, `django_content_type`, `django_admin_log`, `django_session`, `auth_permission`, `auth_group`, `auth_group_permissions`
  - SimpleJWT blacklist tables (required by `SECURITY_REQUIREMENTS.md` Section 3.1.2): `token_blacklist_outstandingtoken`, `token_blacklist_blacklistedtoken`
  - SQLite internal table: `sqlite_sequence`
  - **Zero** other canonical business tables were created.

---

## 6. Files Created and Modified

### Created
- `backend/apps/__init__.py`
- `backend/apps/accounts/__init__.py`
- `backend/apps/accounts/apps.py`
- `backend/apps/accounts/models.py`
- `backend/apps/accounts/serializers.py`
- `backend/apps/accounts/views.py`
- `backend/apps/accounts/urls.py`
- `backend/apps/accounts/admin.py`
- `backend/apps/accounts/tests.py`
- `backend/apps/accounts/migrations/__init__.py`
- `backend/apps/accounts/migrations/0001_initial.py`
- `PHASE_3_3_IMPLEMENTATION_REPORT.md`
- `PHASE_3_3_VERIFICATION_REPORT.md`

### Modified
- `backend/requirements.txt` (added pinned `djangorestframework_simplejwt==5.5.1` and `PyJWT==2.15.1`)
- `backend/.env.example` (added non-secret JWT lifetime and throttling defaults)
- `backend/config/settings.py` (added `AUTH_USER_MODEL`, `apps.accounts`, `rest_framework_simplejwt`, `token_blacklist`, `REST_FRAMEWORK`, `SIMPLE_JWT`)
- `backend/config/urls.py` (mounted `/api/v1/auth/`)

### Existing Frontend Files Modified
**None (0 files).**

---

## 7. Deviations & Staged Migration Sequencing Notes

1. **`User.teacher` ForeignKey (`db_column='teacher_id'`) Deferred to Academic Structure Stage:**
   - Phase 2 specifies a nullable ForeignKey `teacher = models.ForeignKey('academics.Teacher', on_delete=models.SET_NULL, null=True, blank=True, related_name='user_accounts', db_column='teacher_id')` on `User`.
   - Because Stage 3.3 strictly prohibits creating the `Teacher` business model (`studently_teachers`), referencing `'academics.Teacher'` in `accounts.0001_initial` is impossible without violating Stage 3.3 scope.
   - **Resolution:** `teacher` FK will be added cleanly via `accounts/migrations/0002_user_teacher.py` in the authorized stage that introduces `apps.academics.Teacher`, achieving 100% alignment with the frozen 20-table Phase 2 schema without any circular migration dependency.
2. **`UserPermission` (`studently_user_permissions`) Deferred to Stage 3.6 (RBAC):**
   - Explicitly deferred per Stage 3.3 instructions; `User.has_perm()` and `User.has_module_perms()` already handle its absence fail-closed.

---

## 8. Stop Condition Confirmation

Stage 3.3 implementation is complete. Work has **STOPPED** here pending independent review and explicit authorization to begin Stage 3.4.
