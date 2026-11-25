"""
Root URL configuration for the STUDENTLY Django backend foundation (Stage 3.1).
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from apps.core.views import DashboardMetricsView


def health_check(_request):
    """Basic foundation health endpoint (no database or auth dependencies)."""
    return JsonResponse({"status": "ok", "service": "studently-backend"})


urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/users/", include("apps.accounts.user_urls")),
    path("api/v1/settings/", include("apps.core.urls")),
    path("api/v1/dashboard/metrics/", DashboardMetricsView.as_view(), name="dashboard-metrics"),
    path("api/v1/classes/", include("apps.academics.class_urls")),
    path("api/v1/subjects/", include("apps.academics.subject_urls")),
    path("api/v1/teachers/", include("apps.academics.teacher_urls")),
    path("api/v1/students/", include("apps.students.urls")),
    path("api/v1/attendance/", include("apps.attendance.urls")),
    path("api/v1/examinations/", include("apps.examinations.urls")),
    path("api/v1/finances/", include("apps.finances.payment_urls")),
    path("api/v1/payments/", include("apps.finances.payment_urls")),
    path("admin/", admin.site.urls),
]
