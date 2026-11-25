"""
Subject URLs (Stage 3.8).
"""
from rest_framework.routers import DefaultRouter
from apps.academics.views import SubjectViewSet

router = DefaultRouter()
router.register(r"", SubjectViewSet, basename="subject")

urlpatterns = router.urls
