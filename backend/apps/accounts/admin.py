"""
Django Admin registration for STUDENTLY's custom User model (Stage 3.3).

Respects the Phase 2 architecture (AbstractBaseUser without PermissionsMixin):
- Does not reference `groups` or `user_permissions`.
- Uses Django's password hashing and validation on user creation and updates.
- Does not bypass the custom fail-closed RBAC permission methods.
"""

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.contrib.auth.password_validation import validate_password

from apps.accounts.models import User, UserPermission


class UserPermissionInline(admin.TabularInline):
    model = UserPermission
    extra = 0
    fields = (
        "module",
        "can_view",
        "can_add",
        "can_edit",
        "can_delete",
        "can_import",
        "can_print",
        "can_export",
    )


class CustomUserCreationForm(forms.ModelForm):
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput,
        help_text="Enter a strong password matching Django password validators.",
    )
    password_confirm = forms.CharField(
        label="Password confirmation",
        widget=forms.PasswordInput,
    )

    class Meta:
        model = User
        fields = ("email", "full_name", "role", "teacher", "status", "is_active", "is_staff", "is_superuser")

    def clean_password_confirm(self):
        password = self.cleaned_data.get("password")
        password_confirm = self.cleaned_data.get("password_confirm")
        if password and password_confirm and password != password_confirm:
            raise forms.ValidationError("Passwords do not match.")
        if password:
            validate_password(password, user=self.instance)
        return password_confirm

    def clean(self):
        cleaned_data = super().clean()
        role = cleaned_data.get("role")
        is_superuser = cleaned_data.get("is_superuser")
        status = cleaned_data.get("status")
        is_active = cleaned_data.get("is_active")

        if is_superuser and role != "ADMIN":
            self.add_error(
                "is_superuser",
                "TEACHER accounts cannot be created with superuser privileges. "
                "Only ADMIN accounts may hold superuser status.",
            )
        if status == "Deactivated" and is_active:
            self.add_error(
                "is_active",
                "A deactivated user cannot have is_active=True.",
            )
        return cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password"])
        if commit:
            user.save()
        return user


class CustomUserChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField(
        label="Password",
        help_text=(
            "Raw passwords are not stored. Use the password change form "
            "to update this user's password."
        ),
    )

    class Meta:
        model = User
        fields = (
            "email",
            "password",
            "full_name",
            "role",
            "teacher",
            "status",
            "is_active",
            "is_staff",
            "is_superuser",
        )

    def clean(self):
        cleaned_data = super().clean()
        role = cleaned_data.get("role")
        is_superuser = cleaned_data.get("is_superuser")
        status = cleaned_data.get("status")
        is_active = cleaned_data.get("is_active")

        if is_superuser and role != "ADMIN":
            self.add_error(
                "is_superuser",
                "TEACHER accounts cannot be promoted to or retain superuser privileges. "
                "Only ADMIN accounts may hold superuser status.",
            )
        if status == "Deactivated" and is_active:
            self.add_error(
                "is_active",
                "A deactivated user cannot have is_active=True.",
            )
        return cleaned_data


@admin.register(User)
class CustomUserAdmin(BaseUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    list_display = ("email", "full_name", "role", "status", "is_active", "is_staff", "is_superuser")
    list_filter = ("role", "status", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "full_name")
    ordering = ("full_name",)
    filter_horizontal = ()
    readonly_fields = ("id", "last_login", "created_at", "updated_at")
    inlines = [UserPermissionInline]

    fieldsets = (
        (None, {"fields": ("id", "email", "password")}),
        ("Profile", {"fields": ("full_name", "role", "teacher", "status")}),
        ("Access Flags", {"fields": ("is_active", "is_staff", "is_superuser")}),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "full_name",
                    "role",
                    "teacher",
                    "status",
                    "password",
                    "password_confirm",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                ),
            },
        ),
    )


@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "module",
        "can_view",
        "can_add",
        "can_edit",
        "can_delete",
        "can_import",
        "can_print",
        "can_export",
    )
    list_filter = ("module", "can_view", "can_add", "can_edit", "can_delete")
    search_fields = ("user__email", "user__full_name", "module")
    ordering = ("user__email", "module")

