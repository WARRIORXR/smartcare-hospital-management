"""
smartcare/settings.py
----------------------
Main Django settings for SmartCare Hospital Management System.
Configured for MySQL database and JWT authentication.
"""

from pathlib import Path
from decouple import config
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------
# SECURITY
# ------------------------------------------------------------------
# Keep the secret key secret in production! Use .env file.
SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-this-in-production')

# Set to False in production
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='localhost,127.0.0.1,.onrender.com').split(',') if h.strip()]

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
    'rest_framework',               # Django REST Framework
    'rest_framework_simplejwt',     # JWT Authentication
    'corsheaders',                  # Allow React frontend to access API
    # Our custom apps
    'apps.accounts',                # User auth module
    'apps.opd',                     # OPD Token Queue module
    'apps.beds',                    # Bed Management module
    'apps.bloodbank',               # Blood Bank module
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',    # Serve static files in production
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # CORS must be before CommonMiddleware
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
# DATABASE — SQLite (default for instant zero-config deploy) or PostgreSQL
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
# AUTH — Custom User Model
# ------------------------------------------------------------------
# We use a custom user model to add 'role' field
AUTH_USER_MODEL = 'accounts.User'

# ------------------------------------------------------------------
# JWT SETTINGS (djangorestframework-simplejwt)
# ------------------------------------------------------------------
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),     # Token expires in 8 hours
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),     # Refresh token lasts 1 day
    'ROTATE_REFRESH_TOKENS': True,                   # Issue new refresh on use
    'AUTH_HEADER_TYPES': ('Bearer',),                # Authorization: Bearer <token>
}

# ------------------------------------------------------------------
# REST FRAMEWORK SETTINGS
# ------------------------------------------------------------------
REST_FRAMEWORK = {
    # Use JWT for all API endpoints by default
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Users must be authenticated to access any endpoint (unless overridden)
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Rate Limiting & Throttling (Protection against brute-force and DoS)
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/minute',
        'user': '1200/minute',
    },
}

# ------------------------------------------------------------------
# CORS SETTINGS — Allow React dev server and production frontend
# ------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',    # Vite dev server
    'http://127.0.0.1:5173',
    'http://localhost:3000',    # React dev server
    'http://127.0.0.1:3000',
    'https://smartcare-hospital-tyr.pages.dev',
    'https://smartcare-hospital.tanishjaswal56.workers.dev',
]

# Add production frontend URL from env
FRONTEND_URL = config('FRONTEND_URL', default='')
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.append(FRONTEND_URL)

# Automatically allow Cloudflare domains (*.workers.dev, *.pages.dev) and Render domains
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https:\/\/.*\.pages\.dev$",
    r"^https:\/\/.*\.workers\.dev$",
    r"^https:\/\/.*\.onrender\.com$",
]

CORS_ALLOW_ALL_ORIGINS = DEBUG  # Allow local dev origins when in debug mode
CORS_ALLOW_CREDENTIALS = True

# ------------------------------------------------------------------
# PASSWORD VALIDATORS
# ------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ------------------------------------------------------------------
# INTERNATIONALIZATION
# ------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'      # Indian Standard Time
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------------
# STATIC FILES
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
# PRODUCTION SECURITY (only when DEBUG=False)
# ------------------------------------------------------------------
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
