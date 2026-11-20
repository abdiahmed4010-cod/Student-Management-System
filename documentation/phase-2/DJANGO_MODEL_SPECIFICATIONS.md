# STUDENTLY — Django Model Specifications & Implementation Blueprint
**Document:** `DJANGO_MODEL_SPECIFICATIONS.md`  
**Phase:** Phase 2 — Database Architecture & Design  
**Author:** Senior Django Backend Architect  
**Date:** November 2026  
**Status:** Architecture Specification — Pending Stakeholder Sign-Off  

---

## 1. Overview & Implementation Guidelines

This document presents the complete Django Model specifications for **STUDENTLY**. These Python class definitions specify fields, relationships, validators, constraints, Meta configurations, and business methods ready for Phase 3 implementation.

### Standards & Conventions:
- **Base App Structure:** `apps/core`, `apps/accounts`, `apps/academics`, `apps/students`, `apps/attendance`, `apps/examinations`, `apps/finances`.
- **Primary Keys & Physical Storage Semantics:**
  - `id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`.
  - **Python Runtime Layer:** Handled natively as Python standard library `uuid.UUID` objects.
  - **Database Storage Layer (SQLite & MySQL):** Because neither SQLite nor MySQL has a native UUID column data type in standard Django ORM, Django's built-in `UUIDField` maps to `char(32) NOT NULL` in migration DDL and stores the value stripped of hyphens via `uuid_obj.hex` (32 hexadecimal ASCII characters). SQLite gives this column `TEXT` type affinity (32 bytes payload). MySQL InnoDB stores `char(32)` as the clustered primary key.
  - **API & Serialization Layer:** Django REST Framework `serializers.UUIDField` automatically serializes `uuid.UUID` instances into canonical 36-character hyphenated RFC 4122 strings (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`), preserving 100% contract compatibility with the existing Vanilla JavaScript frontend.
  - **Binary UUID Architectural Rationale:** Dedicated `BINARY(16)` storage (with `UUID_TO_BIN(..., 1)`) is not natively supported by Django 5.x ORM without custom field extensions or third-party packages. Given STUDENTLY's institutional school scale (thousands of operations per term, not high-frequency financial trading), standard Django `char(32)` `UUIDField` indexing delivers optimal maintainability without third-party dependencies.
- **Database Tables:** Explicit `db_table = 'studently_<entity>'`.
- **Financial Precision:** `models.DecimalField(max_digits=10, decimal_places=2)`.
- **String Representation:** Clear, human-readable `__str__()` methods.

---

## 2. Models Specification

### 2.1. Accounts & Permissions Models (`apps/accounts/models.py`)

```python
import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.core.exceptions import ValidationError

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set.")
        email = self.normalize_email(email).lower()
        extra_fields.setdefault('status', 'Active')
        extra_fields.setdefault('is_active', True)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'ADMIN')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('status', 'Active')
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser):
    """
    STUDENTLY Custom User Model (Authentication Principal).
    
    Architectural Role & Permission Specifications:
    - Authoritative Roles: Exactly two physical database roles exist: 'ADMIN' and 'TEACHER',
      enforced by database check constraint chk_user_role.
    - Bursar / Accountant: An accountant or bursar is NOT a separate database role. In STUDENTLY,
      an accountant is an ADMIN user with dedicated financial module permissions configured in
      studently_user_permissions (fees, payments, income, expenses, reports).
    - Superuser: Superuser status is governed strictly by the institutional attribute
      is_superuser = models.BooleanField(default=False). The canonical term is 'Superuser'
      (avoiding ambiguous strings such as 'SUPERADMIN' or 'SUPER_ADMIN').
    """
    ROLE_CHOICES = [
        ('ADMIN', 'Administrator'),
        ('TEACHER', 'Teacher'),
    ]
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Deactivated', 'Deactivated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, max_length=254)
    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='TEACHER', db_index=True)
    teacher = models.ForeignKey(
        'academics.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='user_accounts',
        db_column='teacher_id'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active', db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'studently_users'
        ordering = ['full_name']
        constraints = [
            models.CheckConstraint(check=models.Q(role__in=['ADMIN', 'TEACHER']), name='chk_user_role'),
            models.CheckConstraint(check=models.Q(status__in=['Active', 'Deactivated']), name='chk_user_status'),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.email}) [{self.role}]"

    def has_perm(self, perm, obj=None):
        """
        Evaluates user permissions using a strict fail-closed, multi-tier RBAC architecture.
        
        Evaluation Sequence:
        1. Authentication Verification: Unauthenticated users are strictly denied.
        2. Account Status Check: Inactive users (is_active=False) always receive False.
        3. Format & Syntactic Validation: Validates '<module>.<action>' format and checks module/action validity.
        4. Institutional Superuser Privileges: Active superusers (is_superuser=True) receive institutional override.
        5. Teacher Hard Safety Ceiling: Strictly denies financial/administrative modules and destruction of academic history BEFORE database lookup.
        6. Permission Record Retrieval: Queries explicit studently_user_permissions record for the user and module.
        7. Action Evaluation: Evaluates the specific boolean action flag.
        8. Default-Deny Fallback: Returns False if no record exists or lookup fails. Standard ADMIN users NEVER fail-open.
        
        Object-Level Authorization Note:
        has_perm() evaluates module/model-level access. DRF endpoints MUST enforce object-level authorization
        via scoped querysets (get_queryset()) and DRF object permission classes (has_object_permission()).
        """
        # Step 1: Authentication Verification
        if not getattr(self, 'is_authenticated', True):
            return False

        # Step 2: Account Status Check (Inactive users always denied)
        if not self.is_active:
            return False

        # Step 3: Format & Syntactic Validation
        if not perm or not isinstance(perm, str) or '.' not in perm:
            return False

        parts = perm.split('.')
        if len(parts) != 2:
            return False

        module_name = parts[0].strip().lower()
        raw_action = parts[1].strip().lower()

        VALID_MODULES = {
            'students', 'attendance', 'examinations', 'reports', 'fees',
            'payments', 'income', 'expenses', 'teachers', 'classes',
            'subjects', 'users', 'certificates', 'settings'
        }
        if module_name not in VALID_MODULES:
            return False

        VALID_ACTION_FIELDS = {
            'can_view', 'can_add', 'can_edit', 'can_delete',
            'can_import', 'can_print', 'can_export'
        }

        # Normalize action name to model field name
        if raw_action in VALID_ACTION_FIELDS:
            field_name = raw_action
        elif f"can_{raw_action}" in VALID_ACTION_FIELDS:
            field_name = f"can_{raw_action}"
        elif raw_action.startswith(('view_', 'add_', 'change_', 'delete_')):
            verb = raw_action.split('_')[0]
            verb_map = {'view': 'can_view', 'add': 'can_add', 'change': 'can_edit', 'delete': 'can_delete'}
            field_name = verb_map.get(verb)
        else:
            return False

        if not field_name or field_name not in VALID_ACTION_FIELDS:
            return False

        # Step 4: Institutional Superuser Privileges (Active superuser only; inactive rejected at Step 2)
        if self.is_superuser:
            return True

        # Step 5: Teacher Hard Safety Ceiling (Evaluated BEFORE any database lookup)
        if self.role == 'TEACHER':
            # Teachers must NEVER access financial or administrative modules
            if module_name in {'fees', 'payments', 'income', 'expenses', 'users', 'settings', 'certificates'}:
                return False
            # Teachers must NOT add, edit, delete, or import student demographic records
            if module_name == 'students' and field_name in {'can_add', 'can_edit', 'can_delete', 'can_import'}:
                return False
            # Teachers must NOT delete protected academic history
            if module_name in {'attendance', 'examinations'} and field_name == 'can_delete':
                return False
            # Teachers are restricted strictly to academic and reporting domain modules
            if module_name not in {'students', 'attendance', 'examinations', 'reports', 'classes', 'subjects', 'teachers'}:
                return False

        # Step 6: Permission Record Retrieval (Fail-Closed)
        try:
            user_perm = self.module_permissions.filter(module=module_name).first()
        except Exception:
            # Fail-closed: DB error or query exception returns False immediately. Never fail-open.
            return False

        if not user_perm:
            # Fail-closed: Missing permission records strictly deny access for both ADMIN and TEACHER.
            # No implicit ADMIN bypass.
            return False

        # Step 7: Evaluate Requested Action
        return bool(getattr(user_perm, field_name, False))

    def has_module_perms(self, app_label):
        """
        Evaluates module-level visibility under the fail-closed RBAC architecture:
        - Inactive users: return False.
        - Superusers: return True.
        - Teachers: strictly denied for financial and administrative modules.
        - Admins & Teachers: requires an explicit UserPermission record with at least one active permission.
        - Missing records: return False (fail-closed).
        """
        if not getattr(self, 'is_authenticated', True):
            return False
        if not self.is_active:
            return False
        if self.is_superuser:
            return True

        if not app_label or not isinstance(app_label, str):
            return False

        module_name = app_label.strip().lower()
        VALID_MODULES = {
            'students', 'attendance', 'examinations', 'reports', 'fees',
            'payments', 'income', 'expenses', 'teachers', 'classes',
            'subjects', 'users', 'certificates', 'settings'
        }
        if module_name not in VALID_MODULES:
            return False

        # Teacher Safety Ceiling
        if self.role == 'TEACHER':
            if module_name in {'fees', 'payments', 'income', 'expenses', 'users', 'settings', 'certificates'}:
                return False
            if module_name not in {'students', 'attendance', 'examinations', 'reports', 'classes', 'subjects', 'teachers'}:
                return False

        # Module permission lookup (Fail-Closed)
        try:
            user_perm = self.module_permissions.filter(module=module_name).first()
        except Exception:
            return False

        if not user_perm:
            return False

        return any([
            user_perm.can_view,
            user_perm.can_add,
            user_perm.can_edit,
            user_perm.can_delete,
            user_perm.can_import,
            user_perm.can_print,
            user_perm.can_export,
        ])

