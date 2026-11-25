#!/usr/bin/env bash
# build.sh — Render.com build script for SmartCare Django backend
# Runs automatically on every deploy

set -o errexit

echo "==> Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --no-input

echo "==> Running database migrations..."
python manage.py migrate --no-input

if [ "${DEMO_MODE}" = "True" ] || [ "${DEMO_MODE}" = "true" ]; then
    echo "==> DEMO_MODE=True: Seeding synthetic sandbox data (demo admin disabled)..."
    python manage.py seed_demo_data || echo "Demo seed skipped."
else
    echo "==> Production mode (DEMO_MODE!=True): Skipping synthetic demo seed."
fi

echo "==> Build complete!"
