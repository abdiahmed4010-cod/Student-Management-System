"""
Authentication, User and RBAC Serializers for STUDENTLY (Stages 3.3 & 3.6).
"""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.academics.models import Teacher
from apps.accounts.models import User, UserPermission, VALID_MODULES, VALID_ACTION_FIELDS
from apps.accounts.rbac import (
    get_user_effective_permissions,
    validate_teacher_ceiling,
)


class StudentlyTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Issues JWT access & refresh tokens for active STUDENTLY accounts.
    - Normalizes email to lowercase prior to authentication.
    - Enforces both `is_active=True` and `status='Active'` before issuing tokens.
    - Never includes password hashes in token claims or API responses.
    """

    def validate(self, attrs):
        if self.username_field in attrs and isinstance(attrs[self.username_field], str):
            attrs[self.username_field] = attrs[self.username_field].strip().lower()

        data = super().validate(attrs)

        if not self.user.is_active or self.user.status != "Active":
            raise exceptions.AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )

        data["user"] = UserSerializer(self.user).data
        return data


class UserPermissionSerializer(serializers.ModelSerializer):
    """Serializes granular UserPermission records."""

    class Meta:
        model = UserPermission
        fields = [
            "id",
            "module",
            "can_view",
            "can_add",
            "can_edit",
            "can_delete",
            "can_import",
            "can_print",
            "can_export",
        ]
        read_only_fields = ["id"]


class UserSerializer(serializers.ModelSerializer):
    """Serializes User accounts with frontend compatibility aliases."""

    effective_permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "status",
            "is_active",
            "is_staff",
            "is_superuser",
            "teacher",
            "created_at",
            "updated_at",
            "effective_permissions",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "is_staff", "effective_permissions"]

    def get_effective_permissions(self, obj):
        return get_user_effective_permissions(obj)

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["fullName"] = ret.get("full_name")
        ret["teacherId"] = str(instance.teacher_id) if instance.teacher_id else None
        return ret


class UserCreateSerializer(serializers.ModelSerializer):
    """Creates a new User account with password validation and anti-escalation."""

    password = serializers.CharField(write_only=True, required=True, style={"input_type": "password"})
    full_name = serializers.CharField(required=False)
    fullName = serializers.CharField(required=False, write_only=True)
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    teacherId = serializers.PrimaryKeyRelatedField(
        source="teacher", queryset=Teacher.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "fullName",
            "password",
            "role",
            "status",
            "teacher",
            "teacherId",
            "is_superuser",
        ]
        read_only_fields = ["id"]

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        is_superuser = attrs.get("is_superuser", False)
        role = attrs.get("role", "TEACHER")

        # Resolve full_name from fullName if provided
        if not attrs.get("full_name"):
            full_name = self.initial_data.get("fullName") or self.initial_data.get("full_name")
            if full_name:
                attrs["full_name"] = str(full_name).strip()
            else:
                raise serializers.ValidationError({"full_name": "Full name is required."})

        # Anti-privilege escalation: only active superusers can create superusers
        if is_superuser:
            if not request or not request.user or not request.user.is_superuser:
                raise serializers.ValidationError(
                    {"is_superuser": "Only superusers can create superuser accounts."}
                )
            if role != "ADMIN":
                raise serializers.ValidationError(
                    {"is_superuser": "Only ADMIN role accounts can hold superuser privileges."}
                )

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("fullName", None)
        validated_data.pop("teacherId", None)
        user = User(**validated_data)
        user.set_password(password)
        user.full_clean()
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Updates User account details."""

    full_name = serializers.CharField(required=False)
    fullName = serializers.CharField(required=False, write_only=True)
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all(), required=False, allow_null=True)
    teacherId = serializers.PrimaryKeyRelatedField(
        source="teacher", queryset=Teacher.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = User
        fields = [
            "email",
            "full_name",
            "fullName",
            "role",
            "status",
            "teacher",
            "teacherId",
            "is_active",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        instance = self.instance

        if not attrs.get("full_name") and self.initial_data.get("fullName"):
            attrs["full_name"] = str(self.initial_data.get("fullName")).strip()

        # Anti-privilege escalation: cannot modify superuser accounts unless superuser
        if instance and instance.is_superuser:
            if not request or not request.user or not request.user.is_superuser:
                raise exceptions.PermissionDenied(
                    "Non-superusers cannot modify superuser accounts."
                )

        # Non-superusers cannot change role to ADMIN if target is changing role
        new_role = attrs.get("role")
        if new_role and instance and new_role != instance.role:
            if not request or not request.user or not request.user.is_superuser:
                if request.user.role != "ADMIN" or not request.user.has_perm("users.can_edit"):
                    raise exceptions.PermissionDenied("Not authorized to change user roles.")

        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("fullName", None)
        validated_data.pop("teacherId", None)
        return super().update(instance, validated_data)


class PasswordResetSerializer(serializers.Serializer):
    """Validates and applies password reset requests."""

    new_password = serializers.CharField(required=False, write_only=True)
    newPassword = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        pwd = attrs.get("new_password") or attrs.get("newPassword")
        if not pwd:
            raise serializers.ValidationError({"newPassword": "This field is required."})

        try:
            validate_password(pwd)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"newPassword": list(exc.messages)})

        attrs["resolved_password"] = pwd
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("fullName", None)
        validated_data.pop("teacherId", None)
        return super().update(instance, validated_data)


class PermissionsUpdateSerializer(serializers.Serializer):
    """Validates and processes granular user permission updates."""

    permissions = serializers.DictField(child=serializers.DictField())

    def validate_permissions(self, value):
        for mod, flags in value.items():
            if mod not in VALID_MODULES:
                raise serializers.ValidationError(f"Invalid module identifier '{mod}'.")
            if not isinstance(flags, dict):
                raise serializers.ValidationError(f"Flags for '{mod}' must be an object.")
        return value