class UserPermission(models.Model):
    """
    Granular per-user RBAC overrides across all 14 functional modules.
    
    Validation Architecture:
    - Django Model Choices (MODULE_CHOICES) provide application-level form and serializer validation.
    - Database Check Constraint (chk_perm_module) enforces relational data integrity at the SQL level.
    """
    MODULE_CHOICES = [
        ('students', 'Student Management'),
        ('attendance', 'Attendance Tracking'),
        ('examinations', 'Examinations & Marks'),
        ('reports', 'Reports Engine'),
        ('fees', 'Fee Structures'),
        ('payments', 'Student Payments'),
        ('income', 'Institutional Income'),
        ('expenses', 'Institutional Expenses'),
        ('teachers', 'Faculty & Teachers'),
        ('classes', 'Classes & Grades'),
        ('subjects', 'Academic Subjects'),
        ('users', 'User Management'),
        ('certificates', 'Certificates & Transcripts'),
        ('settings', 'System Settings'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='module_permissions', db_column='user_id')
    module = models.CharField(max_length=30, choices=MODULE_CHOICES)
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_import = models.BooleanField(default=False)
    can_print = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)

    class Meta:
        db_table = 'studently_user_permissions'
        constraints = [
            models.UniqueConstraint(fields=['user', 'module'], name='unique_user_module_permission'),
            models.CheckConstraint(
                check=models.Q(module__in=[
                    'students', 'attendance', 'examinations', 'reports', 'fees',
                    'payments', 'income', 'expenses', 'teachers', 'classes',
                    'subjects', 'users', 'certificates', 'settings'
                ]),
                name='chk_perm_module'
            ),
        ]

    def clean(self):
        # Teacher hard safety ceiling enforcement across all financial and restricted administrative modules
        if self.user.role == 'TEACHER':
            if self.module in ['payments', 'fees', 'income', 'expenses']:
                if any([self.can_view, self.can_add, self.can_edit, self.can_delete, self.can_import, self.can_print, self.can_export]):
                    raise ValidationError("Teachers cannot hold financial permissions.")
            if self.module in ['users', 'settings', 'certificates']:
                if any([self.can_view, self.can_add, self.can_edit, self.can_delete, self.can_import, self.can_print, self.can_export]):
                    raise ValidationError("Teachers cannot hold administrative or certificate issuance permissions.")
            if self.module == 'students' and any([self.can_add, self.can_edit, self.can_delete, self.can_import]):
                raise ValidationError("Teachers cannot modify student demographic records.")
            if self.module in ['attendance', 'examinations'] and self.can_delete:
                raise ValidationError("Teachers cannot delete attendance or examination history.")
            if self.module not in ['students', 'attendance', 'examinations', 'reports', 'classes', 'subjects', 'teachers']:
                raise ValidationError(f"Teachers cannot hold permissions for non-academic module '{self.module}'.")
```

### 2.1.1. Fail-Closed RBAC Architecture, DRF Authorization & Provisioning Blueprint

#### 1. Five-Tier Permission Evaluation Model
STUDENTLY enforces a rigorous multi-tier authorization model where security boundaries are clearly separated:

1. **Authentication Layer:** Validates identity via JSON Web Tokens (Django REST Framework SimpleJWT) or session authentication. Ensures `request.user.is_authenticated` is True and the account exists in `studently_users`.
2. **Account Lifecycle & Role Eligibility:** Checks `user.is_active` (inactive accounts immediately receive `HTTP 401/403` and `has_perm()` returns `False`). Validates database role enum via `chk_user_role` (`ADMIN` vs `TEACHER`).
3. **Module-Level Authorization (Fail-Closed RBAC):** Evaluates `User.has_perm('<module>.<action>')` against explicit rows in `studently_user_permissions`.
   - **No Implicit Admin Bypass:** Standard `ADMIN` users must have an explicit `UserPermission` record provisioned for the requested module with the appropriate boolean flag (`can_view`, `can_add`, `can_edit`, `can_delete`, `can_import`, `can_print`, `can_export`) set to `True`. Missing permission records strictly evaluate to `False` (default deny).
   - **Teacher Safety Ceiling:** For `TEACHER` accounts, all financial modules (`fees`, `payments`, `income`, `expenses`) and administrative modules (`users`, `settings`, `certificates`) are unconditionally denied before database lookup. Deletion of student demographics or examination/attendance historical records is strictly prohibited.
   - **Superuser Policy:** Active institutional superusers (`is_superuser=True AND is_active=True`) receive unrestricted authorization. Inactive superusers receive `False`.
4. **Object-Level Permissions & Ownership:** Model/module permissions do NOT grant indiscriminate access to all records in a table. Django REST Framework endpoints mandate server-side object-level permission verification:
   - **Class Assignment Boundary:** Teachers can only access student records, attendance sheets, and exam marks for classrooms allocated to them via `studently_teacher_class_assignments` or homeroom leadership (`studently_classes.teacher_id`).
   - **Subject Assignment Boundary:** Teachers can only enter and edit examination marks for subjects allocated to them via `studently_teacher_subject_assignments`.
   - **Financial Ledger Ownership Boundary:** Cashiers and administrators can only reverse payments if the transaction belongs to the verified student invoice and satisfies invoice-student integrity constraints (`payment.invoice_id == invoice.id AND invoice.student_id == student.id`).
5. **Ownership and Assignment Restrictions:** Enforced at the service layer and serializer level using transactional integrity and atomic locks (`select_for_update()`).

#### 2. Role-versus-Module Permission Matrix

| Module Key (14 Modules) | Functional Domain | Teacher Role Ceiling | Standard Administrator (`ADMIN`) | Bursar / Accountant (`ADMIN` Profile) | Academic Registrar (`ADMIN` Profile) | Institutional Superuser |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `students` | Student Demographics & Roster | View Only (Assigned classes) | Per `UserPermission` record | View Only (Invoicing context) | Full (`view, add, edit, import`) | Unrestricted |
| `attendance` | Roll Call & Attendance Records | View, Add, Edit (No Delete) | Per `UserPermission` record | Denied (No record) | Full (`view, add, edit, print, export`) | Unrestricted |
| `examinations` | Exam Sessions & Subject Marks | View, Add, Edit (Assigned subjects) | Per `UserPermission` record | Denied (No record) | Full (`view, add, edit, print, export`) | Unrestricted |
| `reports` | Academic & Financial Reports | View, Print (Academic only) | Per `UserPermission` record | Financial Reports Only | Academic Reports Only | Unrestricted |
| `fees` | Tuition & Fee Structures | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Full (`view, add, edit`) | Denied (No record) | Unrestricted |
| `payments` | Student Payment Ledger | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Full (`view, add, print, export`) | Denied (No record) | Unrestricted |
| `income` | Institutional Revenue Inflows | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Full (`view, add, edit, print, export`) | Denied (No record) | Unrestricted |
| `expenses` | Institutional Disbursements | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Full (`view, add, edit, print, export`) | Denied (No record) | Unrestricted |
| `teachers` | Faculty Directory & Staff | View Only | Per `UserPermission` record | Denied (No record) | Full (`view, add, edit, print, export`) | Unrestricted |
| `classes` | Classes, Cohorts & Capacities | View Only | Per `UserPermission` record | Denied (No record) | Full (`view, add, edit`) | Unrestricted |
| `subjects` | Curriculum & Max Marks | View Only | Per `UserPermission` record | Denied (No record) | Full (`view, add, edit`) | Unrestricted |
| `users` | User Accounts & Password Resets| **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Denied (No record) | Denied (No record) | Unrestricted |
| `certificates` | Transcripts & Certificates | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Denied (No record) | Full (`view, add, print`) | Unrestricted |
| `settings` | Institutional Global Settings | **HARD CEILING: STRICTLY DENIED** | Per `UserPermission` record | Denied (No record) | Denied (No record) | Unrestricted |

#### 3. DRF Endpoint Authorization Blueprint
For Phase 3 implementation, all Django REST Framework ViewSets must adhere to the following architecture:

```python
# Blueprint for Phase 3 DRF ViewSet Authorization:
from rest_framework import permissions, viewsets, exceptions

