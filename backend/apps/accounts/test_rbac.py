"""
Comprehensive RBAC and UserPermission Test Suite for STUDENTLY (Stage 3.6).

Tests:
1. UserPermission model constraints and Teacher Hard Safety Ceiling.
2. Centralized RBAC service layer (check_permission, provisioning, anti-escalation).
3. Object-level boundaries and queryset scoping for teachers vs admins.
4. DRF permission classes and HTTP 401/403 authorization behavior.
5. User management and permission API endpoints (/api/v1/users/).
"""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.academics.models import (
    Classroom,
    Subject,
    Teacher,
    TeacherClassAssignment,
    TeacherSubjectAssignment,
)
from apps.accounts.models import User, UserPermission
from apps.accounts.rbac import (
    bulk_set_user_permissions,
    check_object_boundary,
    check_permission,
    get_scoped_students_queryset,
    get_user_effective_permissions,
    provision_user_permissions,
    set_user_module_permissions,
)
from apps.students.models import Student


class UserPermissionModelTests(TestCase):
    """Tests model-level constraints, unique keys, and Teacher Ceiling on UserPermission."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin_perm@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Admin Perm",
        )
        self.teacher_user = User.objects.create_user(
            email="teacher_perm@studently.test",
            password="StrongPassword123!",
            role="TEACHER",
            full_name="Teacher Perm",
        )

    def test_user_permission_creation_and_defaults(self):
        """UserPermission defaults all action flags to False."""
        perm = UserPermission.objects.create(
            user=self.admin,
            module="students",
            can_view=True,
        )
        self.assertTrue(perm.can_view)
        self.assertFalse(perm.can_add)
        self.assertFalse(perm.can_edit)
        self.assertFalse(perm.can_delete)
        self.assertFalse(perm.can_import)
        self.assertFalse(perm.can_print)
        self.assertFalse(perm.can_export)
        self.assertEqual(str(perm), f"{self.admin.email} -> students")

    def test_unique_user_module_constraint(self):
        """Cannot create duplicate permission record for same user and module."""
        UserPermission.objects.create(user=self.admin, module="fees", can_view=True)
        with self.assertRaises((IntegrityError, ValidationError)):
            UserPermission.objects.create(user=self.admin, module="fees", can_edit=True)

    def test_invalid_module_check_constraint(self):
        """Invalid module identifier rejected by clean() and check constraint."""
        perm = UserPermission(user=self.admin, module="invalid_module", can_view=True)
        with self.assertRaises(ValidationError):
            perm.full_clean()

    def test_teacher_ceiling_financial_modules_strictly_forbidden(self):
        """Teacher cannot hold permissions for fees, payments, income, or expenses."""
        for fin_mod in ["fees", "payments", "income", "expenses"]:
            with self.assertRaises(ValidationError) as ctx:
                UserPermission.objects.create(
                    user=self.teacher_user,
                    module=fin_mod,
                    can_view=True,
                )
            self.assertIn("Teachers cannot hold financial permissions", str(ctx.exception))

    def test_teacher_ceiling_admin_modules_strictly_forbidden(self):
        """Teacher cannot hold permissions for users, settings, or certificates."""
        for admin_mod in ["users", "settings", "certificates"]:
            with self.assertRaises(ValidationError) as ctx:
                UserPermission.objects.create(
                    user=self.teacher_user,
                    module=admin_mod,
                    can_view=True,
                )
            self.assertIn("Teachers cannot hold administrative", str(ctx.exception))

    def test_teacher_ceiling_student_modification_forbidden(self):
        """Teacher cannot hold add/edit/delete/import on students."""
        # View only is allowed
        perm = UserPermission.objects.create(
            user=self.teacher_user,
            module="students",
            can_view=True,
            can_print=True,
        )
        self.assertTrue(perm.can_view)

        # Modifying demographic records is blocked
        for flag in ["can_add", "can_edit", "can_delete", "can_import"]:
            with self.assertRaises(ValidationError) as ctx:
                p = UserPermission(
                    user=self.teacher_user,
                    module="students",
                    **{flag: True},
                )
                p.full_clean()
            self.assertIn("Teachers cannot modify student demographic records", str(ctx.exception))

    def test_teacher_ceiling_attendance_exam_delete_forbidden(self):
        """Teacher cannot delete attendance or examination history."""
        for mod in ["attendance", "examinations"]:
            with self.assertRaises(ValidationError) as ctx:
                p = UserPermission(
                    user=self.teacher_user,
                    module=mod,
                    can_delete=True,
                )
                p.full_clean()
            self.assertIn("Teachers cannot delete attendance or examination history", str(ctx.exception))

    def test_teacher_academic_permissions_valid(self):
        """Teacher can hold view, add, edit for attendance and examinations."""
        att_perm = UserPermission.objects.create(
            user=self.teacher_user,
            module="attendance",
            can_view=True,
            can_add=True,
            can_edit=True,
        )
        self.assertTrue(att_perm.can_add)


class CentralizedRBACServiceTests(TestCase):
    """Tests rbac.py service functions, profiling, and anti-privilege escalation."""

    def setUp(self):
        self.superadmin = User.objects.create_superuser(
            email="superadmin@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Super Admin",
        )
        self.bursar_user = User.objects.create_user(
            email="bursar@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="School Bursar",
        )
        self.teacher_user = User.objects.create_user(
            email="teacher_svc@studently.test",
            password="StrongPassword123!",
            role="TEACHER",
            full_name="Teacher Svc",
        )

    def test_check_permission_fail_closed_on_missing_record(self):
        """Missing UserPermission record fails closed to False."""
        self.assertFalse(check_permission(self.bursar_user, "fees", "can_view"))
        self.assertFalse(self.bursar_user.has_perm("fees.can_view"))

    def test_check_permission_superuser_bypass(self):
        """Active ADMIN superuser receives True for any valid module and action."""
        self.assertTrue(check_permission(self.superadmin, "fees", "can_view"))
        self.assertTrue(self.superadmin.has_perm("payments.can_delete"))
        self.assertTrue(self.superadmin.has_perm("settings.can_edit"))

    def test_check_permission_teacher_hard_ceiling_before_db(self):
        """Teacher is denied financial and admin modules immediately."""
        self.assertFalse(check_permission(self.teacher_user, "payments", "can_view"))
        self.assertFalse(check_permission(self.teacher_user, "users", "can_view"))
        self.assertFalse(self.teacher_user.has_perm("fees.can_view"))

    def test_provision_bursar_profile(self):
        """Bursar profile provisions financial and report permissions."""
        records = provision_user_permissions(self.bursar_user, "bursar")
        self.assertEqual(len(records), 5)
        self.assertTrue(self.bursar_user.has_perm("fees.can_view"))
        self.assertTrue(self.bursar_user.has_perm("payments.can_add"))
        self.assertFalse(self.bursar_user.has_perm("students.can_view"))

    def test_provision_teacher_default_profile(self):
        """Teacher profile provisions academic permissions respecting safety ceiling."""
        records = provision_user_permissions(self.teacher_user, "teacher_default")
        self.assertEqual(len(records), 7)
        self.assertTrue(self.teacher_user.has_perm("attendance.can_add"))
        self.assertTrue(self.teacher_user.has_perm("examinations.can_edit"))
        self.assertFalse(self.teacher_user.has_perm("payments.can_view"))
        self.assertFalse(self.teacher_user.has_perm("attendance.can_delete"))

    def test_provision_forbidden_profile_raises(self):
        """Attempting to assign bursar profile to teacher raises ValidationError."""
        with self.assertRaises(ValidationError):
            provision_user_permissions(self.teacher_user, "bursar")

    def test_anti_privilege_escalation_granting_unheld_permissions(self):
        """Standard admin cannot grant permissions they do not possess."""
        UserPermission.objects.create(user=self.bursar_user, module="users", can_edit=True)
        target = User.objects.create_user(
            email="target@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Target User",
        )
        with self.assertRaises(PermissionDenied):
            set_user_module_permissions(
                target_user=target,
                module="settings",
                flags={"can_edit": True},
                requesting_user=self.bursar_user,
            )

    def test_anti_privilege_escalation_modifying_superuser(self):
        """Non-superuser cannot modify superuser permissions."""
        UserPermission.objects.create(user=self.bursar_user, module="users", can_edit=True)
        with self.assertRaises(PermissionDenied):
            set_user_module_permissions(
                target_user=self.superadmin,
                module="fees",
                flags={"can_view": False},
                requesting_user=self.bursar_user,
            )

    def test_effective_permissions_dictionary(self):
        """get_user_effective_permissions returns all 14 modules with correct flags."""
        eff = get_user_effective_permissions(self.superadmin)
        self.assertEqual(len(eff), 14)
        self.assertTrue(eff["payments"]["view"])
        self.assertTrue(eff["settings"]["edit"])

        # Deactivated user gets all False
        self.superadmin.is_active = False
        self.superadmin.save()
        eff_inactive = get_user_effective_permissions(self.superadmin)
        self.assertFalse(eff_inactive["payments"]["view"])


class ObjectLevelBoundaryTests(TestCase):
    """Tests teacher class allocation boundaries and queryset scoping."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin_obj@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Admin Obj",
        )
        self.teacher_record = Teacher.objects.create(
            full_name="Ustadha Aisha",
            email="aisha@studently.test",
            phone="+254700000001",
            joined_date="2026-01-01",
        )
        self.teacher_user = User.objects.create_user(
            email="aisha@studently.test",
            password="StrongPassword123!",
            role="TEACHER",
            teacher=self.teacher_record,
            full_name="Ustadha Aisha",
        )
        self.classroom_assigned = Classroom.objects.create(
            name="Class 1",
            section="A",
            capacity=30,
            teacher=self.teacher_record,
        )
        self.classroom_unassigned = Classroom.objects.create(
            name="Class 2",
            section="B",
            capacity=30,
        )
        self.student_assigned = Student.objects.create(
            admission_number="ADM-001",
            full_name="Bilal Hassan",
            gender="Male",
            date_of_birth="2018-05-10",
            parent_phone="+254711111111",
            registration_date="2026-01-10",
            classroom=self.classroom_assigned,
        )
        self.student_unassigned = Student.objects.create(
            admission_number="ADM-002",
            full_name="Fatima Ali",
            gender="Female",
            date_of_birth="2018-08-15",
            parent_phone="+254722222222",
            registration_date="2026-01-10",
            classroom=self.classroom_unassigned,
        )

    def test_teacher_classroom_boundary(self):
        """Teacher can access assigned homeroom classroom but not unassigned classroom."""
        self.assertTrue(check_object_boundary(self.teacher_user, "classes", "can_view", self.classroom_assigned))
        self.assertFalse(check_object_boundary(self.teacher_user, "classes", "can_view", self.classroom_unassigned))

    def test_teacher_student_boundary(self):
        """Teacher can access students in assigned classroom but not students in other classrooms."""
        self.assertTrue(check_object_boundary(self.teacher_user, "students", "can_view", self.student_assigned))
        self.assertFalse(check_object_boundary(self.teacher_user, "students", "can_view", self.student_unassigned))

    def test_scoped_students_queryset(self):
        """get_scoped_students_queryset filters strictly to teacher's allocated students."""
        teacher_qs = get_scoped_students_queryset(self.teacher_user)
        self.assertEqual(teacher_qs.count(), 1)
        self.assertIn(self.student_assigned, teacher_qs)
        self.assertNotIn(self.student_unassigned, teacher_qs)

        admin_qs = get_scoped_students_queryset(self.admin)
        self.assertEqual(admin_qs.count(), 2)


