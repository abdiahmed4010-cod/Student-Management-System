"""
URL routing for Core settings (Stage 3.8).
"""

from django.urls import path
from apps.core.views import SystemSettingView

urlpatterns = [
    path("", SystemSettingView.as_view(), name="system_settings"),
]
