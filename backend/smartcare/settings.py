"""
smartcare/settings.py
----------------------
Main Django settings for SmartCare Hospital Management System.
Security-hardened with environment-driven secrets, strict CORS,
short-lived JWTs with refresh rotation & blacklisting, rate limiting,
strong password enforcement, and OpenAPI/Swagger documentation.
"""

import sys
from pathlib import Path
from datetime import timedelta
from decouple import config
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

TESTING = len(sys.argv) > 1 and sys.argv[1] in ['test', 'pytest']
COLLECTSTATIC = 'collectstatic' in sys.argv

# ------------------------------------------------------------------
# SECURITY & DEMO SANDBOX FLAGS
# ------------------------------------------------------------------
# Safe by default: DEBUG defaults to False
DEBUG = config('DEBUG', default=False, cast=bool)

# Controls synthetic demo seeding; off in real non-debug production unless explicitly set
DEMO_MODE = config('DEMO_MODE', default=DEBUG, cast=bool)

# Never auto-create or expose weak admin demo credentials in live environments
ALLOW_DEMO_ADMIN = config('ALLOW_DEMO_ADMIN', default=False, cast=bool)

SECRET_KEY = config('SECRET_KEY', default='')
if not SECRET_KEY or SECRET_KEY.startswith('django-insecure-change'):
    if DEBUG or TESTING or COLLECTSTATIC:
        SECRET_KEY = 'django-insecure-dev-test-ephemeral-key-do-not-use-in-prod-9z4q2w'
    else:
        raise ImproperlyConfigured(
            "SECRET_KEY environment variable must be set to a strong cryptographic secret when DEBUG=False."
        )

ALLOWED_HOSTS = [
    h.strip()
    for h in config('ALLOWED_HOSTS', default='localhost,127.0.0.1,testserver,.onrender.com').split(',')
    if h.strip()
]

# ------------------------------------------------------------------
# INSTALLED APPS
# ------------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'rest_framework',                         # Django REST Framework
    'rest_framework_simplejwt',               # JWT Authentication
    'rest_framework_simplejwt.token_blacklist',  # Refresh Token Rotation Blacklist
    'corsheaders',                            # Strict Frontend CORS
    'drf_spectacular',                        # OpenAPI 3 / Swagger UI

    # SmartCare modules
    'apps.accounts',                          # Users, Profiles, Leave, Feedback, AuditLog
    'apps.opd',                               # OPD Token Queue & Notifications
    'apps.beds',                              # Ward & Bed Management
    'apps.bloodbank',                         # Blood Bank & Donors
    'apps.records',                           # Prescriptions, Visit Notes & Lab Reports
    'apps.billing',                           # Invoices & PDF Receipts
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',    # Serve static files in production
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',         # CORS must be before CommonMiddleware
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'smartcare.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'smartcare.wsgi.application'

# ------------------------------------------------------------------
# DATABASE — SQLite (default for dev/demo) or PostgreSQL / MySQL
# ------------------------------------------------------------------
DB_ENGINE = config('DB_ENGINE', default='sqlite').lower()
DATABASE_URL = config('DATABASE_URL', default='')

if DB_ENGINE == 'postgresql' or (DATABASE_URL and DB_ENGINE != 'sqlite'):
    import dj_database_url
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            conn_health_checks=True,
        )
    }
elif DB_ENGINE == 'mysql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': config('DB_NAME', default='smartcare_db'),
            'USER': config('DB_USER', default='root'),
            'PASSWORD': config('DB_PASSWORD', default=''),
            'HOST': config('DB_HOST', default='localhost'),
            'PORT': config('DB_PORT', default='3306'),
            'OPTIONS': {
                'charset': 'utf8mb4',
            }
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# ------------------------------------------------------------------
# CACHE (Required for DRF Rate Limiting / Throttling)
# ------------------------------------------------------------------
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'smartcare-throttle-cache',
    }
}

# ------------------------------------------------------------------
# AUTH — Custom User Model
# ------------------------------------------------------------------
AUTH_USER_MODEL = 'accounts.User'

# ------------------------------------------------------------------
# JWT SETTINGS (Short Access Token + Refresh Rotation & Blacklist)
# ------------------------------------------------------------------
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ------------------------------------------------------------------
# REST FRAMEWORK SETTINGS
# ------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/minute',
        'user': '1200/minute',
        'login': config('LOGIN_THROTTLE_RATE', default='5/minute'),
        'register': config('REGISTER_THROTTLE_RATE', default='10/hour'),
        'password_reset': config('PASSWORD_RESET_THROTTLE_RATE', default='5/hour'),
    },
}

# ------------------------------------------------------------------
# SWAGGER / OPENAPI DOCUMENTATION (drf-spectacular)
# ------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    'TITLE': 'SmartCare Hospital Management System API',
    'DESCRIPTION': (
        'REST API for SmartCare HMS covering OPD Queue & Advance Appointments, '
        'Inpatient Ward & Bed Allocation, Blood Bank Logistics, Clinical Medical Records, '
        'PDF Billing & Invoices, Audit Logging, and Executive Analytics.\n\n'
        'DISCLAIMER: Live demo instances contain 100% synthetic data only.'
    ),
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SECURITY': [{'jwtAuth': []}],
    'APPEND_COMPONENTS': {
        'securitySchemes': {
            'jwtAuth': {
                'type': 'http',
                'scheme': 'bearer',
                'bearerFormat': 'JWT',
            }
        }
    },
}

# ------------------------------------------------------------------
# CORS SETTINGS — Strictly limited to configured frontend domains
# ------------------------------------------------------------------
FRONTEND_URL = config('FRONTEND_URL', default='https://smartcare-hospital-tyr.pages.dev').strip()
CORS_EXTRA_ORIGINS = [
    o.strip()
    for o in config('CORS_EXTRA_ORIGINS', default='').split(',')
    if o.strip()
]

CORS_ALLOWED_ORIGINS = []
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)
CORS_ALLOWED_ORIGINS.extend(CORS_EXTRA_ORIGINS)

if DEBUG or TESTING:
    CORS_ALLOWED_ORIGINS.extend([
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ])

# Deduplicate while preserving order
CORS_ALLOWED_ORIGINS = list(dict.fromkeys(CORS_ALLOWED_ORIGINS))
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# ------------------------------------------------------------------
# PASSWORD VALIDATORS (Strong Password Rules)
# ------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
    {'NAME': 'apps.accounts.validators.StrongPasswordValidator'},
]

# ------------------------------------------------------------------
# EMAIL & NOTIFICATION INTEGRATIONS (Optional Twilio SMS / WhatsApp)
# ------------------------------------------------------------------
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='noreply@smartcare.hospital')

TWILIO_ACCOUNT_SID = config('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = config('TWILIO_AUTH_TOKEN', default='')
TWILIO_FROM_PHONE = config('TWILIO_FROM_PHONE', default='')
TWILIO_WHATSAPP_FROM = config('TWILIO_WHATSAPP_FROM', default='')

# ------------------------------------------------------------------
# INTERNATIONALIZATION
# ------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'      # Indian Standard Time
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------------
# STATIC & MEDIA FILES
# ------------------------------------------------------------------
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ------------------------------------------------------------------
# SECURITY HEADERS & CLICKJACKING PROTECTION
# ------------------------------------------------------------------
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# ------------------------------------------------------------------
# PRODUCTION SECURITY (only when DEBUG=False and not running tests)
# ------------------------------------------------------------------
if not DEBUG and not TESTING:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
