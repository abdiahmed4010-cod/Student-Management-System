"""
Custom User Model and Manager for STUDENTLY (Stage 3.3).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.1)
- documentation/phase-2/DATA_DICTIONARY.md (Section 2.1: studently_users)
- documentation/phase-2/DATABASE_ARCHITECTURE.md (Section 3.1)

Staged Migration Sequencing Note:
- The nullable ForeignKey `teacher` (`db_column='teacher_id'`, referencing
  `academics.Teacher`, `on_delete=SET_NULL`) is deferred to a follow-up
  migration in the stage that introduces `apps.academics`, because Stage 3.3
  strictly prohibits creating business models such as `Teacher`.
- `UserPermission` (`studently_user_permissions`) implemented in Stage 3.6
  (RBAC). `has_perm()` and `has_module_perms()` follow the approved Phase 2
  fail-closed specification and evaluate against explicit permission records.
"""

import re
import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import models

VALID_ROLES = {"ADMIN", "TEACHER"}
VALID_STATUSES = {"Active", "Deactivated"}
VALID_MODULES = {
    "students",
    "attendance",
    "examinations",
    "reports",
    "fees",
    "payments",
    "income",
    "expenses",
    "teachers",
    "classes",
    "subjects",
    "users",
    "certificates",
    "settings",
}
TEACHER_FORBIDDEN_MODULES = {
    "fees",
    "payments",
    "income",
    "expenses",
    "users",
    "settings",
    "certificates",
}
TEACHER_ALLOWED_MODULES = {
    "students",
    "attendance",
    "examinations",
    "reports",
    "classes",
    "subjects",
    "teachers",
}
VALID_ACTION_FIELDS = {
    "can_view",
    "can_add",
    "can_edit",
    "can_delete",
    "can_import",
    "can_print",
    "can_export",
}
DJANGO_STYLE_ACTION_RE = re.compile(r"^(view|add|change|delete)_([a-z][a-z0-9_]*)$")


class CustomUserManager(BaseUserManager):
    """Manager for STUDENTLY's email-authenticated custom User model."""

    def _create_user(self, email, password=None, *, allow_superuser=False, **extra_fields):
        if not email or not isinstance(email, str) or not email.strip():
            raise ValueError("The Email field must be set.")

        normalized_email = self.normalize_email(email.strip()).lower()
        try:
            validate_email(normalized_email)
        except ValidationError as exc:
            raise ValueError("Enter a valid email address.") from exc

        full_name = extra_fields.get("full_name")
        if not full_name or not isinstance(full_name, str) or not full_name.strip():
            raise ValueError("The full_name field must be set.")
        extra_fields["full_name"] = full_name.strip()

        role = extra_fields.setdefault("role", "TEACHER")
        if role not in VALID_ROLES:
            raise ValueError("Role must be either 'ADMIN' or 'TEACHER'.")

        is_superuser = bool(extra_fields.setdefault("is_superuser", False))
        if is_superuser and not allow_superuser:
            raise ValueError(
                "Superuser privileges cannot be assigned through create_user(); "
                "use create_superuser()."
            )
        if is_superuser and role != "ADMIN":
            raise ValueError("Only ADMIN accounts may hold superuser privileges.")

        status = extra_fields.setdefault("status", "Active")
        if status not in VALID_STATUSES:
            raise ValueError("Status must be either 'Active' or 'Deactivated'.")

        if status == "Deactivated":
            if extra_fields.get("is_active") is True:
                raise ValueError("A deactivated user cannot have is_active=True.")
            extra_fields["is_active"] = False
        else:
            extra_fields.setdefault("is_active", True)

        user = self.model(email=normalized_email, **extra_fields)

        if password is not None:
            if not isinstance(password, str) or not password:
                raise ValueError("Password must be a non-empty string.")
            validate_password(password, user=user)
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        """
        Create a standard ADMIN or TEACHER account.
        Never allows `is_superuser=True`.
        """
        return self._create_user(
            email,
            password=password,
            allow_superuser=False,
            **extra_fields,
        )

    def create_superuser(self, email, password=None, **extra_fields):
        if not password:
            raise ValueError("Superuser must have a password.")

        extra_fields.setdefault("role", "ADMIN")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("status", "Active")
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("role") != "ADMIN":
            raise ValueError("Superuser must have role='ADMIN'.")
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        if extra_fields.get("status") != "Active" or extra_fields.get("is_active") is not True:
            raise ValueError("Superuser must have status='Active' and is_active=True.")

        return self._create_user(
            email,
            password=password,
            allow_superuser=True,
            **extra_fields,
        )


