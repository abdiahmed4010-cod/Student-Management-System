"""
Teacher URLs (Stage 3.8).
"""
from rest_framework.routers import DefaultRouter
from apps.academics.views import TeacherViewSet

router = DefaultRouter()
router.register(r"", TeacherViewSet, basename="teacher")

urlpatterns = router.urls
