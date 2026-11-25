# SmartCare HMS — Deployment & Operations Guide

> **Disclaimer:** Hosted demo instances use strictly synthetic fake data (`DEMO_MODE=True`) and intentionally disable live admin demo logins (`ALLOW_DEMO_ADMIN=False`). Never deploy with `DEMO_MODE=True` or weak passwords if handling real patient data.

---

## Live Production URLs

- **Frontend (Cloudflare Pages):** https://smartcare-hospital-tyr.pages.dev
- **Backend API (Render Web Service):** https://smartcare-backend-fsb1.onrender.com/api/
- **Health Check Endpoint:** https://smartcare-backend-fsb1.onrender.com/api/health/
- **Interactive Swagger Docs:** https://smartcare-backend-fsb1.onrender.com/api/docs/

---

## Architecture Overview

1. **Frontend:** React + Vite + Tailwind CSS + Chart.js hosted globally on **Cloudflare Pages** (`wrangler.jsonc` / `frontend/dist`, hardened via `frontend/public/_headers`).
2. **Backend:** Django 5.2 LTS + DRF + SimpleJWT + `drf-spectacular` + ReportLab hosted on **Render Web Services** (`render.yaml`).

---

## 1. Backend Deployment (Render.com)

Configured cleanly in [`render.yaml`](./render.yaml):

- **Root Directory:** `backend`
- **Build Command:** `./build.sh` (installs requirements, runs `collectstatic`, runs migrations, seeds synthetic non-admin demo accounts only when `DEMO_MODE=True`, and automatically disables any lingering `admin / admin123` account when `ALLOW_DEMO_ADMIN=False`)
- **Start Command:** `gunicorn smartcare.wsgi:application --bind 0.0.0.0:$PORT`
- **Health Check Path:** `/api/health/`

### Required Render Environment Variables

| Key | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `PYTHON_VERSION` | `3.11.9` | Python runtime on Render |
| `SECRET_KEY` | Auto-generated 50+ char random string | Cryptographic signing (startup aborts if omitted with `DEBUG=False`) |
| `DEBUG` | `False` | Disables stack trace exposure & dev previews |
| `ALLOWED_HOSTS` | `.onrender.com,localhost,127.0.0.1` | Host header allowlist |
| `FRONTEND_URL` | `https://smartcare-hospital-tyr.pages.dev` | Strict CORS allowlisted origin & password reset link base |
| `DEMO_MODE` | `True` (sandbox) / `False` (real env) | Controls whether `build.sh` runs `seed_demo_data` |
| `ALLOW_DEMO_ADMIN` | `False` | Ensures `admin / admin123` is **never** created or active on live deployments |
| `DATABASE_URL` | PostgreSQL connection URI (optional) | Persistent production Postgres storage (recommended beyond free-tier sandbox) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Optional secrets | Enables real SMS/WhatsApp dispatch for `<= 3` queue proximity alerts |

> **Render Free Tier Note:** Render free-tier web services sleep after 15 minutes of inactivity. The initial cold start takes ~45–60 seconds; the frontend monitors slow requests (>3.5s) and informs the user with `ColdStartBanner`.

---

## 2. Frontend Deployment (Cloudflare Pages)

Configured via [`wrangler.jsonc`](./wrangler.jsonc) (`pages_build_output_dir: frontend/dist`):

```bash
cd frontend
npm ci
npm run lint
npm run build
npx wrangler pages deploy dist --project-name smartcare-hospital
```

Production environment flags are checked into [`frontend/.env.production`](./frontend/.env.production):
- `VITE_API_BASE_URL=https://smartcare-backend-fsb1.onrender.com/api`
- `VITE_DEMO_MODE=true`

---

## 3. Sandbox Accounts Reference (Live Demo)

Live demo environments expose **non-admin** roles only:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Patient** | `rahul.kumar` | `Patient@Demo26` |
| **Doctor** | `dr.sharma` | `Doctor@Demo26` |
| **Receptionist** | `reception.desk` | `Reception@Demo26` |
| **Blood Bank Staff** | `bloodbank.staff` | `BloodBank@Demo26` |

To provision real Admin or Staff accounts in a fresh deployment without `ALLOW_DEMO_ADMIN`, run `python manage.py createsuperuser` via Render Shell and provision additional Receptionists, Doctors, or Blood Bank officers from `/admin/manage` -> **Staff Provisioning**.