class User(AbstractBaseUser):
    """
    STUDENTLY Custom User Model (`studently_users`).

    Inherits directly from `AbstractBaseUser` (omitting `PermissionsMixin` per
    approved Phase 2 architecture to avoid redundant `auth_group` / `auth_permission`
    tables and preserve custom fail-closed RBAC).
    """

    ROLE_CHOICES = [
        ("ADMIN", "Administrator"),
        ("TEACHER", "Teacher"),
    ]
    STATUS_CHOICES = [
        ("Active", "Active"),
        ("Deactivated", "Deactivated"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, max_length=254)
    full_name = models.CharField(max_length=150)
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="TEACHER",
        db_index=True,
    )
    teacher = models.ForeignKey(
        "academics.Teacher",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_accounts",
        db_column="teacher_id",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Active",
        db_index=True,
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "studently_users"
        ordering = ["full_name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=["ADMIN", "TEACHER"]),
                name="chk_user_role",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["Active", "Deactivated"]),
                name="chk_user_status",
            ),
            models.CheckConstraint(
                condition=models.Q(is_superuser=False) | models.Q(role="ADMIN"),
                name="chk_user_superuser_admin_only",
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_superuser and self.role != "ADMIN":
            raise ValidationError(
                {"is_superuser": "Only ADMIN accounts may hold superuser privileges."}
            )
        if self.status == "Deactivated" and self.is_active:
            raise ValidationError(
                {"is_active": "A deactivated user cannot have is_active=True."}
            )

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.email}) [{self.role}]"

    def has_perm(self, perm, obj=None):
        """
        Fail-closed multi-tier RBAC permission evaluation (Phase 2 HIGH-01 & HIGH-02).

        Evaluation order:
        1. Reject unauthenticated users.
        2. Reject inactive or deactivated users.
        3. Reject malformed permission identifiers.
        4. Apply Teacher Hard Safety Ceiling before any permission grant (a TEACHER
           can NEVER receive superuser privileges even if `is_superuser=True` is forced).
        5. Grant superuser privileges ONLY to active ADMIN accounts with `is_superuser=True`.
        6. Standard ADMIN and TEACHER accounts evaluate explicit `module_permissions`.
        7. Missing `UserPermission` records fail closed (`False`).
        """
        # Step 1: Authentication verification
        if not getattr(self, "is_authenticated", True):
            return False

        # Step 2: Account status check (inactive or deactivated users always denied)
        if not self.is_active or self.status != "Active":
            return False

        # Step 3: Format & full identifier validation (before any superuser grant)
        if not perm or not isinstance(perm, str) or "." not in perm:
            return False

        parts = perm.split(".")
        if len(parts) != 2:
            return False

        module_name = parts[0].strip().lower()
        raw_action = parts[1].strip().lower()
        if not module_name or not raw_action:
            return False

        if module_name not in VALID_MODULES:
            return False

        if raw_action in VALID_ACTION_FIELDS:
            field_name = raw_action
        elif f"can_{raw_action}" in VALID_ACTION_FIELDS:
            field_name = f"can_{raw_action}"
        else:
            django_action_match = DJANGO_STYLE_ACTION_RE.fullmatch(raw_action)
            if not django_action_match:
                return False
            verb = django_action_match.group(1)
            verb_map = {
                "view": "can_view",
                "add": "can_add",
                "change": "can_edit",
                "delete": "can_delete",
            }
            field_name = verb_map.get(verb)

        if not field_name or field_name not in VALID_ACTION_FIELDS:
            return False

        # Step 4 & 5: Teacher Hard Safety Ceiling precedes any superuser grant;
        # ONLY an active ADMIN account with is_superuser=True gets superuser behavior
        # for validated module/action identifiers.
        if self.role == "ADMIN" and self.is_superuser:
            return True

        # Teacher Hard Safety Ceiling (evaluated BEFORE any database lookup)
        if self.role == "TEACHER":
            if module_name in TEACHER_FORBIDDEN_MODULES:
                return False
            if module_name == "students" and field_name in {
                "can_add",
                "can_edit",
                "can_delete",
                "can_import",
            }:
                return False
            if module_name in {"attendance", "examinations"} and field_name == "can_delete":
                return False
            if module_name not in TEACHER_ALLOWED_MODULES:
                return False

        # Step 6 & 7: Permission record retrieval (fail-closed)
        try:
            user_perm = self.module_permissions.filter(module=module_name).first()
        except Exception:
            return False

        if not user_perm:
            return False

        return bool(getattr(user_perm, field_name, False))

    def has_module_perms(self, app_label):
        """
        Fail-closed module visibility check (Phase 2 HIGH-01 & HIGH-02).

        Evaluation order:
        1. Reject unauthenticated users.
        2. Reject inactive or deactivated users.
        3. Validate that `app_label` is a non-empty string.
        4. Normalize and validate the module against `VALID_MODULES`.
        5. Apply the TEACHER Hard Safety Ceiling.
        6. Grant module visibility only to an active ADMIN superuser.
        7. Standard accounts evaluate explicit permission records and fail closed.
        """
        if not getattr(self, "is_authenticated", True):
            return False
        if not self.is_active or self.status != "Active":
            return False

        if not app_label or not isinstance(app_label, str) or not app_label.strip():
            return False

        module_name = app_label.strip().lower()
        if module_name not in VALID_MODULES:
            return False

        # Teacher Hard Safety Ceiling evaluated before any superuser grant
        if self.role == "TEACHER":
            if module_name in TEACHER_FORBIDDEN_MODULES:
                return False
            if module_name not in TEACHER_ALLOWED_MODULES:
                return False

        # Only active ADMIN superusers receive superuser module visibility
        if self.role == "ADMIN" and self.is_superuser:
            return True

        try:
            user_perm = self.module_permissions.filter(module=module_name).first()
        except Exception:
            return False

        if not user_perm:
            return False

        return any(
            [
                user_perm.can_view,
                user_perm.can_add,
                user_perm.can_edit,
                user_perm.can_delete,
                user_perm.can_import,
                user_perm.can_print,
                user_perm.can_export,
            ]
        )


