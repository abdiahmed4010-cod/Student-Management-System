"""
DRF Permission Classes for STUDENTLY RBAC (Stage 3.6).

Authoritative Specification:
- documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md (Section 2.1.1 Subsection 3)
"""

from rest_framework import permissions
from apps.accounts.rbac import normalize_action, check_object_boundary


class HasModulePermission(permissions.BasePermission):
    """
    DRF permission class evaluating User.has_perm() at the view action or HTTP method level.
    Evaluates:
    - User authentication and active status.
    - View's declared module_name (or basename).
    - Maps view.action or request.method to standard action flags (can_view, can_add, etc.).
    - Superusers receive unrestricted access.
    - Teachers and Admins evaluate against fail-closed RBAC records.
    """

    module_name = None

    ACTION_MAP = {
        "list": "can_view",
        "retrieve": "can_view",
        "create": "can_add",
        "update": "can_edit",
        "partial_update": "can_edit",
        "destroy": "can_delete",
        "export": "can_export",
        "print": "can_print",
        "import_data": "can_import",
    }

    METHOD_MAP = {
        "GET": "can_view",
        "OPTIONS": "can_view",
        "HEAD": "can_view",
        "POST": "can_add",
        "PUT": "can_edit",
        "PATCH": "can_edit",
        "DELETE": "can_delete",
    }

    def get_module_name(self, view):
        return getattr(view, "module_name", None) or getattr(view, "basename", None) or self.module_name

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated or not request.user.is_active or request.user.status != "Active":
            return False

        if request.user.role == "ADMIN" and request.user.is_superuser:
            return True

        module = self.get_module_name(view)
        if not module:
            return False

        # Resolve action
        action_name = getattr(view, "action", None)
        action_flag = self.ACTION_MAP.get(action_name)
        if not action_flag:
            action_flag = self.METHOD_MAP.get(request.method, "can_view")

        perm_string = f"{module}.{action_flag}"
        return request.user.has_perm(perm_string)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated or not request.user.is_active or request.user.status != "Active":
            return False

        if request.user.role == "ADMIN" and request.user.is_superuser:
            return True

        # Admins evaluate module permissions
        if request.user.role == "ADMIN":
            return True

        # Teachers must satisfy object-level allocation boundaries
        if request.user.role == "TEACHER":
            module = self.get_module_name(view)
            action_name = getattr(view, "action", None)
            action_flag = self.ACTION_MAP.get(action_name) or self.METHOD_MAP.get(request.method, "can_view")
            return check_object_boundary(request.user, module, action_flag, obj)

        return False


class IsAssignedTeacherOrAdmin(permissions.BasePermission):
    """
    Object-level permission ensuring teachers only access resources in their assigned classrooms
    or subjects, while ADMINs and superusers hold broad access.
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.status == "Active"
        )

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated or not request.user.is_active or request.user.status != "Active":
            return False

        if request.user.is_superuser or request.user.role == "ADMIN":
            return True

        if request.user.role == "TEACHER":
            module = getattr(view, "module_name", None) or getattr(view, "basename", "")
            action = getattr(view, "action", None) or request.method
            return check_object_boundary(request.user, module, action, obj)

        return False


class IsSuperUser(permissions.BasePermission):
    """Allows access only to active ADMIN accounts with is_superuser=True."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.status == "Active"
            and request.user.role == "ADMIN"
            and request.user.is_superuser
        )


class IsAdminRole(permissions.BasePermission):
    """Allows access to active ADMIN accounts."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.status == "Active"
            and request.user.role == "ADMIN"
        )


class CanManageUsers(permissions.BasePermission):
    """Permission class for user account administration (/api/v1/users/)."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated or not request.user.is_active or request.user.status != "Active":
            return False

        if request.user.role == "ADMIN" and request.user.is_superuser:
            return True

        if request.user.role != "ADMIN":
            return False

        action_name = getattr(view, "action", None)
        if action_name in ["list", "retrieve"]:
            return request.user.has_perm("users.can_view")
        elif action_name == "create":
            return request.user.has_perm("users.can_add")
        elif action_name in ["update", "partial_update", "reset_password"]:
            return request.user.has_perm("users.can_edit")
        elif action_name == "destroy":
            return request.user.has_perm("users.can_delete")
        elif action_name == "permissions":
            if request.method in ["GET", "HEAD", "OPTIONS"]:
                return request.user.has_perm("users.can_view")
            return request.user.has_perm("users.can_edit")

        return request.user.has_perm("users.can_view")
