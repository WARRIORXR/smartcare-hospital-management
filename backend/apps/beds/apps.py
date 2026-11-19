"""
apps/beds/apps.py
------------------
App configuration for the 'Bed Management' module.
"""
from django.apps import AppConfig

class BedsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.beds'
    verbose_name = 'Bed Management'
