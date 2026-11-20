"""
Automated test suite for STUDENTLY Stage 3.3:
Custom User Model, Custom User Manager, Fail-Closed Permissions,
Django Admin Integration, and SimpleJWT Authentication API.
"""

import uuid
from datetime import timedelta

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, APITestCase
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts.admin import (
    CustomUserAdmin,
    CustomUserChangeForm,
    CustomUserCreationForm,
)

User = get_user_model()

# Avoid rate-limit interference across non-throttling API tests;
# dedicated throttling test overrides back to 5/min explicitly.
RELAXED_THROTTLE_REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "auth_token": "1000/min",
        "auth_token_refresh": "1000/min",
        "auth_token_verify": "1000/min",
    },
}


class CustomUserModelTests(TestCase):
    """Tests for User model, CustomUserManager, password hashing, and DB constraints."""

    def test_valid_user_creation_and_password_hashing(self):
        raw_password = "Str0ng!StudentlyPass#2026"
        user = User.objects.create_user(
            email="Teacher.One@Studently.edu",
            password=raw_password,
            full_name="Amina Hassan",
        )

        self.assertIsInstance(user.id, uuid.UUID)
        self.assertEqual(user.email, "teacher.one@studently.edu")
        self.assertEqual(user.full_name, "Amina Hassan")
        self.assertEqual(user.role, "TEACHER")
        self.assertEqual(user.status, "Active")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertNotEqual(user.password, raw_password)
        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(user.check_password(raw_password))
        self.assertFalse(user.check_password("WrongPassword123!"))

    def test_invalid_user_creation_rejected(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="Str0ng!Pass#2026", full_name="No Email")

        with self.assertRaises(ValueError):
            User.objects.create_user(email="not-an-email", password="Str0ng!Pass#2026", full_name="Bad Email")

        with self.assertRaises(ValueError):
            User.objects.create_user(email="valid@studently.edu", password="Str0ng!Pass#2026", full_name="  ")

        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="role@studently.edu",
                password="Str0ng!Pass#2026",
                full_name="Bad Role",
                role="BURSAR",
            )

        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="status@studently.edu",
                password="Str0ng!Pass#2026",
                full_name="Bad Status",
                status="Suspended",
            )

        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="conflict@studently.edu",
                password="Str0ng!Pass#2026",
                full_name="Conflict User",
                status="Deactivated",
                is_active=True,
            )

        # Weak password rejected by Django's configured AUTH_PASSWORD_VALIDATORS
        with self.assertRaises(ValidationError):
            User.objects.create_user(
                email="weak@studently.edu",
                password="123",
                full_name="Weak Pass",
            )

    def test_duplicate_identity_rejected_case_insensitively(self):
        User.objects.create_user(
            email="duplicate@studently.edu",
            password="Str0ng!StudentlyPass#2026",
            full_name="First User",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                User.objects.create_user(
                    email="DUPLICATE@STUDENTLY.EDU",
                    password="Str0ng!StudentlyPass#2026",
                    full_name="Second User",
                )

    def test_database_check_constraints_enforced(self):
        user = User.objects.create_user(
            email="check@studently.edu",
            password="Str0ng!StudentlyPass#2026",
            full_name="Constraint User",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_users SET role = %s WHERE id = %s;",
                        ["SUPERADMIN", user.id.hex],
                    )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_users SET status = %s WHERE id = %s;",
                        ["Deleted", user.id.hex],
                    )

    def test_valid_superuser_creation(self):
        superuser = User.objects.create_superuser(
            email="Super.Admin@Studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Institutional Superuser",
        )
        self.assertEqual(superuser.email, "super.admin@studently.edu")
        self.assertEqual(superuser.role, "ADMIN")
        self.assertEqual(superuser.status, "Active")
        self.assertTrue(superuser.is_active)
        self.assertTrue(superuser.is_staff)
        self.assertTrue(superuser.is_superuser)
        self.assertTrue(superuser.check_password("Super!Str0ngPass#2026"))

    def test_invalid_superuser_configurations_rejected(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="s1@studently.edu",
                password="Super!Str0ngPass#2026",
                full_name="Bad Role SU",
                role="TEACHER",
            )
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="s2@studently.edu",
                password="Super!Str0ngPass#2026",
                full_name="No Staff SU",
                is_staff=False,
            )
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="s3@studently.edu",
                password="Super!Str0ngPass#2026",
                full_name="No SU Flag",
                is_superuser=False,
            )
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="s4@studently.edu",
                password="Super!Str0ngPass#2026",
                full_name="Inactive SU",
                is_active=False,
            )
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="s5@studently.edu",
                password="",
                full_name="No Password SU",
            )

    def test_fail_closed_permission_methods(self):
        superuser = User.objects.create_superuser(
            email="su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Active SU",
        )
        admin_user = User.objects.create_user(
            email="admin@studently.edu",
            password="Str0ng!StudentlyPass#2026",
            full_name="Standard Admin",
            role="ADMIN",
        )
        teacher_user = User.objects.create_user(
            email="teacher@studently.edu",
            password="Str0ng!StudentlyPass#2026",
            full_name="Standard Teacher",
            role="TEACHER",
        )

        # Active superuser succeeds for valid formatted permissions & modules
        self.assertTrue(superuser.has_perm("students.can_view"))
        self.assertTrue(superuser.has_perm("users.view_user"))
        self.assertFalse(superuser.has_perm("unknown_module.can_view"))
        self.assertFalse(superuser.has_perm("payments.invalid_action"))
        self.assertTrue(superuser.has_module_perms("users"))
        self.assertFalse(superuser.has_module_perms("unknown_module"))
        self.assertFalse(superuser.has_perm("invalid_format"))

        # Deactivated / inactive superuser fails closed
        superuser.is_active = False
        self.assertFalse(superuser.has_perm("students.can_view"))
        self.assertFalse(superuser.has_module_perms("students"))
        superuser.is_active = True
        superuser.status = "Deactivated"
        self.assertFalse(superuser.has_perm("students.can_view"))
        self.assertFalse(superuser.has_module_perms("students"))

        # Standard ADMIN fails closed (no implicit ADMIN bypass)
        self.assertFalse(admin_user.has_perm("students.can_view"))
        self.assertFalse(admin_user.has_perm("payments.can_add"))
        self.assertFalse(admin_user.has_module_perms("students"))

        # TEACHER fails closed & respects hard safety ceiling
        self.assertFalse(teacher_user.has_perm("payments.can_view"))
        self.assertFalse(teacher_user.has_perm("users.can_view"))
        self.assertFalse(teacher_user.has_perm("students.can_delete"))
        self.assertFalse(teacher_user.has_perm("students.can_view"))
        self.assertFalse(teacher_user.has_module_perms("payments"))
        self.assertFalse(teacher_user.has_module_perms("students"))

    def test_admin_registration_and_creation_form_hashes_password(self):
        self.assertIn(User, admin.site._registry)
        self.assertIsInstance(admin.site._registry[User], CustomUserAdmin)

        form = CustomUserCreationForm(
            data={
                "email": "admin.form@studently.edu",
                "full_name": "Admin Form User",
                "role": "ADMIN",
                "status": "Active",
                "password": "Str0ng!AdminForm#2026",
                "password_confirm": "Str0ng!AdminForm#2026",
                "is_active": True,
                "is_staff": True,
                "is_superuser": False,
            }
        )
        self.assertTrue(form.is_valid(), form.errors)
        created = form.save()
        self.assertNotEqual(created.password, "Str0ng!AdminForm#2026")
        self.assertTrue(created.check_password("Str0ng!AdminForm#2026"))


