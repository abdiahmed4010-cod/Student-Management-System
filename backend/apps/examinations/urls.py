"""
Examination URLs (Stage 3.8).
"""

from rest_framework.routers import DefaultRouter
from apps.examinations.views import ExaminationViewSet

router = DefaultRouter()
router.register(r"", ExaminationViewSet, basename="examination")

urlpatterns = router.urls
