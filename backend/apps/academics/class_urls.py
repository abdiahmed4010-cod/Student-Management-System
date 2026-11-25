"""
Classroom URLs (Stage 3.8).
"""
from rest_framework.routers import DefaultRouter
from apps.academics.views import ClassroomViewSet

router = DefaultRouter()
router.register(r"", ClassroomViewSet, basename="classroom")

urlpatterns = router.urls
