"""
Root URL configuration for the STUDENTLY Django backend foundation (Stage 3.1).
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_check(_request):
    """Basic foundation health endpoint (no database or auth dependencies)."""
    return JsonResponse({"status": "ok", "service": "studently-backend"})


urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("admin/", admin.site.urls),
]
