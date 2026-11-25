"""
apps/accounts/management/commands/seed_demo_data.py
===================================================
Django management command to populate synthetic sandbox demo data.
Refuses to run when DEMO_MODE=False unless --force-demo is explicitly passed.
Never creates default `admin123` accounts unless --with-admin is specified locally.
"""

import os
import sys
from django.core.management.base import BaseCommand

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../')))
from seed_demo_data import seed


class Command(BaseCommand):
    help = "Seeds synthetic hospital demo data for non-admin sandbox roles (or local admin with --with-admin)."

    def add_arguments(self, parser):
        parser.add_argument('--force-demo', action='store_true', help='Run even if DEMO_MODE=False')
        parser.add_argument('--with-admin', action='store_true', help='Also create a local admin account for dev testing')

    def handle(self, *args, **options):
        seed(force_demo=options['force_demo'], with_admin=options['with_admin'])
