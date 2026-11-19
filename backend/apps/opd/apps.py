"""
apps/opd/apps.py
-----------------
App configuration for the 'OPD Token Queue' module.
"""
from django.apps import AppConfig

class OpdConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.opd'
    verbose_name = 'OPD Token Queue'
