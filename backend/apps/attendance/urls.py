"""
Attendance URLs (Stage 3.8).
"""

from rest_framework.routers import DefaultRouter
from apps.attendance.views import AttendanceViewSet

router = DefaultRouter()
router.register(r"", AttendanceViewSet, basename="attendance")

urlpatterns = router.urls
