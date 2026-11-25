"""
Authentication, User Management and RBAC API Views for STUDENTLY (Stages 3.3 & 3.6).

Endpoints:
- POST /api/v1/auth/token/
- POST /api/v1/auth/token/refresh/
- POST /api/v1/auth/token/verify/
- GET, POST /api/v1/users/
- GET, PATCH, DELETE /api/v1/users/{id}/
- GET /api/v1/users/me/
- POST /api/v1/users/{id}/reset-password/
- GET, PUT, PATCH /api/v1/users/{id}/permissions/
- POST /api/v1/users/{id}/apply-profile/
"""

from rest_framework import exceptions, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from apps.accounts.models import User
from apps.accounts.permissions import CanManageUsers
from apps.accounts.rbac import (
    bulk_set_user_permissions,
    get_user_effective_permissions,
    provision_user_permissions,
)
from apps.accounts.serializers import (
    PasswordResetSerializer,
    PermissionsUpdateSerializer,
    StudentlyTokenObtainPairSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


class StudentlyTokenObtainPairView(TokenObtainPairView):
    serializer_class = StudentlyTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token"


class StudentlyTokenRefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token_refresh"


class StudentlyTokenVerifyView(TokenVerifyView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token_verify"


class CurrentUserView(APIView):
    """Returns profile and effective permissions for the currently authenticated user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class LogoutView(APIView):
    """Blacklists refresh token on logout."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        return Response({"success": True})


class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD and RBAC permission management ViewSet for STUDENTLY user accounts.
    Protected by fail-closed CanManageUsers permission class.
    """

    queryset = User.objects.all().select_related("teacher").order_by("email")
    permission_classes = [IsAuthenticated, CanManageUsers]
    module_name = "users"

    def get_permissions(self):
        if self.action == "me":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return UserUpdateSerializer
        elif self.action == "reset_password":
            return PasswordResetSerializer
        elif self.action == "permissions" and self.request.method in ["PUT", "PATCH"]:
            return PermissionsUpdateSerializer
        return UserSerializer

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        """Returns currently authenticated user profile and effective permissions."""
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        """Deletes or deactivates a user account with anti-escalation safeguards."""
        target_user = self.get_object()

        # Prevent self-deletion
        if target_user.id == request.user.id:
            return Response(
                {"detail": "Users cannot delete their own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prevent non-superusers from deleting superusers
        if target_user.is_superuser and not request.user.is_superuser:
            raise exceptions.PermissionDenied("Non-superusers cannot delete superuser accounts.")

        target_user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """Resets a user's password with password validation and anti-escalation."""
        target_user = self.get_object()

        # Anti-privilege escalation: cannot reset superuser password unless superuser
        if target_user.is_superuser and not request.user.is_superuser:
            raise exceptions.PermissionDenied("Non-superusers cannot reset superuser passwords.")

        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_user.set_password(serializer.validated_data["resolved_password"])
        target_user.save(update_fields=["password"])

        return Response(
            {"success": True, "detail": "Password reset successfully."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "put", "patch"], url_path="permissions")
    def permissions(self, request, pk=None):
        """Retrieves or updates granular per-module permissions for a user."""
        target_user = self.get_object()

        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return Response(
                {
                    "userId": str(target_user.id),
                    "email": target_user.email,
                    "role": target_user.role,
                    "permissions": get_user_effective_permissions(target_user),
                },
                status=status.HTTP_200_OK,
            )

        # PUT or PATCH
        serializer = PermissionsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        perms_data = serializer.validated_data["permissions"]
        try:
            bulk_set_user_permissions(
                target_user=target_user,
                permissions_dict=perms_data,
                requesting_user=request.user,
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "success": True,
                "userId": str(target_user.id),
                "permissions": get_user_effective_permissions(target_user),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="apply-profile")
    def apply_profile(self, request, pk=None):
        """Applies a standard RBAC provisioning profile to the target user."""
        target_user = self.get_object()
        profile_name = request.data.get("profile")
        if not profile_name:
            return Response(
                {"detail": "Field 'profile' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Anti-escalation: non-superusers cannot provision full_admin or modify superuser
        if target_user.is_superuser and not request.user.is_superuser:
            raise exceptions.PermissionDenied("Non-superusers cannot modify superusers.")

        if profile_name == "full_admin" and not request.user.is_superuser:
            raise exceptions.PermissionDenied("Only superusers can provision full_admin profile.")

        try:
            provision_user_permissions(target_user, profile_name)
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "success": True,
                "profile": profile_name,
                "permissions": get_user_effective_permissions(target_user),
            },
            status=status.HTTP_200_OK,
        )
