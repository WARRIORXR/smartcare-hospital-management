"""
apps/bloodbank/apps.py
-----------------------
App configuration for the 'Blood Bank' module.
"""
from django.apps import AppConfig

class BloodbankConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.bloodbank'
    verbose_name = 'Blood Bank'
