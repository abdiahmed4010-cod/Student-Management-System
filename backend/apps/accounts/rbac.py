"""
Centralized Role-Based Access Control (RBAC) Service for STUDENTLY (Stage 3.6).

Authoritative Specifications:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.1.1)
- documentation/phase-1/BUSINESS_RULES_SPECIFICATION.md
- documentation/phase-2/DATA_DICTIONARY.md

Key Architecture Principles:
1. Deny-by-default fail-closed evaluation.
2. Role hierarchy: ADMIN vs TEACHER (Superuser status strictly requires ADMIN role + is_superuser=True).
3. Teacher Hard Safety Ceiling: Absolute prohibition on financial (fees, payments, income, expenses)
   and sensitive administrative (users, settings, certificates) modules. Teachers cannot modify student
   demographics or delete attendance/examination history.
4. Granular UserPermission records (14 modules, 7 action flags: can_view, can_add, can_edit, can_delete,
   can_import, can_print, can_export).
5. Anti-Privilege Escalation: Users cannot grant permissions beyond their own privileges or modify
   superusers unless they are superusers themselves.
6. Object-level boundaries: Teachers are scoped to assigned classrooms and assigned subjects.
"""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models, transaction

from apps.accounts.models import (
    TEACHER_ALLOWED_MODULES,
    TEACHER_FORBIDDEN_MODULES,
    VALID_ACTION_FIELDS,
    VALID_MODULES,
    User,
    UserPermission,
)