class UserPermission(models.Model):
    """
    Granular per-user RBAC overrides across all 14 functional modules (Stage 3.6).

    Validation Architecture:
    - Django Model Choices (MODULE_CHOICES) provide application-level form and serializer validation.
    - Database Check Constraint (chk_perm_module) enforces relational data integrity at the SQL level.
    """

    MODULE_CHOICES = [
        ("students", "Student Management"),
        ("attendance", "Attendance Tracking"),
        ("examinations", "Examinations & Marks"),
        ("reports", "Reports Engine"),
        ("fees", "Fee Structures"),
        ("payments", "Student Payments"),
        ("income", "Institutional Income"),
        ("expenses", "Institutional Expenses"),
        ("teachers", "Faculty & Teachers"),
        ("classes", "Classes & Grades"),
        ("subjects", "Academic Subjects"),
        ("users", "User Management"),
        ("certificates", "Certificates & Transcripts"),
        ("settings", "System Settings"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="module_permissions",
        db_column="user_id",
    )
    module = models.CharField(max_length=30, choices=MODULE_CHOICES)
    can_view = models.BooleanField(default=False)
    can_add = models.BooleanField(default=False)
    can_edit = models.BooleanField(default=False)
    can_delete = models.BooleanField(default=False)
    can_import = models.BooleanField(default=False)
    can_print = models.BooleanField(default=False)
    can_export = models.BooleanField(default=False)

    class Meta:
        db_table = "studently_user_permissions"
        ordering = ["user", "module"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "module"],
                name="unique_user_module_permission",
            ),
            models.CheckConstraint(
                check=models.Q(
                    module__in=[
                        "students",
                        "attendance",
                        "examinations",
                        "reports",
                        "fees",
                        "payments",
                        "income",
                        "expenses",
                        "teachers",
                        "classes",
                        "subjects",
                        "users",
                        "certificates",
                        "settings",
                    ]
                ),
                name="chk_perm_module",
            ),
        ]

    def clean(self):
        super().clean()
        if not hasattr(self, "user") or not self.user_id:
            return

        # Teacher hard safety ceiling enforcement across all financial and restricted administrative modules
        if self.user.role == "TEACHER":
            if self.module in ["payments", "fees", "income", "expenses"]:
                if any(
                    [
                        self.can_view,
                        self.can_add,
                        self.can_edit,
                        self.can_delete,
                        self.can_import,
                        self.can_print,
                        self.can_export,
                    ]
                ):
                    raise ValidationError("Teachers cannot hold financial permissions.")
            if self.module in ["users", "settings", "certificates"]:
                if any(
                    [
                        self.can_view,
                        self.can_add,
                        self.can_edit,
                        self.can_delete,
                        self.can_import,
                        self.can_print,
                        self.can_export,
                    ]
                ):
                    raise ValidationError(
                        "Teachers cannot hold administrative or certificate issuance permissions."
                    )
            if self.module == "students" and any(
                [self.can_add, self.can_edit, self.can_delete, self.can_import]
            ):
                raise ValidationError("Teachers cannot modify student demographic records.")
            if self.module in ["attendance", "examinations"] and self.can_delete:
                raise ValidationError(
                    "Teachers cannot delete attendance or examination history."
                )
            if self.module not in [
                "students",
                "attendance",
                "examinations",
                "reports",
                "classes",
                "subjects",
                "teachers",
            ]:
                raise ValidationError(
                    f"Teachers cannot hold permissions for non-academic module '{self.module}'."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user.email} -> {self.module}"

