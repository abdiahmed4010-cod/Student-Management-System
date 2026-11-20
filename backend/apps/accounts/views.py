"""
JWT Authentication API views for STUDENTLY (Stage 3.3).

Implements only the three foundation JWT endpoints required by Stage 3.3:
- Obtain access & refresh tokens (`POST /api/v1/auth/token/`)
- Refresh access token with rotation & blacklisting (`POST /api/v1/auth/token/refresh/`)
- Verify token validity (`POST /api/v1/auth/token/verify/`)
"""

from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

from apps.accounts.serializers import StudentlyTokenObtainPairSerializer


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