# Standard Role Provisioning Profiles (Phase 2 Section 2.1.1 Subsection 5)
PROFILES = {
    "bursar": {
        "description": "Bursar / Financial Accountant",
        "allowed_roles": ["ADMIN"],
        "modules": {
            "fees": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "payments": {"can_view": True, "can_add": True, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "income": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "expenses": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "reports": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
        },
    },
    "academic_registrar": {
        "description": "Academic Registrar / Examination Officer",
        "allowed_roles": ["ADMIN"],
        "modules": {
            "students": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": True, "can_print": True, "can_export": True},
            "attendance": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": True, "can_import": False, "can_print": True, "can_export": True},
            "examinations": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": True, "can_import": False, "can_print": True, "can_export": True},
            "reports": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "teachers": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "classes": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "subjects": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "certificates": {"can_view": True, "can_add": True, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": False},
        },
    },
    "full_admin": {
        "description": "Full System Administrator",
        "allowed_roles": ["ADMIN"],
        "modules": {
            mod: {field: True for field in VALID_ACTION_FIELDS}
            for mod in VALID_MODULES
        },
    },
    "teacher_default": {
        "description": "Standard Teacher Profile (Enforces Safety Ceiling)",
        "allowed_roles": ["TEACHER"],
        "modules": {
            "students": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": False},
            "attendance": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": False},
            "examinations": {"can_view": True, "can_add": True, "can_edit": True, "can_delete": False, "can_import": False, "can_print": True, "can_export": False},
            "reports": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": True, "can_export": True},
            "classes": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": False, "can_export": False},
            "subjects": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": False, "can_export": False},
            "teachers": {"can_view": True, "can_add": False, "can_edit": False, "can_delete": False, "can_import": False, "can_print": False, "can_export": False},
        },
    },
}


def normalize_action(action: str) -> str:
    """Normalize action string to can_<action> or match VALID_ACTION_FIELDS."""
    if not action or not isinstance(action, str):
        return ""
    action = action.strip().lower()
    if action in VALID_ACTION_FIELDS:
        return action
    if f"can_{action}" in VALID_ACTION_FIELDS:
        return f"can_{action}"
    # Verb mapping for standard DRF/Django operations
    verb_map = {
        "view": "can_view",
        "list": "can_view",
        "retrieve": "can_view",
        "add": "can_add",
        "create": "can_add",
        "edit": "can_edit",
        "update": "can_edit",
        "partial_update": "can_edit",
        "change": "can_edit",
        "delete": "can_delete",
        "destroy": "can_delete",
        "import": "can_import",
        "print": "can_print",
        "export": "can_export",
    }
    return verb_map.get(action, "")


def validate_teacher_ceiling(module: str, action_flags: dict) -> None:
    """
    Validates whether proposed permission flags violate the Teacher Hard Safety Ceiling.
    Raises ValidationError if any prohibited permission is asserted.
    """
    module = module.strip().lower()
    if module in TEACHER_FORBIDDEN_MODULES:
        if any(bool(v) for v in action_flags.values()):
            raise ValidationError(
                f"TEACHER Hard Safety Ceiling: Teachers cannot hold permissions for '{module}'."
            )

    if module not in TEACHER_ALLOWED_MODULES:
        if any(bool(v) for v in action_flags.values()):
            raise ValidationError(
                f"TEACHER Hard Safety Ceiling: '{module}' is not an authorized teacher module."
            )

    if module == "students":
        prohibited = ["can_add", "can_edit", "can_delete", "can_import", "add", "edit", "delete", "import"]
        for p in prohibited:
            if action_flags.get(p):
                raise ValidationError(
                    "TEACHER Hard Safety Ceiling: Teachers cannot modify or import student records."
                )

    if module in ["attendance", "examinations"]:
        if action_flags.get("can_delete") or action_flags.get("delete"):
            raise ValidationError(
                f"TEACHER Hard Safety Ceiling: Teachers cannot delete '{module}' records."
            )


def check_permission(user: User, module: str, action: str, obj: object = None) -> bool:
    """
    Centralized authorization evaluation (Fail-closed).
    Evaluates:
    1. Active authenticated user check.
    2. Module & action validation.
    3. Superuser bypass for active ADMIN only.
    4. Teacher Hard Safety Ceiling.
    5. Explicit UserPermission database record.
    6. Object-level boundary check if obj is provided.
    """
    if not user or not user.is_authenticated or not user.is_active or user.status != "Active":
        return False

    module = (module or "").strip().lower()
    if module not in VALID_MODULES:
        return False

    norm_action = normalize_action(action)
    if not norm_action or norm_action not in VALID_ACTION_FIELDS:
        return False

    # Active ADMIN superusers receive unrestricted access
    if user.role == "ADMIN" and user.is_superuser:
        return True

    # Teacher Hard Safety Ceiling
    if user.role == "TEACHER":
        if module in TEACHER_FORBIDDEN_MODULES:
            return False
        if module == "students" and norm_action in {"can_add", "can_edit", "can_delete", "can_import"}:
            return False
        if module in {"attendance", "examinations"} and norm_action == "can_delete":
            return False
        if module not in TEACHER_ALLOWED_MODULES:
            return False

    # Check explicit permission record
    perm_record = user.module_permissions.filter(module=module).first()
    if not perm_record:
        return False

    has_perm = bool(getattr(perm_record, norm_action, False))
    if not has_perm:
        return False

    # Object-level verification if object is provided
    if obj is not None and user.role == "TEACHER":
        return check_object_boundary(user, module, norm_action, obj)

    return True


def check_object_boundary(user: User, module: str, action: str, obj: object) -> bool:
    """
    Evaluates object-level boundary rules for teachers:
    - Class allocation boundary: assigned classrooms / homerooms only.
    - Subject allocation boundary: assigned subjects only.
    """
    teacher = getattr(user, "teacher", None)
    if not teacher:
        return False

    # Classroom object check
    if hasattr(obj, "teacher_id") and hasattr(obj, "teacher_assignments"):
        # obj is a Classroom
        is_homeroom = (obj.teacher_id == teacher.id)
        is_assigned = obj.teacher_assignments.filter(teacher=teacher).exists()
        return is_homeroom or is_assigned

    # Student object check
    if hasattr(obj, "classroom"):
        classroom = getattr(obj, "classroom", None)
        if not classroom:
            return False
        is_homeroom = (classroom.teacher_id == teacher.id)
        is_assigned = classroom.teacher_assignments.filter(teacher=teacher).exists()
        return is_homeroom or is_assigned

    # Attendance record check
    if hasattr(obj, "classroom_id") or hasattr(obj, "student"):
        classroom = getattr(obj, "classroom", None)
        if not classroom and hasattr(obj, "student"):
            classroom = getattr(obj.student, "classroom", None)
        if classroom:
            is_homeroom = (classroom.teacher_id == teacher.id)
            is_assigned = classroom.teacher_assignments.filter(teacher=teacher).exists()
            return is_homeroom or is_assigned

    # Examination Mark check
    if hasattr(obj, "examination") and hasattr(obj, "subject"):
        # Must be assigned to teach this subject
        from apps.academics.models import TeacherSubjectAssignment
        is_assigned = TeacherSubjectAssignment.objects.filter(
            teacher=teacher,
            subject=obj.subject,
        ).exists()
        return is_assigned

    # Default to permitted if module permission granted and no specific object rule applies
    return True


@transaction.atomic
def provision_user_permissions(user: User, profile_name: str) -> list[UserPermission]:
    """
    Provisions a predefined set of UserPermission records for a user based on profile name.
    Profiles: 'bursar', 'academic_registrar', 'full_admin', 'teacher_default'.
    """
    if profile_name not in PROFILES:
        raise ValidationError(f"Unknown RBAC profile '{profile_name}'. Available: {list(PROFILES.keys())}")

    profile = PROFILES[profile_name]
    if user.role not in profile["allowed_roles"]:
        raise ValidationError(
            f"Profile '{profile_name}' is not allowed for user role '{user.role}'."
        )

    created_records = []
    for module_name, flags in profile["modules"].items():
        if user.role == "TEACHER":
            validate_teacher_ceiling(module_name, flags)

        perm_obj, _ = UserPermission.objects.update_or_create(
            user=user,
            module=module_name,
            defaults={
                "can_view": flags.get("can_view", False),
                "can_add": flags.get("can_add", False),
                "can_edit": flags.get("can_edit", False),
                "can_delete": flags.get("can_delete", False),
                "can_import": flags.get("can_import", False),
                "can_print": flags.get("can_print", False),
                "can_export": flags.get("can_export", False),
            },
        )
        created_records.append(perm_obj)

    return created_records


@transaction.atomic
def set_user_module_permissions(
    target_user: User,
    module: str,
    flags: dict,
    requesting_user: User = None,
) -> UserPermission:
    """
    Sets or updates granular permissions for a single module on target_user.
    Enforces anti-privilege escalation checks when requesting_user is provided.
    """
    module = module.strip().lower()
    if module not in VALID_MODULES:
        raise ValidationError(f"Invalid module '{module}'.")

    # Anti-Privilege Escalation Checks
    if requesting_user is not None:
        if not requesting_user.is_authenticated or not requesting_user.is_active:
            raise PermissionDenied("Unauthenticated or inactive user cannot modify permissions.")

        # Superuser target can only be modified by a superuser
        if target_user.is_superuser and not requesting_user.is_superuser:
            raise PermissionDenied("Non-superusers cannot modify superuser permissions.")

        # If requesting_user is not superuser:
        if not requesting_user.is_superuser:
            # Must be ADMIN with users.can_edit
            if requesting_user.role != "ADMIN" or not requesting_user.has_perm("users.can_edit"):
                raise PermissionDenied("User lacks permission to manage permissions.")

            # Cannot escalate: requesting_user cannot grant permissions they do not possess
            for flag, val in flags.items():
                if val:
                    norm_action = normalize_action(flag)
                    if norm_action and not requesting_user.has_perm(f"{module}.{norm_action}"):
                        raise PermissionDenied(
                            f"Privilege escalation prevented: cannot grant '{module}.{norm_action}' which you do not possess."
                        )

    # Normalize flags
    normalized_flags = {}
    for field in VALID_ACTION_FIELDS:
        short_key = field.replace("can_", "")
        if field in flags:
            normalized_flags[field] = bool(flags[field])
        elif short_key in flags:
            normalized_flags[field] = bool(flags[short_key])
        else:
            normalized_flags[field] = False

    # Teacher ceiling validation
    if target_user.role == "TEACHER":
        validate_teacher_ceiling(module, normalized_flags)

    perm_obj, _ = UserPermission.objects.update_or_create(
        user=target_user,
        module=module,
        defaults=normalized_flags,
    )
    return perm_obj


@transaction.atomic
def bulk_set_user_permissions(
    target_user: User,
    permissions_dict: dict,
    requesting_user: User = None,
) -> dict:
    """
    Bulk update permissions across multiple modules:
    permissions_dict format:
    {
        "students": {"view": True, "add": False, ...},
        "attendance": {"can_view": True, ...}
    }
    """
    results = {}
    for module_name, flags in permissions_dict.items():
        if isinstance(flags, dict):
            perm = set_user_module_permissions(target_user, module_name, flags, requesting_user)
            results[module_name] = {
                "can_view": perm.can_view,
                "can_add": perm.can_add,
                "can_edit": perm.can_edit,
                "can_delete": perm.can_delete,
                "can_import": perm.can_import,
                "can_print": perm.can_print,
                "can_export": perm.can_export,
            }
    return results


def get_user_effective_permissions(user: User) -> dict:
    """
    Returns effective permissions dictionary across all 14 modules.
    Format:
    {
        "students": {"view": bool, "add": bool, "edit": bool, "delete": bool, "import": bool, "print": bool, "export": bool},
        ...
    }
    """
    output = {}

    is_super = bool(user and user.is_authenticated and user.is_active and user.status == "Active" and user.role == "ADMIN" and user.is_superuser)

    # Pre-fetch existing permission records
    perm_records = {}
    if user and user.is_authenticated:
        for p in user.module_permissions.all():
            perm_records[p.module] = p

    for mod in sorted(VALID_MODULES):
        if is_super:
            output[mod] = {
                "view": True,
                "add": True,
                "edit": True,
                "delete": True,
                "import": True,
                "print": True,
                "export": True,
            }
            continue

        if not user or not user.is_authenticated or not user.is_active or user.status != "Active":
            output[mod] = {
                "view": False,
                "add": False,
                "edit": False,
                "delete": False,
                "import": False,
                "print": False,
                "export": False,
            }
            continue

        # For teacher, apply teacher ceiling
        if user.role == "TEACHER" and mod in TEACHER_FORBIDDEN_MODULES:
            output[mod] = {
                "view": False,
                "add": False,
                "edit": False,
                "delete": False,
                "import": False,
                "print": False,
                "export": False,
            }
            continue

        p = perm_records.get(mod)
        if not p:
            output[mod] = {
                "view": False,
                "add": False,
                "edit": False,
                "delete": False,
                "import": False,
                "print": False,
                "export": False,
            }
        else:
            can_add = p.can_add
            can_edit = p.can_edit
            can_delete = p.can_delete
            can_import = p.can_import

            # Teacher restrictions
            if user.role == "TEACHER":
                if mod == "students":
                    can_add = False
                    can_edit = False
                    can_delete = False
                    can_import = False
                elif mod in ["attendance", "examinations"]:
                    can_delete = False

            output[mod] = {
                "view": p.can_view,
                "add": can_add,
                "edit": can_edit,
                "delete": can_delete,
                "import": can_import,
                "print": p.can_print,
                "export": p.can_export,
            }

    return output


# Queryset Scoping Helpers for ViewSets (Phase 2 Section 2.1.1 Subsection 4)
def get_scoped_students_queryset(user: User):
    """Returns Student QuerySet scoped to user's permitted boundary."""
    from apps.students.models import Student

    if not user or not user.is_authenticated or not user.is_active:
        return Student.objects.none()

    if user.is_superuser or user.role == "ADMIN":
        return Student.objects.all().select_related("classroom")

    if user.role == "TEACHER":
        teacher = getattr(user, "teacher", None)
        if not teacher:
            return Student.objects.none()
        return Student.objects.filter(
            models.Q(classroom__teacher=teacher)
            | models.Q(classroom__teacher_assignments__teacher=teacher)
        ).distinct().select_related("classroom")

    return Student.objects.none()


def get_scoped_classrooms_queryset(user: User):
    """Returns Classroom QuerySet scoped to user's permitted boundary."""
    from apps.academics.models import Classroom

    if not user or not user.is_authenticated or not user.is_active:
        return Classroom.objects.none()

    if user.is_superuser or user.role == "ADMIN":
        return Classroom.objects.all()

    if user.role == "TEACHER":
        teacher = getattr(user, "teacher", None)
        if not teacher:
            return Classroom.objects.none()
        return Classroom.objects.filter(
            models.Q(teacher=teacher) | models.Q(teacher_assignments__teacher=teacher)
        ).distinct()

    return Classroom.objects.none()