@override_settings(REST_FRAMEWORK=RELAXED_THROTTLE_REST_FRAMEWORK)
class JWTAuthenticationAPITests(APITestCase):
    """Tests for JWT obtain, refresh (rotation + blacklist), verify, and security."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.token_url = reverse("accounts:token_obtain_pair")
        self.refresh_url = reverse("accounts:token_refresh")
        self.verify_url = reverse("accounts:token_verify")
        self.password = "Str0ng!StudentlyPass#2026"
        self.user = User.objects.create_user(
            email="auth.user@studently.edu",
            password=self.password,
            full_name="Auth Test User",
            role="ADMIN",
        )

    def test_login_valid_credentials_and_case_insensitive_email(self):
        response = self.client.post(
            self.token_url,
            {"email": "AUTH.USER@STUDENTLY.EDU", "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertNotIn("password", response.data)
        self.assertNotIn(self.user.password, str(response.data))

        # Validate access token claims and authenticate via JWTAuthentication
        access_token = AccessToken(response.data["access"])
        self.assertEqual(access_token["user_id"], str(self.user.id))
        self.assertNotIn("password", access_token.payload)

        factory = APIRequestFactory()
        request = factory.get(
            "/health/",
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}",
        )
        auth_user, _validated_token = JWTAuthentication().authenticate(request)
        self.assertEqual(auth_user.id, self.user.id)

    def test_login_invalid_and_missing_credentials(self):
        wrong_pw = self.client.post(
            self.token_url,
            {"email": self.user.email, "password": "WrongPassword!999"},
            format="json",
        )
        self.assertEqual(wrong_pw.status_code, status.HTTP_401_UNAUTHORIZED)

        unknown_user = self.client.post(
            self.token_url,
            {"email": "nobody@studently.edu", "password": self.password},
            format="json",
        )
        self.assertEqual(unknown_user.status_code, status.HTTP_401_UNAUTHORIZED)

        missing_fields = self.client.post(self.token_url, {}, format="json")
        self.assertEqual(missing_fields.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_and_deactivated_accounts_rejected(self):
        inactive_user = User.objects.create_user(
            email="inactive@studently.edu",
            password=self.password,
            full_name="Inactive User",
            is_active=False,
        )
        resp_inactive = self.client.post(
            self.token_url,
            {"email": inactive_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(resp_inactive.status_code, status.HTTP_401_UNAUTHORIZED)

        deactivated_user = User.objects.create_user(
            email="deactivated@studently.edu",
            password=self.password,
            full_name="Deactivated User",
            status="Deactivated",
        )
        resp_deactivated = self.client.post(
            self.token_url,
            {"email": deactivated_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(resp_deactivated.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_rotation_and_blacklisting(self):
        obtain_resp = self.client.post(
            self.token_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(obtain_resp.status_code, status.HTTP_200_OK)
        original_refresh = obtain_resp.data["refresh"]

        refresh_resp = self.client.post(
            self.refresh_url,
            {"refresh": original_refresh},
            format="json",
        )
        self.assertEqual(refresh_resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_resp.data)
        self.assertIn("refresh", refresh_resp.data)
        self.assertNotEqual(refresh_resp.data["refresh"], original_refresh)

        # Old refresh token must be blacklisted after rotation
        replay_resp = self.client.post(
            self.refresh_url,
            {"refresh": original_refresh},
            format="json",
        )
        self.assertEqual(replay_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_verify_valid_invalid_and_expired_tokens(self):
        refresh = RefreshToken.for_user(self.user)
        valid_access = str(refresh.access_token)

        valid_resp = self.client.post(
            self.verify_url,
            {"token": valid_access},
            format="json",
        )
        self.assertEqual(valid_resp.status_code, status.HTTP_200_OK)

        invalid_resp = self.client.post(
            self.verify_url,
            {"token": "not.a.valid.jwt.token"},
            format="json",
        )
        self.assertEqual(invalid_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Backdate access token expiration to simulate an expired token
        expired_token = AccessToken.for_user(self.user)
        expired_token.set_exp(lifetime=-timedelta(minutes=5))
        expired_str = str(expired_token)

        expired_verify_resp = self.client.post(
            self.verify_url,
            {"token": expired_str},
            format="json",
        )
        self.assertEqual(expired_verify_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        factory = APIRequestFactory()
        expired_req = factory.get("/health/", HTTP_AUTHORIZATION=f"Bearer {expired_str}")
        with self.assertRaises(InvalidToken):
            JWTAuthentication().authenticate(expired_req)

    def test_anonymous_request_not_authenticated(self):
        factory = APIRequestFactory()
        anon_req = factory.get("/health/")
        self.assertIsNone(JWTAuthentication().authenticate(anon_req))


class AuthThrottlingTests(APITestCase):
    """Verifies ScopedRateThrottle brute-force defense on /api/v1/auth/token/."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.token_url = reverse("accounts:token_obtain_pair")

    def test_token_obtain_endpoint_throttles_after_five_attempts(self):
        statuses = []
        for _ in range(6):
            resp = self.client.post(
                self.token_url,
                {"email": "missing@studently.edu", "password": "BadPassword!123"},
                format="json",
            )
            statuses.append(resp.status_code)
        self.assertEqual(statuses[:5], [status.HTTP_401_UNAUTHORIZED] * 5)
        self.assertEqual(statuses[5], status.HTTP_429_TOO_MANY_REQUESTS)


