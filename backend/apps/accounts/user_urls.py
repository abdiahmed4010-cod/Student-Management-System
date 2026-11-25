"""
User and RBAC API routing for STUDENTLY (Stage 3.6).
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import UserViewSet

router = DefaultRouter()
router.register(r"", UserViewSet, basename="user")

urlpatterns = [
    path("", include(router.urls)),
]
