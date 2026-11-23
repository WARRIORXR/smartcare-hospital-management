#!/usr/bin/env bash
# build.sh — Render.com build script for SmartCare Django backend
# Runs automatically on every deploy

set -o errexit  # Exit on error

echo "==> Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --no-input

echo "==> Running database migrations..."
python manage.py migrate --no-input

echo "==> Seeding demo data (skips if data exists)..."
python manage.py seed_demo_data || echo "Seed data already exists or seed command unavailable — skipping."

echo "==> Build complete!"
