"""
Authentication URL routes for STUDENTLY (Stage 3.3).
"""

from django.urls import path

from apps.accounts.views import (
    StudentlyTokenObtainPairView,
    StudentlyTokenRefreshView,
    StudentlyTokenVerifyView,
)

app_name = "accounts"

urlpatterns = [
    path("token/", StudentlyTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", StudentlyTokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", StudentlyTokenVerifyView.as_view(), name="token_verify"),
]
