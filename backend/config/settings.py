"""
Django settings for the STUDENTLY backend foundation (Phase 3.1).

Architecture Reference:
- Approved Phase 2 documentation under `documentation/phase-2/`
- Single-module, environment-driven configuration with explicit distinction
  between `development` and `production` modes.
- No business applications, custom user model, JWT authentication, RBAC, or
  production MySQL configuration are enabled in Stage 3.1.
"""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.db.backends.signals import connection_created
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load local environment variables from backend/.env if present.
# Existing process environment variables take precedence over .env values.
load_dotenv(BASE_DIR / ".env", override=False)


def _get_bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_list_env(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return list(default) if default is not None else []
    return [item.strip() for item in raw.split(",") if item.strip()]


# ------------------------------------------------------------------------------
# Environment & Core Security Settings
# ------------------------------------------------------------------------------

DJANGO_ENV = os.getenv("DJANGO_ENV", "development").strip().lower()
if DJANGO_ENV not in {"development", "production"}:
    raise ImproperlyConfigured(
        "DJANGO_ENV must be either 'development' or 'production'."
    )

IS_PRODUCTION = DJANGO_ENV == "production"

DEBUG = _get_bool_env("DJANGO_DEBUG", default=not IS_PRODUCTION)
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured(
        "DJANGO_DEBUG cannot be enabled when DJANGO_ENV='production'."
    )

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY environment variable must be set."
    )
if IS_PRODUCTION and (
    SECRET_KEY.startswith("replace-with-")
    or SECRET_KEY.startswith("django-insecure-")
    or len(SECRET_KEY) < 50
):
    raise ImproperlyConfigured(
        "A strong, non-placeholder DJANGO_SECRET_KEY (at least 50 characters) "
        "is required when DJANGO_ENV='production'."
    )

ALLOWED_HOSTS = _get_list_env(
    "DJANGO_ALLOWED_HOSTS",
    default=["127.0.0.1", "localhost"] if DEBUG else [],
)
if IS_PRODUCTION and (not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS):
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS must be explicitly configured without wildcards "
        "when DJANGO_ENV='production'."
    )


# ------------------------------------------------------------------------------
# Application Definition (Stage 3.1 Foundation Only — No Business Apps)
# ------------------------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "apps.core",
    "apps.accounts",
    "apps.academics",
    "apps.students",
    "apps.attendance",
    "apps.examinations",
    "apps.finances",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


# ------------------------------------------------------------------------------
# Database (Development SQLite in Stage 3.2; Production MySQL in Future Stage)
# ------------------------------------------------------------------------------

DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
if DB_ENGINE == "mysql":
    raise ImproperlyConfigured(
        "MySQL production database connectivity is not enabled in Stage 3.2; "
        "it will be configured in a subsequent authorized Phase 3 stage."
    )
if DB_ENGINE != "sqlite":
    raise ImproperlyConfigured(
        f"Unsupported DB_ENGINE={DB_ENGINE!r}. Only 'sqlite' is enabled in Stage 3.2."
    )

SQLITE_DB_NAME = os.getenv("SQLITE_DB_NAME", "db.sqlite3").strip() or "db.sqlite3"
if SQLITE_DB_NAME == ":memory:":
    SQLITE_DB_PATH = ":memory:"
else:
    _raw_db_path = Path(SQLITE_DB_NAME)
    SQLITE_DB_PATH = (
        _raw_db_path.resolve()
        if _raw_db_path.is_absolute()
        else (BASE_DIR / _raw_db_path).resolve()
    )
    SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": SQLITE_DB_PATH,
    }
}


def _enable_sqlite_foreign_keys(sender, connection, **kwargs):
    """Enforce SQLite foreign key constraints on every connection (Phase 2)."""
    if connection.vendor == "sqlite":
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA foreign_keys = ON;")


connection_created.connect(
    _enable_sqlite_foreign_keys,
    dispatch_uid="studently_enable_sqlite_foreign_keys",
)


# ------------------------------------------------------------------------------
# Password Validation
# ------------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# ------------------------------------------------------------------------------
# Internationalization & Time Zone
# ------------------------------------------------------------------------------

LANGUAGE_CODE = os.getenv("DJANGO_LANGUAGE_CODE", "en-us").strip() or "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "UTC").strip() or "UTC"
USE_I18N = True
USE_TZ = True


# ------------------------------------------------------------------------------
# Static Files
# ------------------------------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"


# ------------------------------------------------------------------------------
# Default Primary Key Field Type
# ------------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ------------------------------------------------------------------------------
# Custom User Model & Authentication (Stage 3.3)
# ------------------------------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"


# ------------------------------------------------------------------------------
# Django REST Framework & SimpleJWT Configuration (Stage 3.3)
# ------------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "auth_token": os.getenv("THROTTLE_AUTH_TOKEN", "5/min"),
        "auth_token_refresh": os.getenv("THROTTLE_AUTH_TOKEN_REFRESH", "30/min"),
        "auth_token_verify": os.getenv("THROTTLE_AUTH_TOKEN_VERIFY", "60/min"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", "30"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_LIFETIME_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": os.getenv("JWT_ALGORITHM", "HS256"),
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}


# ------------------------------------------------------------------------------
# Security Hardening Headers & Production Transport Controls
# ------------------------------------------------------------------------------

X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True

if not DEBUG:
    SECURE_SSL_REDIRECT = _get_bool_env("DJANGO_SECURE_SSL_REDIRECT", default=True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
