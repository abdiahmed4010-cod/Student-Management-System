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
# Database (SQLite by default; explicitly selected MySQL for staging/production)
# ------------------------------------------------------------------------------

DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()
if DB_ENGINE not in {"sqlite", "mysql"}:
    raise ImproperlyConfigured(
        "Unsupported DB_ENGINE. Choose either 'sqlite' or 'mysql'."
    )

if DB_ENGINE == "sqlite":
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
else:
    _mysql_required = ("DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT")
    _mysql_values = {name: os.getenv(name, "").strip() for name in _mysql_required}
    _mysql_missing = [name for name, value in _mysql_values.items() if not value]
    if _mysql_missing:
        raise ImproperlyConfigured(
            "DB_ENGINE='mysql' requires non-empty values for: "
            + ", ".join(_mysql_missing)
            + "."
        )

    try:
        _mysql_port = int(_mysql_values["DB_PORT"])
    except ValueError as exc:
        raise ImproperlyConfigured("DB_PORT must be an integer from 1 to 65535.") from exc
    if not 1 <= _mysql_port <= 65535:
        raise ImproperlyConfigured("DB_PORT must be an integer from 1 to 65535.")

    DB_CONN_MAX_AGE = os.getenv("DB_CONN_MAX_AGE", "60").strip()
    try:
        DB_CONN_MAX_AGE = int(DB_CONN_MAX_AGE)
    except ValueError as exc:
        raise ImproperlyConfigured("DB_CONN_MAX_AGE must be a non-negative integer.") from exc
    if DB_CONN_MAX_AGE < 0:
        raise ImproperlyConfigured("DB_CONN_MAX_AGE must be a non-negative integer.")

    DB_CHARSET = os.getenv("DB_CHARSET", "utf8mb4").strip().lower()
    if DB_CHARSET != "utf8mb4":
        raise ImproperlyConfigured("DB_CHARSET must be 'utf8mb4'.")

    DB_COLLATION = os.getenv("DB_COLLATION", "utf8mb4_unicode_ci").strip().lower()
    if DB_COLLATION not in {"utf8mb4_unicode_ci", "utf8mb4_0900_ai_ci"}:
        raise ImproperlyConfigured(
            "DB_COLLATION must be 'utf8mb4_unicode_ci' or 'utf8mb4_0900_ai_ci'."
        )

    DB_ISOLATION_LEVEL = os.getenv("DB_ISOLATION_LEVEL", "read committed").strip().lower()
    if DB_ISOLATION_LEVEL not in {
        "read uncommitted",
        "read committed",
        "repeatable read",
        "serializable",
    }:
        raise ImproperlyConfigured(
            "DB_ISOLATION_LEVEL must be one of: read uncommitted, read committed, "
            "repeatable read, serializable."
        )

    # Values that enter this SQL are validated against fixed allowlists above.
    # Keep strict mode enabled and make new Django-created tables use InnoDB.
    _mysql_init_command = (
        "SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,"
        "NO_ENGINE_SUBSTITUTION', SESSION default_storage_engine='InnoDB', "
        "SESSION character_set_connection='utf8mb4', "
        f"SESSION collation_connection='{DB_COLLATION}'"
    )
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": _mysql_values["DB_NAME"],
            "USER": _mysql_values["DB_USER"],
            "PASSWORD": _mysql_values["DB_PASSWORD"],
            "HOST": _mysql_values["DB_HOST"],
            "PORT": str(_mysql_port),
            "CONN_MAX_AGE": DB_CONN_MAX_AGE,
            "OPTIONS": {
                "charset": DB_CHARSET,
                "init_command": _mysql_init_command,
                "isolation_level": DB_ISOLATION_LEVEL,
            },
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
