# 🚀 SmartCare Hospital Management System — Deployment Guide

This guide walks you through deploying the **Django Backend on Render.com** and the **React Frontend on Cloudflare Pages** (both on 100% free tiers).

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              CLOUDFLARE PAGES                │
                      │       React + Vite Frontend (SPA)            │
                      │  URL: https://smartcare-hospital-tyr.pages.dev│
                      └──────────────────────┬───────────────────────┘
                                             │  HTTPS API Calls
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │                 RENDER.COM                   │
                      │       Django 4.2 REST API + Gunicorn         │
                      │URL: https://smartcare-backend-fsb1.onrender.com│
                      └──────────────────────┬───────────────────────┘
                                             │  Database
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │              DATABASE LAYER                  │
                      │  SQLite / Managed Render PostgreSQL (Free)   │
                      └──────────────────────────────────────────────┘
```

---

## 🌐 Live Deployed Application

* **Frontend Web App (Cloudflare):** [https://smartcare-hospital-tyr.pages.dev](https://smartcare-hospital-tyr.pages.dev)
* **Backend REST API (Render):** [https://smartcare-backend-fsb1.onrender.com/api/](https://smartcare-backend-fsb1.onrender.com/api/)
* **GitHub Repository:** [https://github.com/WARRIORXR/smartcare-hospital-management](https://github.com/WARRIORXR/smartcare-hospital-management)

---

## Part 1: Deploy Backend on Render.com

Render supports Python/Django natively and provisions a free PostgreSQL database.

### Step 1: Sign Up / Log In
1. Go to [https://render.com/](https://render.com/) and sign up or log in using your GitHub account (`WARRIORXR`).

### Step 2: Deploy using Blueprint (One-Click)
The repository contains a pre-configured [`render.yaml`](./render.yaml).

1. In Render Dashboard, click **New +** (top right) $\rightarrow$ **Blueprint**.
2. Select your repository: `WARRIORXR/smartcare-hospital-management`.
3. Render will read `render.yaml` and show:
   - **Service 1:** `smartcare-backend` (Python Web Service)
   - **Service 2:** `smartcare-db` (PostgreSQL Database)
4. Click **Apply**.
5. Render will automatically:
   - Provision the PostgreSQL database
   - Run `build.sh` (installs deps, collects static files, runs migrations, seeds 5 doctors, 20 beds, blood stock, 10 donors)
   - Start the Gunicorn web server

### Step 3: Copy Your Backend URL
Once deployed (status shows **Live**), copy your Render backend URL:
`https://smartcare-backend-xxxx.onrender.com`

---

## Part 2: Deploy Frontend on Cloudflare Pages

Cloudflare Pages provides global ultra-fast static hosting with automated continuous deployment from GitHub.

### Step 1: Sign Up / Log In
1. Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/) and log in.
2. In the left navigation, click **Workers & Pages** $\rightarrow$ **Overview**.
3. Click **Create Application** $\rightarrow$ Select the **Pages** tab $\rightarrow$ Click **Connect to Git**.

### Step 2: Select Repository
1. Connect your GitHub account and select `WARRIORXR/smartcare-hospital-management`.
2. Click **Begin setup**.

### Step 3: Configure Build Settings
Fill in the build configuration:

| Setting | Value |
|---|---|
| **Project name** | `smartcare-hospital` (or your choice) |
| **Production branch** | `main` |
| **Framework preset** | `Vite` |
| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |

### Step 4: Add Environment Variable
Expand **Environment variables (advanced)** and click **Add variable**:

| Variable Name | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://your-backend-name.onrender.com/api` (the Render URL from Part 1 with `/api`) |

### Step 5: Deploy
Click **Save and Deploy**.
Cloudflare will clone, build, and publish your frontend within 1-2 minutes.
Your site will be live at:
`https://smartcare-hospital.pages.dev`

---

## Part 3: Verify the Connection

1. Open your Cloudflare Pages URL in your browser.
2. Log in with the pre-seeded credentials:
   - **Admin / Receptionist:** `admin` / `admin123`
   - **Doctor:** `dr.sharma` / `doctor123`
   - **Patient:** `rahul.kumar` / `patient123`
3. Test the workflows:
   - OPD Token Booking & Calling
   - Bed Assignment & Discharge
   - Blood Bank Stock & Inpatient Requests
   - Unified Medical Journey Modal
