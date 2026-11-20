"""
JWT Authentication serializers for STUDENTLY (Stage 3.3).
"""

from rest_framework import exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


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

        return data
