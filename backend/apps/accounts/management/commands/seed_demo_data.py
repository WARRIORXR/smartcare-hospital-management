"""
apps/accounts/management/commands/seed_demo_data.py
===================================================
Django management command to seed comprehensive demo data for SmartCare HMS.

Usage:
  python manage.py seed_demo_data
"""

from django.core.management.base import BaseCommand
import sys
import os

# Import the seed logic from seed_demo_data
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../')))
from seed_demo_data import seed


class Command(BaseCommand):
    help = "Seeds 5 doctors, 20 beds, blood stock for 8 groups, and 10 donors for demo testing."

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting SmartCare demo data population..."))
        seed()
        self.stdout.write(self.style.SUCCESS("Demo database successfully populated!"))