class HasModulePermission(permissions.BasePermission):
    """
    DRF permission class evaluating User.has_perm() at the view action level.
    """
    module_name = None  # Defined on each ViewSet (e.g. 'students', 'payments')

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated or not request.user.is_active:
            return False
        if request.user.is_superuser:
            return True

        action_map = {
            'list': 'can_view',
            'retrieve': 'can_view',
            'create': 'can_add',
            'update': 'can_edit',
            'partial_update': 'can_edit',
            'destroy': 'can_delete',
        }
        action = action_map.get(view.action, 'can_view')
        perm_string = f"{self.module_name or view.basename}.{action}"
        return request.user.has_perm(perm_string)

class IsAssignedTeacherOrAdmin(permissions.BasePermission):
    """
    Object-level permission ensuring teachers only access resources in their assigned classrooms.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user.is_active:
            return False
        if request.user.is_superuser or request.user.role == 'ADMIN':
            return True
        if request.user.role == 'TEACHER':
            teacher = getattr(request.user, 'teacher_profile', None)
            if not teacher:
                return False
            # Verify class allocation
            classroom = getattr(obj, 'classroom', getattr(obj, 'class_cohort', None))
            if classroom:
                is_homeroom = (classroom.teacher_id == teacher.id)
                is_assigned = classroom.teacher_assignments.filter(teacher=teacher).exists()
                return is_homeroom or is_assigned
        return False
```

#### 4. Scoped QuerySet Implementation Pattern (`get_queryset()`)
```python
# ViewSet QuerySet Scoping Pattern:
class StudentViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, HasModulePermission]
    module_name = 'students'

    def get_queryset(self):
        user = self.request.user
        if not user.is_active:
            return Student.objects.none()
        if user.is_superuser or user.role == 'ADMIN':
            return Student.objects.all().select_related('classroom')
        if user.role == 'TEACHER':
            teacher = user.teacher_profile
            if not teacher:
                return Student.objects.none()
            # Strict scoped boundary: only students in assigned classrooms
            return Student.objects.filter(
                models.Q(classroom__teacher=teacher) |
                models.Q(classroom__teacher_assignments__teacher=teacher)
            ).distinct().select_related('classroom')
        return Student.objects.none()
```

#### 5. ADMIN Permission Provisioning Workflow
Under the fail-closed RBAC architecture, an account with `role='ADMIN'` does NOT possess default wildcard privileges. Administrative profiles are provisioned explicitly:
1. **Account Creation:** Superuser creates an administrative account (`role='ADMIN'`, `is_active=True`, `is_staff=True`, `is_superuser=False`).
2. **Profile Provisioning Service:** A transactional provisioning service (`provision_user_permissions(user, profile_name)`) creates explicit rows in `studently_user_permissions`:
   - **Bursar / Accountant Profile:** Generates 5 `UserPermission` records (`fees`, `payments`, `income`, `expenses`, `reports`) with financial action flags enabled.
   - **Academic Registrar Profile:** Generates 8 `UserPermission` records (`students`, `attendance`, `examinations`, `reports`, `teachers`, `classes`, `subjects`, `certificates`) with academic action flags enabled.
   - **Full Administrator Profile:** Generates all 14 `UserPermission` records with all action flags enabled.
3. **Auditing & Revocation:** Modifying or revoking access updates or deletes rows in `studently_user_permissions`. If an administrator's permission record is revoked, `User.has_perm()` immediately returns `False` without requiring token invalidation.

---

### 2.2. Academics & Faculty Models (`apps/academics/models.py`)

```python
import uuid
from django.db import models
from django.core.validators import MinValueValidator

class Teacher(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Deactivated', 'Deactivated'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True, max_length=254)
    phone = models.CharField(max_length=30)
    account_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    specialization = models.CharField(max_length=150, null=True, blank=True)
    joined_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_teachers'
        ordering = ['full_name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(account_status__in=['Active', 'Deactivated']),
                name='chk_teacher_account_status'
            )
        ]

    def __str__(self):
        return f"{self.full_name} ({self.email})"

class Classroom(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    section = models.CharField(max_length=20, default='A')
    room = models.CharField(max_length=50, null=True, blank=True)
    capacity = models.PositiveIntegerField(default=30, validators=[MinValueValidator(1)])
    academic_year = models.CharField(max_length=20, default='2026-2027', db_index=True)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='homeroom_classes',
        db_column='teacher_id',
        help_text="Assigned homeroom teacher (administrative/pastoral lead). Does not restrict multi-teacher co-teaching."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_classes'
        ordering = ['name', 'section']
        constraints = [
            models.UniqueConstraint(fields=['name', 'section', 'academic_year'], name='unique_class_section_year'),
            models.CheckConstraint(check=models.Q(capacity__gt=0), name='chk_class_capacity'),
        ]

    def __str__(self):
        return f"{self.name} - Section {self.section} ({self.academic_year})"

class Subject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.RESTRICT,
        related_name='subjects',
        db_column='class_id'
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, null=True, blank=True)
    max_marks = models.PositiveIntegerField(default=100, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_subjects'
        ordering = ['classroom', 'name']
        constraints = [
            models.UniqueConstraint(fields=['classroom', 'code'], name='unique_class_subject_code'),
            models.CheckConstraint(check=models.Q(max_marks__gt=0), name='chk_subject_max_marks'),
        ]

    def __str__(self):
        return f"{self.name} ({self.code or 'No Code'}) - {self.classroom.name}"

class TeacherClassAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.CASCADE,
        related_name='class_assignments',
        db_column='teacher_id'
    )
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='teacher_assignments',
        db_column='class_id'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'studently_teacher_class_assignments'
        constraints = [
            models.UniqueConstraint(fields=['teacher', 'classroom'], name='unique_teacher_class_assignment')
        ]

    def __str__(self):
        return f"{self.teacher.full_name} -> {self.classroom.name}"

class TeacherSubjectAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(
        Teacher,
        on_delete=models.CASCADE,
        related_name='subject_assignments',
        db_column='teacher_id'
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.CASCADE,
        related_name='teacher_assignments',
        db_column='subject_id'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'studently_teacher_subject_assignments'
        constraints = [
            models.UniqueConstraint(fields=['teacher', 'subject'], name='unique_teacher_subject_assignment')
        ]

    def __str__(self):
        return f"{self.teacher.full_name} -> {self.subject.name}"
```

---

### 2.3. Student Registry & Promotion Models (`apps/students/models.py`)

```python
import uuid
import re
from django.db import models
from django.core.exceptions import ValidationError

class StudentQuerySet(models.QuerySet):
    def active(self):
        return self.filter(status='Active')

    def for_teacher(self, teacher_user):
        if teacher_user.role == 'ADMIN':
            return self
        if teacher_user.teacher:
            assigned_class_ids = teacher_user.teacher.class_assignments.values_list('classroom_id', flat=True)
            return self.filter(classroom_id__in=assigned_class_ids)
        return self.none()

class Student(models.Model):
    """
    Master Student Registry Model.
    Preserves the exact seven-field contract from Phase 1:
      1. admission_number
      2. full_name
      3. gender
      4. date_of_birth
      5. parent_phone
      6. classroom (class_id)
      7. registration_date
    The 'status' field is an architectural lifecycle extension for soft-deletion and progression tracking.
    """
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
    ]
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Withdrawn', 'Withdrawn'),
        ('Graduated', 'Graduated'),
        ('Suspended', 'Suspended'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission_number = models.CharField(max_length=36, unique=True)
    full_name = models.CharField(max_length=150, db_index=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    parent_phone = models.CharField(max_length=30, db_index=True)
    classroom = models.ForeignKey(
        'academics.Classroom',
        on_delete=models.RESTRICT,
        related_name='students',
        db_column='class_id'
    )
    registration_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = StudentQuerySet.as_manager()

    class Meta:
        db_table = 'studently_students'
        ordering = ['admission_number']
        constraints = [
            models.CheckConstraint(check=models.Q(gender__in=['Male', 'Female']), name='chk_student_gender'),
            models.CheckConstraint(
                check=models.Q(status__in=['Active', 'Withdrawn', 'Graduated', 'Suspended']),
                name='chk_student_status'
            ),
        ]
        indexes = [
            models.Index(fields=['classroom', 'status'], name='idx_student_class_status'),
        ]

    def __str__(self):
        return f"{self.admission_number} — {self.full_name}"

    def clean(self):
        if not re.match(r'^STD-\d+$', self.admission_number):
            raise ValidationError("Admission number must follow the format 'STD-XXXX'.")

    @classmethod
    def generate_next_admission_number(cls):
        max_num = 1000
        for s in cls.objects.values_list('admission_number', flat=True):
            match = re.match(r'STD-(\d+)', s)
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
        return f"STD-{max_num + 1}"

class PromotionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        Student,
        on_delete=models.RESTRICT,
        related_name='promotions',
        db_column='student_id'
    )
    previous_classroom = models.ForeignKey(
        'academics.Classroom',
        on_delete=models.RESTRICT,
        related_name='past_promotions',
        db_column='previous_class_id'
    )
    new_classroom = models.ForeignKey(
        'academics.Classroom',
        on_delete=models.RESTRICT,
        related_name='incoming_promotions',
        db_column='new_class_id'
    )
    academic_year = models.CharField(max_length=20, db_index=True)
    promoted_date = models.DateField()
    promoted_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.RESTRICT,
        related_name='promotions_authorized',
        db_column='promoted_by_user_id'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'studently_promotions'
        ordering = ['-promoted_date']

    def __str__(self):
        return f"{self.student.admission_number}: {self.previous_classroom.name} -> {self.new_classroom.name} ({self.academic_year})"
```

---

### 2.4. Attendance Models (`apps/attendance/models.py`)

```python
import uuid
from django.db import models
from django.core.exceptions import ValidationError

class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ('Present', 'Present'),
        ('Absent', 'Absent'),
        ('Excused', 'Excused'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.RESTRICT,
        related_name='attendance_records',
        db_column='student_id'
    )
    classroom = models.ForeignKey(
        'academics.Classroom',
        on_delete=models.RESTRICT,
        related_name='attendance_records',
        db_column='class_id'
    )
    teacher = models.ForeignKey(
        'academics.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendance_marked',
        db_column='teacher_id'
    )
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Present')
    excused_reason = models.TextField(null=True, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_attendance'
        ordering = ['-date', 'student__full_name']
        constraints = [
            models.UniqueConstraint(fields=['student', 'date'], name='unique_student_daily_attendance'),
            models.CheckConstraint(
                check=models.Q(status__in=['Present', 'Absent', 'Excused']),
                name='chk_attendance_status'
            ),
        ]
        indexes = [
            models.Index(fields=['classroom', 'date'], name='idx_attendance_class_date'),
        ]

    def clean(self):
        if self.status == 'Excused' and not (self.excused_reason and self.excused_reason.strip()):
            raise ValidationError("Excused attendance must include a valid reason.")
```

---

### 2.5. Examinations & Relational Marks Models (`apps/examinations/models.py`)

```python
import uuid
from django.db import models
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError

class Examination(models.Model):
    EXAM_TYPE_CHOICES = [
        ('Midterm', 'Midterm Examination'),
        ('Final', 'Final Examination'),
    ]
    TERM_CHOICES = [
        ('Term 1', 'Term 1'),
        ('Term 2', 'Term 2'),
        ('Term 3', 'Term 3'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    classroom = models.ForeignKey(
        'academics.Classroom',
        on_delete=models.RESTRICT,
        related_name='examinations',
        db_column='class_id'
    )
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES)
    academic_year = models.CharField(max_length=20, db_index=True)
    term = models.CharField(max_length=20, choices=TERM_CHOICES)
    recorded_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_examinations'
        ordering = ['-academic_year', 'term', 'exam_type']
        constraints = [
            models.UniqueConstraint(fields=['classroom', 'exam_type', 'academic_year', 'term'], name='unique_class_exam_session'),
            models.CheckConstraint(check=models.Q(exam_type__in=['Midterm', 'Final']), name='chk_exam_type'),
            models.CheckConstraint(check=models.Q(term__in=['Term 1', 'Term 2', 'Term 3']), name='chk_exam_term'),
        ]
        indexes = [
            models.Index(fields=['classroom', 'academic_year'], name='idx_exam_class_year'),
        ]

    def __str__(self):
        return f"{self.classroom.name} — {self.exam_type} ({self.term} {self.academic_year})"

class ExaminationStudentSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    examination = models.ForeignKey(
        Examination,
        on_delete=models.CASCADE,
        related_name='student_summaries',
        db_column='examination_id'
    )
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.RESTRICT,
        related_name='exam_summaries',
        db_column='student_id'
    )
    activity_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0.00)])
    total_score = models.DecimalField(max_digits=6, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_examination_student_summaries'
        constraints = [
            models.UniqueConstraint(fields=['examination', 'student'], name='unique_exam_student_summary'),
            models.CheckConstraint(
                check=models.Q(activity_score__gte=0.00) | models.Q(activity_score__isnull=True),
                name='chk_activity_positive'
            ),
            models.CheckConstraint(check=models.Q(total_score__gte=0.00), name='chk_total_positive'),
        ]

class ExaminationMark(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    examination = models.ForeignKey(
        Examination,
        on_delete=models.CASCADE,
        related_name='marks',
        db_column='examination_id'
    )
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.RESTRICT,
        related_name='exam_marks',
        db_column='student_id'
    )
    subject = models.ForeignKey(
        'academics.Subject',
        on_delete=models.RESTRICT,
        related_name='exam_marks',
        db_column='subject_id'
    )
    score = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(0.00)])
    recorded_by = models.ForeignKey(
        'academics.Teacher',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='marks_entered',
        db_column='recorded_by_teacher_id'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_examination_marks'
        ordering = ['examination', 'student', 'subject']
        constraints = [
            models.UniqueConstraint(fields=['examination', 'student', 'subject'], name='unique_exam_student_subject_mark'),
            models.CheckConstraint(check=models.Q(score__gte=0.00), name='chk_mark_score_positive'),
        ]
        indexes = [
            models.Index(fields=['examination', 'subject'], name='idx_marks_exam_subject'),
        ]

    def clean(self):
        if self.score > self.subject.max_marks:
            raise ValidationError(f"Score ({self.score}) exceeds maximum marks for {self.subject.name} ({self.subject.max_marks}).")
```

---

### 2.6. Financial Invoicing, Payments & General Ledger Models (`apps/finances/models.py`)

```python
import uuid
from decimal import Decimal
from django.db import models, transaction
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError

class FeeStructure(models.Model):
    CATEGORY_CHOICES = [
        ('Class Fee', 'Class Fee'),
        ('School Fee', 'School Fee'),
        ('Registration', 'Registration Fee'),
        ('Other', 'Other Fee'),
    ]
    FREQUENCY_CHOICES = [
        ('Monthly', 'Monthly'),
        ('Termly', 'Termly'),
        ('One-Time', 'One-Time'),
        ('Annual', 'Annual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, unique=True)
    fee_category = models.CharField(max_length=30, choices=CATEGORY_CHOICES)
    default_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    currency = models.CharField(max_length=10, default='$')
    billing_frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='Monthly')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_fee_structures'
        ordering = ['name']
        constraints = [
            models.CheckConstraint(
                check=models.Q(fee_category__in=['Class Fee', 'School Fee', 'Registration', 'Other']),
                name='chk_fee_category'
            ),
            models.CheckConstraint(
                check=models.Q(billing_frequency__in=['Monthly', 'Termly', 'Annually', 'One-Time']),
                name='chk_fee_billing_frequency'
            ),
            models.CheckConstraint(check=models.Q(default_amount__gte=0.00), name='chk_fee_default_amount'),
        ]

    def __str__(self):
        return f"{self.name} ({self.code}): {self.currency}{self.default_amount}"

class StudentInvoice(models.Model):
    STATUS_CHOICES = [
        ('Unpaid', 'Unpaid'),
        ('Partially Paid', 'Partially Paid'),
        ('Paid', 'Paid'),
        ('Cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice_number = models.CharField(max_length=50, unique=True)
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.RESTRICT,
        related_name='invoices',
        db_column='student_id'
    )
    month = models.CharField(max_length=7, db_index=True) # YYYY-MM
    total_amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    total_amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, validators=[MinValueValidator(0.00)])
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Unpaid', db_index=True)
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_student_invoices'
        ordering = ['-month', 'invoice_number']
        constraints = [
            models.UniqueConstraint(fields=['student', 'month'], name='unique_student_month_invoice'),
            models.CheckConstraint(
                check=models.Q(total_amount_due__gte=0.00) & models.Q(total_amount_paid__gte=0.00),
                name='chk_invoice_amounts'
            ),
            models.CheckConstraint(
                check=models.Q(status__in=['Unpaid', 'Partially Paid', 'Paid', 'Cancelled']),
                name='chk_invoice_status'
            ),
        ]
        indexes = [
            models.Index(fields=['student', 'status'], name='idx_invoice_student_status'),
        ]

    def __str__(self):
        return f"{self.invoice_number} ({self.student.admission_number}) - {self.month} [{self.status}]"

    @property
    def outstanding_balance(self):
        return max(Decimal('0.00'), self.total_amount_due - self.total_amount_paid)

    def reconcile_status(self):
        if self.status == 'Cancelled':
            return
        if self.total_amount_paid >= self.total_amount_due:
            self.status = 'Paid'
        elif self.total_amount_paid > Decimal('0.00'):
            self.status = 'Partially Paid'
        else:
            self.status = 'Unpaid'

class InvoiceItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.CASCADE,
        related_name='items',
        db_column='invoice_id'
    )
    fee_structure = models.ForeignKey(
        FeeStructure,
        on_delete=models.RESTRICT,
        related_name='invoiced_items',
        db_column='fee_structure_id'
    )
    description = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.00)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'studently_invoice_items'
        constraints = [
            models.CheckConstraint(check=models.Q(amount__gte=0.00), name='chk_invoice_item_amount')
        ]

class StudentPayment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('Cash', 'Cash'),
        ('ZAAD', 'ZAAD Mobile Money'),
        ('eDahab', 'eDahab Mobile Money'),
    ]
    TRANSACTION_TYPE_CHOICES = [
        ('Payment', 'Payment'),
        ('Reversal', 'Reversal'),
        ('Refund', 'Refund'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt_number = models.CharField(max_length=50, unique=True)
    invoice = models.ForeignKey(
        StudentInvoice,
        on_delete=models.RESTRICT,
        null=True,   # DB-nullable strictly for historical Phase 1 legacy data migration compatibility.
        blank=True,  # Operational API & process_payment() enforce invoice NOT NULL (Option A adopted).
        related_name='payments',
        db_column='invoice_id'
    )
    student = models.ForeignKey(
        'students.Student',
        on_delete=models.RESTRICT,
        related_name='payments',
        db_column='student_id'
    )
    fee_category = models.CharField(max_length=30)
    month = models.CharField(max_length=7, db_index=True) # YYYY-MM
    amount_due = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)])
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
    payment_date = models.DateField(db_index=True)
    transaction_ref = models.CharField(max_length=100)  # Mobile money gateway ref OR 'CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>'
    recorded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.RESTRICT,
        related_name='payments_recorded',
        db_column='recorded_by_user_id'
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES, default='Payment', db_index=True)
    is_reversal = models.BooleanField(default=False)
    reversed_payment = models.ForeignKey(
        'self',
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name='reversal_transactions',
        db_column='reversed_payment_id'
    )
    reversal_reason = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'studently_student_payments'
        ordering = ['-payment_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['payment_method', 'transaction_ref'], name='unique_payment_method_transaction_ref'),
            models.CheckConstraint(check=models.Q(amount_paid__gt=0.00), name='chk_payment_amount_positive'),
            models.CheckConstraint(
                check=models.Q(payment_method__in=['Cash', 'ZAAD', 'eDahab']),
                name='chk_payment_method'
            ),
            models.CheckConstraint(
                check=models.Q(transaction_type__in=['Payment', 'Reversal', 'Refund']),
                name='chk_payment_transaction_type'
            ),
            models.CheckConstraint(
                check=models.Q(fee_category__in=['Class Fee', 'School Fee', 'Registration', 'Other']),
                name='chk_payment_fee_category'
            ),
            models.CheckConstraint(
                check=(
                    (models.Q(transaction_type='Payment') & models.Q(is_reversal=False) & models.Q(reversed_payment__isnull=True)) |
                    (models.Q(transaction_type='Reversal') & models.Q(is_reversal=True) & models.Q(reversed_payment__isnull=False)) |
                    (models.Q(transaction_type='Refund') & models.Q(is_reversal=False) & models.Q(reversed_payment__isnull=False))
                ),
                name='chk_payment_reversal_state'
            ),
        ]
        indexes = [
            models.Index(fields=['student', 'payment_date'], name='idx_payment_student_date'),
        ]

    def __str__(self):
        return f"{self.receipt_number} [{self.transaction_type}] — {self.student.admission_number}: ${self.amount_paid} ({self.payment_method})"

    def clean(self):
        # Enforce consistency between transaction_type, is_reversal, and reversed_payment
        if self.transaction_type == 'Reversal':
            self.is_reversal = True
            if not self.reversed_payment:
                raise ValidationError("Reversals must reference an original payment record.")
            if self.reversed_payment.transaction_type != 'Payment':
                raise ValidationError("Cannot reverse an entry that is itself a reversal or refund.")
            if not (self.reversal_reason and self.reversal_reason.strip()):
                raise ValidationError("Reversals require a documented reversal_reason.")
            if self.amount_paid != self.reversed_payment.amount_paid:
                raise ValidationError("Reversal amount must match 100% of the original payment amount.")
        elif self.transaction_type == 'Refund':
            self.is_reversal = False
            if not self.reversed_payment:
                raise ValidationError("Refunds must reference an original payment record.")
            if self.reversed_payment.transaction_type != 'Payment':
                raise ValidationError("Cannot refund an entry that is itself a reversal or refund.")
            if not (self.reversal_reason and self.reversal_reason.strip()):
                raise ValidationError("Refunds require a documented reversal_reason.")
        else:
            self.is_reversal = False
            if self.reversed_payment:
                raise ValidationError("Standard payments cannot reference a reversed payment.")

    def delete(self, *args, **kwargs):
        raise PermissionDenied("Payment ledger records are immutable and cannot be deleted.")

    def save(self, *args, **kwargs):
        if self.pk and not self._state.adding:
            raise PermissionDenied("Payment ledger records are append-only and cannot be updated.")
        self.full_clean()
        super().save(*args, **kwargs)

# =========================================================================
# Domain Service Layer: Payment Processing, Reversals & Refunds (apps/finances/services.py)
# =========================================================================

import hashlib
import uuid
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone


class IdempotencyConflictError(ValidationError):
    """Raised when an Idempotency-Key or transaction_ref is reused with a different logical payload (HTTP 409 Conflict)."""


def derive_cash_transaction_ref(idempotency_key: str) -> str:
    """
    Deterministically derives the canonical persistent Cash transaction reference
    from the client-supplied Idempotency-Key BEFORE duplicate checking or insertion.

    Canonical format: CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>
    - Valid UUID key -> lowercase canonical UUID (36 chars) -> total length 46 chars.
    - Other valid printable ASCII key (8..255 chars) -> SHA-256 hex digest (64 chars) -> total length 74 chars.
    Always fits comfortably within StudentPayment.transaction_ref VARCHAR(100), including REV-/REF- suffixes.
    """
    if not isinstance(idempotency_key, str):
        raise ValidationError("Idempotency-Key is required for Cash payments.")
    raw = idempotency_key.strip()
    if len(raw) < 8 or len(raw) > 255 or not raw.isascii() or not raw.isprintable():
        raise ValidationError("Idempotency-Key must be 8-255 printable ASCII characters.")
    try:
        normalized = str(uuid.UUID(raw)).lower()  # 36 chars -> 46 chars total
    except ValueError:
        normalized = hashlib.sha256(raw.encode('utf-8')).hexdigest()  # 64 chars -> 74 chars total
    return f"CASH-IDEM-{normalized}"


def _build_logical_payment_fingerprint(
    *, student, invoice, fee_category, month, amount, payment_method
) -> tuple:
    """
    Constructs the canonical logical payload tuple for idempotency consistency checks.
    STUDENTLY operates in single-currency USD; if multi-currency is added later, include currency.
    """
    return (
        str(student.id),
        str(invoice.id),
        Decimal(amount),
        payment_method,
        fee_category,
        month,
        'Payment',
    )


def _matches_logical_payment_payload(existing, payload_fingerprint: tuple) -> bool:
    """Compares an incoming canonical payload fingerprint against a persisted StudentPayment."""
    existing_fingerprint = (
        str(existing.student_id),
        str(existing.invoice_id),
        existing.amount_paid,
        existing.payment_method,
        existing.fee_category,
        existing.month,
        existing.transaction_type,
    )
    return existing_fingerprint == payload_fingerprint


def _validate_and_return_existing(existing, payload_fingerprint: tuple, *, cause=None):
    """
    Validates logical payload consistency for a matched idempotent payment.
    Returns (existing, False) on exact match; raises IdempotencyConflictError (HTTP 409) on mismatch.
    """
    if _matches_logical_payment_payload(existing, payload_fingerprint):
        return existing, False
    error = IdempotencyConflictError(
        "Idempotency key / transaction reference was already used with a different payment payload."
    )
    if cause is not None:
        raise error from cause
    raise error


def _find_existing_payment(*, payment_method: str, transaction_ref: str):
    """
    Initial non-locking persistent duplicate lookup executed prior to acquiring the invoice row lock.
    """
    return StudentPayment.objects.filter(
        payment_method=payment_method,
        transaction_ref=transaction_ref,
    ).first()


def _find_existing_payment_current_read(*, payment_method: str, transaction_ref: str):
    """
    Current/locking read used inside transaction.atomic() for:
      1. The mandatory post-invoice-lock duplicate lookup (BEFORE balance validation).
      2. Post-IntegrityError unique-constraint race recovery.

    Backend Concurrency Semantics:
    - MySQL 8.0.16+ (InnoDB, default REPEATABLE READ): An ordinary SELECT uses the
      transaction's earlier MVCC snapshot and may NOT observe a payment row committed
      concurrently by another transaction. Adding .select_for_update() issues a SQL
      current/locking read (SELECT ... FOR UPDATE), which bypasses the MVCC snapshot
      and reads the latest committed index record for (payment_method, transaction_ref).
    - SQLite (v3.35+ Development): SQLite does not support row-level locks or FOR UPDATE;
      Django compiles select_for_update() as a standard SELECT, and concurrency relies on
      database-wide file write locks. SQLite does NOT provide MySQL-equivalent row locking.
    """
    return (
        StudentPayment.objects
        .select_for_update()
        .filter(
            payment_method=payment_method,
            transaction_ref=transaction_ref,
        )
        .first()
    )


def _is_payment_ref_unique_violation(exc: IntegrityError) -> bool:
    """
    Verifies whether a caught IntegrityError corresponds specifically to the expected
    UNIQUE(payment_method, transaction_ref) constraint ('unique_payment_method_transaction_ref').

    Backend notes:
    - MySQL 8.0.16+: Error code 1062 (ER_DUP_ENTRY) referencing 'unique_payment_method_transaction_ref'.
    - SQLite 3.35+: UNIQUE constraint failed on 'studently_student_payments.payment_method,
      studently_student_payments.transaction_ref'.
    Unrelated integrity failures (CHECK constraints, FK violations, unique_receipt_number collisions)
    return False and MUST be re-raised immediately.
    """
    msg = str(exc).lower()
    if 'unique_payment_method_transaction_ref' in msg:
        return True
    if 'payment_method' in msg and 'transaction_ref' in msg and ('duplicate' in msg or 'unique' in msg):
        return True
    return False


def process_payment(
    *,
    student,
    invoice,
    fee_category,
    month,
    amount,
    payment_method,
    user,
    idempotency_key=None,
    transaction_ref=None,
    notes=None,
):
    """
    Processes a positive student payment voucher under OPTION A (Invoice Required) and
    atomically reconciles the linked invoice with durable database-enforced idempotency.

    Returns:
        tuple[StudentPayment, bool]: (payment_instance, created)
        - (payment, True)  -> Newly created payment (API returns HTTP 201 Created).
        - (payment, False) -> Idempotent replay with matching payload (API returns HTTP 200 OK with original receipt).

    Financial Invariants & Concurrency Protections:
    1. Option A (Mandatory Invoice): All new operational payments MUST reference an active invoice.
       Nullable StudentPayment.invoice_id is reserved solely for Phase 1 legacy data migration.
       Existing payments are NEVER mutated or reassigned (Option B is NOT supported under the frozen 20-table schema).
    2. Durable Cash Idempotency (MEDIUM-02-A): For Cash payments, transaction_ref is deterministically
       derived as 'CASH-IDEM-<NORMALIZED_IDEMPOTENCY_KEY>' BEFORE duplicate lookup and insertion.
       Receipt numbers are NEVER used as the source of idempotency. Redis/Django cache may be used
       strictly as an optional fast-path optimization, NEVER as the source of truth.
    3. Global Uniqueness Scope: UNIQUE(payment_method, transaction_ref) enforces global uniqueness per
       payment method across studently_student_payments (not per-user or per-student).
    4. Payload Consistency: Same key + same payload returns original payment; same key + different
       payload raises IdempotencyConflictError (HTTP 409 Conflict).
    5. Two-Stage Duplicate Lookup (CONC-01): An initial non-locking duplicate lookup runs before
       locking; a MANDATORY SECOND current-read duplicate lookup runs inside transaction.atomic()
       immediately AFTER acquiring StudentInvoice.select_for_update() and validating ownership,
       and strictly BEFORE calculating or validating the outstanding invoice balance. This ensures
       concurrent retries on a newly paid-off invoice return the original receipt instead of failing
       with a zero-balance ValidationError.
    6. MySQL REPEATABLE READ Current-Read Race Recovery (CONC-02): Payment insert is wrapped in an
       inner transaction.atomic() savepoint. IntegrityError is caught outside the failed savepoint,
       verified against UNIQUE(payment_method, transaction_ref), and recovered using a current/locking
       read (.select_for_update()) so InnoDB REPEATABLE READ snapshots never mask a concurrently
       committed winning row. Unrelated IntegrityError exceptions are ALWAYS re-raised.
    7. Immutable Ledger: Created records cannot be updated or deleted; corrections occur solely via Reversal/Refund.
    """
    # 1. Option A — Mandatory Invoice & Positive Amount Validation
    if invoice is None:
        raise ValidationError("An active invoice is required for all new operational payments (Option A).")

    amount = Decimal(amount)
    if amount <= Decimal('0.00'):
        raise ValidationError("Payment amount must be strictly positive.")

    # 2. Validate Idempotency-Key & Resolve Canonical Persistent transaction_ref BEFORE Lookups
    if payment_method == 'Cash':
        resolved_ref = derive_cash_transaction_ref(idempotency_key)
    elif payment_method in ('ZAAD', 'eDahab'):
        if not transaction_ref or not str(transaction_ref).strip():
            raise ValidationError(f"A non-empty external transaction_ref is required for {payment_method} payments.")
        resolved_ref = str(transaction_ref).strip()
        if len(resolved_ref) > 100:
            raise ValidationError("transaction_ref must not exceed 100 characters.")
    else:
        raise ValidationError(f"Unsupported payment_method: '{payment_method}'.")

    # 3. Compute Canonical Logical Payload Fingerprint
    payload_fingerprint = _build_logical_payment_fingerprint(
        student=student,
        invoice=invoice,
        fee_category=fee_category,
        month=month,
        amount=amount,
        payment_method=payment_method,
    )

    # 4. Initial Persistent Duplicate Lookup (Fast-path before acquiring invoice lock)
    existing = _find_existing_payment(
        payment_method=payment_method,
        transaction_ref=resolved_ref,
    )
    if existing is not None:
        return _validate_and_return_existing(existing, payload_fingerprint)

    # 5. Begin Atomic Transaction & Lock Target Invoice Row
    with transaction.atomic():
        invoice_obj = StudentInvoice.objects.select_for_update().get(id=invoice.id)

        # 6. Validate Cross-Entity Invoice Ownership
        if str(invoice_obj.student_id) != str(student.id):
            raise ValidationError("The selected invoice does not belong to this student.")

        # 7. MANDATORY SECOND DUPLICATE LOOKUP (Current/Locking Read)
        # MUST occur after invoice lock & ownership check, and BEFORE balance calculation/validation.
        # Under MySQL InnoDB REPEATABLE READ, select_for_update() performs a current read that
        # observes any winning payment committed while this request waited on the invoice lock.
        existing = _find_existing_payment_current_read(
            payment_method=payment_method,
            transaction_ref=resolved_ref,
        )
        if existing is not None:
            return _validate_and_return_existing(existing, payload_fingerprint)

        # 8. Validate Invoice Status & Outstanding Balance Ceiling (Only if no duplicate exists)
        if invoice_obj.status == 'Cancelled':
            raise ValidationError("Cannot post payment to a Cancelled invoice.")
        remaining_balance = invoice_obj.total_amount_due - invoice_obj.total_amount_paid
        if remaining_balance <= Decimal('0.00'):
            raise ValidationError("This invoice has no remaining outstanding balance.")
        if amount > remaining_balance:
            raise ValidationError(
                f"Payment amount (${amount}) exceeds remaining invoice balance (${remaining_balance})."
            )

        # 9. Atomic Insert inside Nested Savepoint for Concurrent Unique-Constraint Race Recovery
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
            notes=notes,
        )
        try:
            with transaction.atomic():  # Inner savepoint isolates failed insert so outer tx remains usable
                payment.save()  # full_clean() executed automatically
        except IntegrityError as exc:
            # Recover ONLY if the IntegrityError corresponds to UNIQUE(payment_method, transaction_ref).
            # Never suppress unrelated IntegrityError (CHECK constraint, FK error, unique_receipt_number).
            if not _is_payment_ref_unique_violation(exc):
                raise

            # Current/locking read bypasses MySQL InnoDB REPEATABLE READ snapshot to observe
            # the committed winning row (e.g. concurrent same-key race across different invoices).
            raced_existing = _find_existing_payment_current_read(
                payment_method=payment_method,
                transaction_ref=resolved_ref,
            )
            if raced_existing is not None:
                return _validate_and_return_existing(
                    raced_existing,
                    payload_fingerprint,
                    cause=exc,
                )
            # If no committed winning row is found, re-raise original IntegrityError
            raise

        # 10. Reconcile Invoice ONLY for the Single Winning Insert
        invoice_obj.total_amount_paid += amount
        invoice_obj.reconcile_status()
        invoice_obj.save(update_fields=['total_amount_paid', 'status', 'updated_at'])

        return payment, True


# =========================================================================
# MySQL Deadlock and Transaction Retry Policy (apps/finances/services.py)
# =========================================================================
# Authoritative specification: documentation/phase-2/MYSQL_DEADLOCK_RETRY_POLICY.md
# - Retries ONLY MySQL InnoDB deadlock error 1213 (ER_LOCK_DEADLOCK) OUTSIDE the failed
#   transaction.atomic() block after complete transaction rollback.
# - Distinguishes error 1205 (ER_LOCK_WAIT_TIMEOUT): NOT blindly retried; raises controlled
#   PaymentConcurrencyError (HTTP 503 Service Unavailable) after full rollback.
# - Bounded retries: MAX_DEADLOCK_RETRIES = 3 (1 initial attempt + up to 2 full-transaction retries).
# - Every retry opens a fresh transaction and repeats all idempotency lookups (CONC-01).
# - IntegrityError races on UNIQUE(payment_method, transaction_ref) remain handled exclusively
#   by CONC-02 inside process_payment() and NEVER enter the deadlock retry loop.
# - Unrelated OperationalError exceptions propagate immediately without retry.
# - SQLite does NOT provide MySQL-equivalent row-level locking or error 1213 deadlocks.
# - Status: Architecture Specified; NOT runtime-tested (deferred to Phase 3 MySQL staging).

MAX_DEADLOCK_RETRIES = 3
MYSQL_ERR_LOCK_DEADLOCK = 1213
MYSQL_ERR_LOCK_WAIT_TIMEOUT = 1205


class PaymentConcurrencyError(Exception):
    """Controlled concurrency failure (HTTP 503) on MySQL 1205 timeout or 1213 retry exhaustion."""


def process_payment_with_deadlock_retry(**kwargs):
    """
    Outer bounded full-transaction retry wrapper around process_payment() strictly for
    MySQL InnoDB error 1213 (ER_LOCK_DEADLOCK). See MYSQL_DEADLOCK_RETRY_POLICY.md for
    complete error-code extraction, jittered backoff, and Phase 3 test specifications.
    """
    import random
    import time
    from django.db import OperationalError, connection

    for attempt in range(1, MAX_DEADLOCK_RETRIES + 1):
        try:
            return process_payment(**kwargs)
        except OperationalError as exc:
            orig = getattr(exc, '__cause__', None) or exc
            args = getattr(orig, 'args', ())
            err_code = args[0] if (connection.vendor == 'mysql' and args and isinstance(args[0], int)) else None

            if err_code == MYSQL_ERR_LOCK_DEADLOCK:
                if attempt >= MAX_DEADLOCK_RETRIES:
                    raise PaymentConcurrencyError(
                        "Payment failed after maximum MySQL deadlock retries (1213). "
                        "Retry safely with the same Idempotency-Key."
                    ) from exc
                time.sleep((0.025 * (2 ** (attempt - 1))) + random.uniform(0.0, 0.025))
                continue

            if err_code == MYSQL_ERR_LOCK_WAIT_TIMEOUT:
                raise PaymentConcurrencyError(
                    "Payment lock wait timed out (MySQL 1205). "
                    "Retry safely with the same Idempotency-Key."
                ) from exc

            raise  # Never retry unrelated OperationalError exceptions


def reverse_payment(*, original_payment, user, reason):
    """
    Executes a 100% full reversal of an erroneous or bounced payment voucher.
    Reversal amount matches original payment exactly. Cannot be partial.
    """
    with transaction.atomic():
        orig = StudentPayment.objects.select_for_update().get(id=original_payment.id)
        if orig.transaction_type != 'Payment':
            raise ValidationError("Only standard payments can be reversed.")
        if orig.reversal_transactions.filter(transaction_type='Reversal').exists():
            raise ValidationError("This payment voucher has already been reversed.")
        if orig.reversal_transactions.filter(transaction_type='Refund').exists():
            raise ValidationError("Cannot reverse a payment that already has refund transactions.")
            
        invoice_obj = None
        if orig.invoice_id:
            invoice_obj = StudentInvoice.objects.select_for_update().get(id=orig.invoice_id)
            if invoice_obj.status == 'Cancelled':
                raise ValidationError("Cannot adjust a Cancelled invoice.")
        
        reversal = StudentPayment(
            receipt_number=f"REV-{orig.receipt_number}",
            invoice=invoice_obj,
            student=orig.student,
            fee_category=orig.fee_category,
            month=orig.month,
            amount_due=invoice_obj.total_amount_due if invoice_obj else Decimal('0.00'),
            amount_paid=orig.amount_paid,  # Strictly positive, matches 100% of original
            payment_method=orig.payment_method,
            transaction_ref=f"REV-{orig.transaction_ref}",
            recorded_by=user,
            transaction_type='Reversal',
            is_reversal=True,
            reversed_payment=orig,
            reversal_reason=reason
        )
        reversal.save()
        
        if invoice_obj:
            invoice_obj.total_amount_paid = max(Decimal('0.00'), invoice_obj.total_amount_paid - orig.amount_paid)
            invoice_obj.reconcile_status()
            invoice_obj.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
            
        return reversal

def refund_payment(*, original_payment, amount, user, reason):
    """
    Executes a full or partial refund voucher back to student/payer.
    Supports multiple partial refunds up to the net un-refunded payment amount.
    """
    with transaction.atomic():
        orig = StudentPayment.objects.select_for_update().get(id=original_payment.id)
        if orig.transaction_type != 'Payment':
            raise ValidationError("Only standard payments can be refunded.")
        if orig.reversal_transactions.filter(transaction_type='Reversal').exists():
            raise ValidationError("Cannot refund a payment that has been completely reversed.")
            
        already_refunded = orig.reversal_transactions.filter(
            transaction_type='Refund'
        ).aggregate(total=models.Sum('amount_paid'))['total'] or Decimal('0.00')
        
        max_refundable = orig.amount_paid - already_refunded
        if amount > max_refundable:
            raise ValidationError(f"Requested refund (${amount}) exceeds maximum refundable balance (${max_refundable}).")
            
        invoice_obj = None
        if orig.invoice_id:
            invoice_obj = StudentInvoice.objects.select_for_update().get(id=orig.invoice_id)
            if invoice_obj.status == 'Cancelled':
                raise ValidationError("Cannot adjust a Cancelled invoice.")
        
        refund_seq = orig.reversal_transactions.filter(transaction_type='Refund').count() + 1
        refund = StudentPayment(
            receipt_number=f"REF-{orig.receipt_number}-{refund_seq}",
            invoice=invoice_obj,
            student=orig.student,
            fee_category=orig.fee_category,
            month=orig.month,
            amount_due=invoice_obj.total_amount_due if invoice_obj else Decimal('0.00'),
            amount_paid=amount,  # Strictly positive
            payment_method=orig.payment_method,
            transaction_ref=f"REF-{orig.transaction_ref}-{refund_seq}",
            recorded_by=user,
            transaction_type='Refund',
            is_reversal=False,
            reversed_payment=orig,
            reversal_reason=reason
        )
        refund.save()
        
        if invoice_obj:
            invoice_obj.total_amount_paid = max(Decimal('0.00'), invoice_obj.total_amount_paid - amount)
            invoice_obj.reconcile_status()
            invoice_obj.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
            
        return refund

class Income(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('Cash', 'Cash'),
        ('ZAAD', 'ZAAD Mobile Money'),
        ('eDahab', 'eDahab Mobile Money'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, db_index=True)
    description = models.TextField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.00)])
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='Cash')
    date = models.DateField(db_index=True)
    reference_number = models.CharField(max_length=100)
    recorded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incomes_recorded',
        db_column='recorded_by_user_id'
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_incomes'
        ordering = ['-date', '-created_at']
        constraints = [
            models.CheckConstraint(check=models.Q(amount__gte=0.00), name='chk_income_amount'),
            models.CheckConstraint(
                check=models.Q(payment_method__in=['Cash', 'ZAAD', 'eDahab']),
                name='chk_income_payment_method'
            ),
        ]
        indexes = [
            models.Index(fields=['category', 'date'], name='idx_income_cat_date'),
        ]

class Expense(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('Cash', 'Cash'),
        ('ZAAD', 'ZAAD Mobile Money'),
        ('eDahab', 'eDahab Mobile Money'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, db_index=True)
    description = models.TextField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0.00)])
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='Cash')
    date = models.DateField(db_index=True)
    reference_number = models.CharField(max_length=100)
    recorded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses_recorded',
        db_column='recorded_by_user_id'
    )
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_expenses'
        ordering = ['-date', '-created_at']
        constraints = [
            models.CheckConstraint(check=models.Q(amount__gte=0.00), name='chk_expense_amount'),
            models.CheckConstraint(
                check=models.Q(payment_method__in=['Cash', 'ZAAD', 'eDahab']),
                name='chk_expense_payment_method'
            ),
        ]
```

---

### 2.7. System Preferences Singleton Model (`apps/core/models.py`)

```python
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError

class SystemSetting(models.Model):
    CALC_METHOD_CHOICES = [
        ('sum', 'Simple Sum (Midterm + Final)'),
        ('average', 'Equal Average (50% Midterm / 50% Final)'),
        ('weighted', 'Weighted Percentage'),
    ]
    TERM_CHOICES = [
        ('Term 1', 'Term 1'),
        ('Term 2', 'Term 2'),
        ('Term 3', 'Term 3'),
    ]

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    institution_name = models.CharField(max_length=200, default='MADARASATUL AL-IMAAM')
    institution_logo = models.CharField(max_length=255, default='/assets/aistudio/image_6159b039.png')
    contact_phone = models.CharField(max_length=50, default='063-4129440')
    contact_email = models.EmailField(max_length=254, default='admin@alimaama.demo')
    address = models.CharField(max_length=255, default='Hargeisa, Somaliland')
    academic_year = models.CharField(max_length=20, default='2026-2027')
    current_term = models.CharField(max_length=20, choices=TERM_CHOICES, default='Term 1')
    class_fee_monthly = models.DecimalField(max_digits=8, decimal_places=2, default=45.00, validators=[MinValueValidator(0.00)])
    school_fee_monthly = models.DecimalField(max_digits=8, decimal_places=2, default=35.00, validators=[MinValueValidator(0.00)])
    currency_symbol = models.CharField(max_length=10, default='$')
    result_calc_method = models.CharField(max_length=20, choices=CALC_METHOD_CHOICES, default='sum')
    weighted_midterm = models.PositiveIntegerField(default=40, validators=[MinValueValidator(0), MaxValueValidator(100)])
    weighted_final = models.PositiveIntegerField(default=60, validators=[MinValueValidator(0), MaxValueValidator(100)])
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'studently_system_settings'
        verbose_name = 'System Setting'
        verbose_name_plural = 'System Settings'
        constraints = [
            models.CheckConstraint(check=models.Q(id=1), name='chk_settings_singleton_id'),
            models.CheckConstraint(
                check=models.Q(result_calc_method__in=['sum', 'average', 'weighted']),
                name='chk_settings_calc_method'
            ),
            models.CheckConstraint(
                check=models.Q(current_term__in=['Term 1', 'Term 2', 'Term 3']),
                name='chk_settings_term'
            ),
            models.CheckConstraint(
                check=models.Q(class_fee_monthly__gte=0.00) & models.Q(school_fee_monthly__gte=0.00),
                name='chk_settings_fees_positive'
            ),
            models.CheckConstraint(
                check=models.Q(weighted_midterm__gte=0) & models.Q(weighted_midterm__lte=100) &
                      models.Q(weighted_final__gte=0) & models.Q(weighted_final__lte=100),
                name='chk_weights_range'
            ),
            models.CheckConstraint(
                check=~models.Q(result_calc_method='weighted') | models.Q(weighted_midterm=100 - models.F('weighted_final')),
                name='chk_weights_sum'
            ),
        ]

    def clean(self):
        self.id = 1
        if self.result_calc_method == 'weighted' and (self.weighted_midterm + self.weighted_final != 100):
            raise ValidationError("Weighted Midterm and Final percentages must sum exactly to 100%.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(id=1)
        return obj
```

def reconcile_invoice(*, invoice_id):
    """
    Recalculates total_amount_paid and status from all linked ledger entries.
    Must be called inside transaction.atomic() with select_for_update().
    """
    with transaction.atomic():
        invoice = StudentInvoice.objects.select_for_update().get(id=invoice_id)
        if invoice.status == 'Cancelled':
            raise ValidationError("Cannot reconcile a Cancelled invoice.")
            
        payments = StudentPayment.objects.filter(invoice=invoice, transaction_type='Payment')
        reversals = StudentPayment.objects.filter(invoice=invoice, transaction_type='Reversal')
        refunds = StudentPayment.objects.filter(invoice=invoice, transaction_type='Refund')
        
        total_inflow = payments.aggregate(s=models.Sum('amount_paid'))['s'] or Decimal('0.00')
        total_reversed = reversals.aggregate(s=models.Sum('amount_paid'))['s'] or Decimal('0.00')
        total_refunded = refunds.aggregate(s=models.Sum('amount_paid'))['s'] or Decimal('0.00')
        
        net_paid = max(Decimal('0.00'), total_inflow - total_reversed - total_refunded)
        invoice.total_amount_paid = net_paid
        invoice.reconcile_status()
        invoice.save(update_fields=['total_amount_paid', 'status', 'updated_at'])
        return invoice