class SuperuserPrivilegeSecurityRegressionTests(TestCase):
    """
    Focused regression tests for Stage 3.3 Security Correction:
    ADMIN / TEACHER superuser privilege enforcement across manager, permissions,
    Django admin forms, and database CHECK constraint.
    """

    # --- Manager Tests (1-6) ---

    def test_01_normal_teacher_creation_succeeds(self):
        teacher = User.objects.create_user(
            email="normal.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Normal Teacher",
            role="TEACHER",
        )
        self.assertEqual(teacher.role, "TEACHER")
        self.assertFalse(teacher.is_superuser)
        self.assertTrue(teacher.is_active)

    def test_02_normal_admin_creation_succeeds(self):
        admin_user = User.objects.create_user(
            email="normal.admin@studently.edu",
            password="Str0ng!AdminPass#2026",
            full_name="Normal Admin",
            role="ADMIN",
        )
        self.assertEqual(admin_user.role, "ADMIN")
        self.assertFalse(admin_user.is_superuser)
        self.assertTrue(admin_user.is_active)

    def test_03_create_user_teacher_superuser_rejected(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="evil.teacher@studently.edu",
                password="Str0ng!TeacherPass#2026",
                full_name="Evil Teacher",
                role="TEACHER",
                is_superuser=True,
            )
        self.assertFalse(User.objects.filter(email="evil.teacher@studently.edu").exists())

    def test_04_create_user_admin_superuser_rejected(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(
                email="bypass.admin@studently.edu",
                password="Str0ng!AdminPass#2026",
                full_name="Bypass Admin",
                role="ADMIN",
                is_superuser=True,
            )
        self.assertFalse(User.objects.filter(email="bypass.admin@studently.edu").exists())

    def test_05_valid_create_superuser_succeeds(self):
        su = User.objects.create_superuser(
            email="valid.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Valid Superuser",
        )
        self.assertEqual(su.role, "ADMIN")
        self.assertTrue(su.is_superuser)
        self.assertTrue(su.is_staff)
        self.assertTrue(su.is_active)
        self.assertEqual(su.status, "Active")

    def test_06_invalid_superuser_role_rejected(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                email="teacher.su@studently.edu",
                password="Super!Str0ngPass#2026",
                full_name="Teacher Superuser Attempt",
                role="TEACHER",
            )
        self.assertFalse(User.objects.filter(email="teacher.su@studently.edu").exists())

    # --- Permission Tests (7-11) ---

    def test_07_normal_teacher_denied_financial_and_admin_permissions(self):
        teacher = User.objects.create_user(
            email="perm.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Perm Teacher",
            role="TEACHER",
        )
        for perm in (
            "payments.can_view",
            "fees.can_add",
            "income.can_view",
            "expenses.can_edit",
            "users.can_view",
            "settings.can_edit",
            "certificates.can_print",
            "students.can_delete",
        ):
            self.assertFalse(teacher.has_perm(perm), f"TEACHER should be denied {perm}")
        for mod in ("payments", "fees", "income", "expenses", "users", "settings", "certificates"):
            self.assertFalse(teacher.has_module_perms(mod), f"TEACHER should be denied module {mod}")

    def test_08_teacher_with_manually_forced_is_superuser_receives_no_superuser_permissions(self):
        teacher = User.objects.create_user(
            email="forced.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Forced Teacher",
            role="TEACHER",
        )
        # Simulate a malformed / tampered in-memory object bypassing DB constraints
        teacher.is_superuser = True
        teacher.is_staff = True

        self.assertFalse(teacher.has_perm("payments.can_view"))
        self.assertFalse(teacher.has_perm("users.can_delete"))
        self.assertFalse(teacher.has_perm("accounts.view_user"))
        self.assertFalse(teacher.has_perm("students.can_view"))
        self.assertFalse(teacher.has_module_perms("payments"))
        self.assertFalse(teacher.has_module_perms("users"))
        self.assertFalse(teacher.has_module_perms("accounts"))
        self.assertFalse(teacher.has_module_perms("students"))

    def test_09_inactive_admin_superuser_denied(self):
        su = User.objects.create_superuser(
            email="inactive.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Inactive SU",
        )
        su.is_active = False
        self.assertFalse(su.has_perm("payments.can_view"))
        self.assertFalse(su.has_module_perms("accounts"))

        su.is_active = True
        su.status = "Deactivated"
        self.assertFalse(su.has_perm("payments.can_view"))
        self.assertFalse(su.has_module_perms("accounts"))

    def test_10_active_admin_superuser_retains_valid_superuser_behavior(self):
        su = User.objects.create_superuser(
            email="active.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Active SU",
        )
        self.assertTrue(su.has_perm("payments.can_view"))
        self.assertTrue(su.has_perm("users.view_user"))
        self.assertTrue(su.has_perm("students.add"))
        self.assertTrue(su.has_module_perms("users"))
        self.assertTrue(su.has_module_perms("payments"))
        self.assertFalse(su.has_perm("malformed_perm"))

    def test_10b_active_admin_superuser_rejects_unknown_module_and_invalid_action(self):
        su = User.objects.create_superuser(
            email="strict.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Strict Validation SU",
        )
        # Unknown modules must return False even for active ADMIN superuser
        self.assertFalse(su.has_perm("unknown_module.can_view"))
        self.assertFalse(su.has_perm("accounts.view_user"))
        # Invalid actions on valid modules must return False
        self.assertFalse(su.has_perm("payments.invalid_action"))
        self.assertFalse(su.has_perm("students.destroy_everything"))
        # Malformed identifiers must return False
        self.assertFalse(su.has_perm("payments"))
        self.assertFalse(su.has_perm("payments.can_view.extra"))
        self.assertFalse(su.has_perm(".can_view"))
        self.assertFalse(su.has_perm("payments."))
        # Valid module/action combinations return True
        self.assertTrue(su.has_perm("payments.can_view"))
        self.assertTrue(su.has_perm("students.change_student"))

    def test_10c_django_style_action_suffix_and_module_perms_validation(self):
        su = User.objects.create_superuser(
            email="suffix.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Suffix Validation SU",
        )
        # Issue A: Incomplete or malformed Django-style suffixes rejected
        self.assertFalse(su.has_perm("payments.view_"))
        self.assertFalse(su.has_perm("payments.add_"))
        self.assertFalse(su.has_perm("payments.change_"))
        self.assertFalse(su.has_perm("payments.delete_"))
        self.assertFalse(su.has_perm("payments.view_!!!"))
        self.assertFalse(su.has_perm("payments.view_123bad"))

        # Issue A: Valid Django-style permissions accepted for active ADMIN superuser
        self.assertTrue(su.has_perm("payments.view_invoice"))
        self.assertTrue(su.has_perm("students.change_student"))

        # Issue B: Unknown modules rejected by has_module_perms even for active ADMIN superuser
        self.assertFalse(su.has_module_perms("unknown_module"))
        self.assertFalse(su.has_module_perms("accounts"))
        self.assertFalse(su.has_module_perms(""))
        self.assertFalse(su.has_module_perms("   "))

        # Issue B: Valid module visibility retained for active ADMIN superuser
        self.assertTrue(su.has_module_perms("payments"))
        self.assertTrue(su.has_module_perms("students"))

    def test_11_missing_user_permission_records_still_fail_closed(self):
        standard_admin = User.objects.create_user(
            email="std.admin@studently.edu",
            password="Str0ng!AdminPass#2026",
            full_name="Standard Admin",
            role="ADMIN",
        )
        standard_teacher = User.objects.create_user(
            email="std.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Standard Teacher",
            role="TEACHER",
        )
        self.assertFalse(standard_admin.has_perm("students.can_view"))
        self.assertFalse(standard_admin.has_module_perms("students"))
        self.assertFalse(standard_teacher.has_perm("students.can_view"))
        self.assertFalse(standard_teacher.has_module_perms("students"))

    # --- Admin Form Tests (12-14) ---

    def test_12_admin_creation_form_rejects_teacher_superuser(self):
        form = CustomUserCreationForm(
            data={
                "email": "form.teacher.su@studently.edu",
                "full_name": "Form Teacher SU",
                "role": "TEACHER",
                "status": "Active",
                "password": "Str0ng!FormPass#2026",
                "password_confirm": "Str0ng!FormPass#2026",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("is_superuser", form.errors)

    def test_13_admin_change_form_rejects_teacher_promotion_to_superuser(self):
        teacher = User.objects.create_user(
            email="promote.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="Promote Teacher",
            role="TEACHER",
        )
        change_form = CustomUserChangeForm(
            data={
                "email": teacher.email,
                "full_name": teacher.full_name,
                "role": "TEACHER",
                "status": "Active",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            },
            instance=teacher,
        )
        self.assertFalse(change_form.is_valid())
        self.assertIn("is_superuser", change_form.errors)

        # Also reject demoting an ADMIN superuser to TEACHER while keeping is_superuser=True
        su = User.objects.create_superuser(
            email="demote.su@studently.edu",
            password="Super!Str0ngPass#2026",
            full_name="Demote SU",
        )
        demote_form = CustomUserChangeForm(
            data={
                "email": su.email,
                "full_name": su.full_name,
                "role": "TEACHER",
                "status": "Active",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            },
            instance=su,
        )
        self.assertFalse(demote_form.is_valid())
        self.assertIn("is_superuser", demote_form.errors)

    def test_14_valid_admin_superuser_form_behavior_preserved(self):
        create_form = CustomUserCreationForm(
            data={
                "email": "form.admin.su@studently.edu",
                "full_name": "Form Admin SU",
                "role": "ADMIN",
                "status": "Active",
                "password": "Super!FormPass#2026",
                "password_confirm": "Super!FormPass#2026",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            }
        )
        self.assertTrue(create_form.is_valid(), create_form.errors)
        created_su = create_form.save()
        self.assertTrue(created_su.is_superuser)
        self.assertEqual(created_su.role, "ADMIN")
        self.assertTrue(created_su.check_password("Super!FormPass#2026"))

        change_form = CustomUserChangeForm(
            data={
                "email": created_su.email,
                "full_name": "Updated Admin SU",
                "role": "ADMIN",
                "status": "Active",
                "is_active": True,
                "is_staff": True,
                "is_superuser": True,
            },
            instance=created_su,
        )
        self.assertTrue(change_form.is_valid(), change_form.errors)
        updated_su = change_form.save()
        self.assertEqual(updated_su.full_name, "Updated Admin SU")
        self.assertTrue(updated_su.is_superuser)

    # --- Database Constraint Test (15) ---

    def test_15_database_constraint_rejects_teacher_superuser(self):
        # Attempt 1: Direct ORM save bypassing manager
        malformed_teacher = User(
            email="db.teacher.su@studently.edu",
            full_name="DB Teacher SU",
            role="TEACHER",
            status="Active",
            is_active=True,
            is_staff=True,
            is_superuser=True,
        )
        malformed_teacher.set_password("Str0ng!Pass#2026")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                malformed_teacher.save()

        # Attempt 2: Direct raw SQL UPDATE on an existing TEACHER row
        teacher = User.objects.create_user(
            email="sql.teacher@studently.edu",
            password="Str0ng!TeacherPass#2026",
            full_name="SQL Teacher",
            role="TEACHER",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE studently_users SET is_superuser = 1 WHERE id = %s;",
                        [teacher.id.hex],
                    )