class UserManagementAPITests(TestCase):
    """Tests /api/v1/users/ endpoints, DRF permissions, and HTTP status codes."""

    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_superuser(
            email="superadmin_api@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Super Admin API",
        )
        self.regular_admin = User.objects.create_user(
            email="regular_admin@studently.test",
            password="StrongPassword123!",
            role="ADMIN",
            full_name="Regular Admin API",
        )
        self.teacher_user = User.objects.create_user(
            email="teacher_api@studently.test",
            password="StrongPassword123!",
            role="TEACHER",
            full_name="Teacher API",
        )

    def test_unauthenticated_request_returns_401(self):
        """Unauthenticated requests to /api/v1/users/ return HTTP 401."""
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_teacher_access_users_returns_403(self):
        """Teacher accounts cannot access /api/v1/users/ (Teacher Hard Ceiling)."""
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_without_user_view_permission_returns_403(self):
        """Admin without explicit users.can_view permission receives 403."""
        self.client.force_authenticate(user=self.regular_admin)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_with_user_view_permission_lists_users(self):
        """Admin with users.can_view lists users successfully."""
        UserPermission.objects.create(user=self.regular_admin, module="users", can_view=True)
        self.client.force_authenticate(user=self.regular_admin)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 3)

    def test_get_current_user_me(self):
        """Any authenticated active user can access /api/v1/users/me/."""
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.teacher_user.email)
        self.assertIn("effective_permissions", response.data)

    def test_create_user_anti_escalation(self):
        """Non-superuser cannot create a superuser account."""
        UserPermission.objects.create(user=self.regular_admin, module="users", can_add=True)
        self.client.force_authenticate(user=self.regular_admin)
        payload = {
            "email": "hacked_admin@studently.test",
            "password": "StrongPassword123!",
            "role": "ADMIN",
            "full_name": "Hacked Admin",
            "is_superuser": True,
        }
        response = self.client.post("/api/v1/users/", payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_superuser", response.data)

    def test_superuser_create_user_success(self):
        """Superuser can create user account successfully."""
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            "email": "new_bursar@studently.test",
            "password": "StrongPassword123!",
            "role": "ADMIN",
            "fullName": "New Bursar",
        }
        response = self.client.post("/api/v1/users/", payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "new_bursar@studently.test")

    def test_update_user_permissions_endpoint(self):
        """Superuser can update user permissions via /api/v1/users/{id}/permissions/."""
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            "permissions": {
                "fees": {"view": True, "add": True},
                "payments": {"view": True, "add": False},
            }
        }
        response = self.client.put(f"/api/v1/users/{self.regular_admin.id}/permissions/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["permissions"]["fees"]["view"])

    def test_update_teacher_permissions_violating_ceiling_rejected(self):
        """Attempting to grant payments permission to teacher via API is rejected."""
        self.client.force_authenticate(user=self.superadmin)
        payload = {
            "permissions": {
                "payments": {"view": True},
            }
        }
        response = self.client.put(f"/api/v1/users/{self.teacher_user.id}/permissions/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("TEACHER Hard Safety Ceiling", response.data["detail"])

    def test_self_deletion_prohibited(self):
        """Users cannot delete their own account."""
        self.client.force_authenticate(user=self.superadmin)
        response = self.client.delete(f"/api/v1/users/{self.superadmin.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot delete their own account", response.data["detail"])

    def test_reset_password_endpoint(self):
        """Admin with users.can_edit can reset a user's password."""
        UserPermission.objects.create(user=self.regular_admin, module="users", can_edit=True)
        self.client.force_authenticate(user=self.regular_admin)
        payload = {"newPassword": "NewStrongPassword456!"}
        response = self.client.post(f"/api/v1/users/{self.teacher_user.id}/reset-password/", payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
