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

ALLOWED_HOSTS = ['localhost', '127.0.0.1']

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
# DATABASE — MySQL
# ------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': config('DB_NAME', default='smartcare_db'),
        'USER': config('DB_USER', default='root'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',   # Support emojis and all Unicode
        }
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
}

# ------------------------------------------------------------------
# CORS SETTINGS — Allow React dev server to call Django API
# ------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',    # React dev server
    'http://127.0.0.1:3000',
]

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
