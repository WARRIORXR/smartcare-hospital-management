# 🏥 SmartCare — Integrated Hospital Management System

[![Live Demo](https://img.shields.io/badge/Demo-Cloudflare%20Pages-orange?style=for-the-badge&logo=cloudflare)](https://smartcare-hospital-tyr.pages.dev)
[![Backend API](https://img.shields.io/badge/API-Render-black?style=for-the-badge&logo=render)](https://smartcare-backend-fsb1.onrender.com/api/)
[![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Django](https://img.shields.io/badge/Django-4.2-092E20?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

> **SmartCare** is an integrated, full-stack Hospital Management System connecting **Outpatient Department (OPD) Consultations**, **Inpatient Bed & Ward Management**, and **Blood Bank Inventory & Donor Logistics** into a unified, cross-module patient journey.

---

## 🌐 Live Production Links

| Resource | Provider | Live URL |
|---|---|---|
| **Frontend Web App** | **Cloudflare Pages** | [https://smartcare-hospital-tyr.pages.dev](https://smartcare-hospital-tyr.pages.dev) |
| **Backend REST API** | **Render** | [https://smartcare-backend-fsb1.onrender.com/api/](https://smartcare-backend-fsb1.onrender.com/api/) |
| **GitHub Repository** | **GitHub** | [https://github.com/WARRIORXR/smartcare-hospital-management](https://github.com/WARRIORXR/smartcare-hospital-management) |

### 🔑 Demo Login Credentials

| Role | Username | Password | Dashboard Features Available |
|---|---|---|---|
| **Hospital Admin / Reception** | `admin` | `admin123` | Analytics dashboard, ward/bed CRUD, all queues, blood stock, user management |
| **Specialist Doctor** | `dr.sharma` | `doctor123` | OPD live queue, call token, 1-click admit to bed, emergency blood requests |
| **Registered Patient** | `rahul.kumar` | `patient123` | Digital token booking, QR pass, live queue tracker, medical care timeline |

---

## 🔄 Unified Patient Journey Architecture

All hospital modules are seamlessly integrated around a single unified **Patient ID**:

```
                  ┌──────────────────────────────────────────────┐
                  │          PATIENT & RECEPTION DESK            │
                  │   - Books OPD Token for Specialist Doctor    │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            MODULE 1: OPD CONSULTATION        │
                  │   - Doctor consults patient from queue       │
                  │   - 1-Click: "Admit Patient" -> Bed Module   │
                  │   - 1-Click: "Request Blood" -> Blood Bank   │
                  └──────────────┬───────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
┌────────────────────────────────┐ ┌────────────────────────────────┐
│   MODULE 2: BED MANAGEMENT     │ │     MODULE 3: BLOOD BANK       │
│ - Auto-assigns available bed   │ │ - Pre-fills inpatient details  │
│ - Quick-Admit from OPD queue   │ │ - Low stock alert (<3 units)   │
│ - Request blood for inpatient  │ │ - Live matching donor calling  │
│ - 1-Click Discharge frees bed  │ │ - Blood fulfilled for ward     │
└────────────────┬───────────────┘ └────────────────┬───────────────┘
                 │                                  │
                 └────────────────┬─────────────────┘
                                  ▼
                 ┌─────────────────────────────────┐
                 │  UNIVERSAL PATIENT JOURNEY MODAL│
                 │   Viewable from Doctor, Bed,    │
                 │    Blood Bank & Patient Portal  │
                 └─────────────────────────────────┘
```

---

## ✨ Core Modules & Feature Breakdown

### 1. 🎟️ Module 1: Smart OPD Token Queue System
* **Dynamic Wait Time Estimation:** Automatically calculates waiting times using `Tokens Ahead × Doctor Consultation Duration`.
* **Digital Scannable QR Pass:** Generates printable QR passes (`MED-001`, `CAR-002`) scannable at reception.
* **Specialist Doctor Portal:** Real-time queue caller with `Call Next`, `In-Progress`, `Completed`, and `Skipped` actions.
* **Priority Routing:** Dedicated queue priority flags for Emergency, Senior Citizens, and Normal appointments.

### 2. 🛏️ Module 2: Live Bed & Ward Management
* **Real-Time Color Coded Availability:**
  * 🟢 **Green (Emerald):** Available
  * 🔴 **Red (Rose):** Occupied
  * 🟡 **Yellow (Amber):** Cleaning / Sanitizing
* **Ward Categories:** General Wards, Intensive Care Unit (ICU), Private Deluxe Suites, Emergency Casualty.
* **Intelligent Auto-Assignment:** Automatically finds and locks the first available bed matching the patient's required ward category.
* **1-Click Discharge:** Instant bed release that marks the bed as cleaning/available and timestamps the patient's care timeline.

### 3. 🩸 Module 3: Blood Bank Inventory & Donor Logistics
* **Live Blood Stock Ledger:** Tracks 8 blood groups (A+, A-, B+, B-, O+, O-, AB+, AB-) with unit expiry monitoring.
* **Critical Stock Alert:** Triggers automatic visual warning badges when any blood group stock drops below **3 units**.
* **Inpatient Blood Requisition:** Pre-fills patient name, blood group, ward, and bed directly from the inpatient registry.
* **Automated Donor Matching:** Surfaces verified eligible voluntary donors with 1-click telephone calling if stock is insufficient.

### 4. 📜 Cross-Module Universal Patient Journey
* Accessible from Doctor Dashboard, Bed Management, Blood Bank, and Patient Pass.
* Chronological visual timeline tracing the patient's entire hospital visit:
  `OPD Consultation` $\rightarrow$ `Bed Admission & Stay Duration` $\rightarrow$ `Blood Transfusion Requests`.

### 5. 📊 Module 4: Executive Analytics Dashboard (Chart.js)
* **Real-Time KPI Cards:** Total Tokens Today, Average Wait Time (mins), Bed Occupancy Rate (%), and Low Blood Alerts.
* **Chart 1:** OPD Tokens by Department (Bar Chart).
* **Chart 2:** Bed Occupancy Distribution by Ward Type (Doughnut Chart).
* **Chart 3:** Real-Time Blood Bank Inventory by Group (Color-coded Bar Chart).

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
|---|---|
| **Frontend UI** | React 18, Vite 5, Tailwind CSS 3, Chart.js, React-Chartjs-2, Lucide Icons, QRCode.react |
| **Backend API** | Django 4.2 LTS, Django REST Framework (DRF), Gunicorn, WhiteNoise |
| **Authentication** | JWT (`djangorestframework-simplejwt`) with Bearer token header injection |
| **Databases** | SQLite (development/demo) / PostgreSQL (production on Render) / MySQL 8 compatible |
| **Cloud Hosting** | Cloudflare Workers / Pages (Frontend SPA), Render.com (Backend API + Database) |

---

## 📁 Repository Structure

```
smartcare-hospital-management/
├── backend/
│   ├── apps/
│   │   ├── accounts/           # User authentication, custom User roles, Doctors, Patients
│   │   ├── opd/                # Token generation, queue state, doctor consultations
│   │   ├── beds/               # Wards, Beds, automated admissions, discharges
│   │   └── bloodbank/          # Blood inventory, batches, donor directory, blood requests
│   ├── smartcare/              # Django settings, WSGI, URLs, JWT & CORS configuration
│   ├── build.sh                # Automated build and seeding script for Render
│   ├── requirements.txt        # Production Python dependencies
│   └── seed_demo_data.py       # Comprehensive demo seeder (Doctors, Beds, Stock, Donors)
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable Navbars, Modals, Journey Timeline, Charts
│   │   ├── pages/              # Dashboards for Admin, Doctor, Receptionist, Patient
│   │   ├── services/           # Axios REST services (opdService, bedService, bloodBankService)
│   │   └── context/            # AuthContext managing JWT tokens and session expiration
│   ├── public/                 # Static assets, SVG icons, favicon
│   ├── vite.config.js          # Vite config with proxy settings
│   └── tailwind.config.js      # Custom theme colors and responsive breakpoints
├── DEPLOYMENT.md               # Step-by-step production deployment manual
├── render.yaml                 # Render Infrastructure-as-Code Blueprint
├── wrangler.jsonc              # Cloudflare SPA deployment configuration
└── README.md
```

---

## 💻 Local Development Setup

### 1. Prerequisites
* Python 3.10+ installed
* Node.js v18+ & npm installed
* Git

### 2. Backend Setup
```bash
# Clone the repository
git clone https://github.com/WARRIORXR/smartcare-hospital-management.git
cd smartcare-hospital-management/backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # On Windows
# source venv/bin/activate     # On macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run migrations and seed sample hospital data
python manage.py migrate
python manage.py seed_demo_data

# Start Django development server
python manage.py runserver 127.0.0.1:8000
```
Backend will be available at: **`http://127.0.0.1:8000/api/`**

### 3. Frontend Setup
```bash
# In a new terminal window
cd smartcare-hospital-management/frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
Frontend will be available at: **`http://localhost:5173/`**

### 4. Running the Real-User E2E Simulation (20 Tests)
You can simulate all human user journeys across all 5 roles (Admin, Doctor, Patient, Reception, Blood Bank Staff) across every module:
```bash
cd smartcare-hospital-management/backend

# Run simulation against local backend
python test_real_user_journey.py http://127.0.0.1:8000/api

# OR run simulation against live production backend
python test_real_user_journey.py https://smartcare-backend-fsb1.onrender.com/api
```
All 20 user actions (Registration, Token Booking, Queue Calling, Auto-Admission, Bed Tracking, Blood Requests, Donor Calling, Discharge, Cross-Module Journey, Analytics) are verified with a 100% pass guarantee.

---

## 📡 REST API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/accounts/login/` | User login & obtain JWT access + refresh tokens | No |
| `POST` | `/api/accounts/register/` | Patient self-registration | No |
| `GET` | `/api/accounts/patients/` | Search registered patients | Yes |
| `GET` | `/api/opd/tokens/` | List and filter active queue tokens | Yes |
| `POST` | `/api/opd/tokens/generate/` | Book next sequential OPD token | Yes |
| `POST` | `/api/opd/tokens/{id}/call/` | Doctor calls token into examination room | Yes (Doctor) |
| `GET` | `/api/beds/overview/` | Live bed availability and occupancy statistics | Yes |
| `POST` | `/api/beds/admissions/auto-admit/` | Auto-assign first available bed in ward | Yes (Staff) |
| `POST` | `/api/beds/admissions/{id}/discharge/` | Discharge patient and free bed | Yes (Staff) |
| `GET` | `/api/bloodbank/stock/` | Live blood inventory with low-stock flags | Yes |
| `POST` | `/api/bloodbank/requests/` | Submit blood request (surfaces donors if low) | Yes |
| `GET` | `/api/bloodbank/donors/` | List voluntary eligible donors | Yes |
| `GET` | `/api/accounts/patients/{id}/journey/` | Complete 3-module care timeline for patient | Yes |

---

## 👥 Role-Based Access Matrix

| Feature | Patient | Doctor | Receptionist | Blood Bank Staff | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| **Book OPD Token** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Manage Doctor Queue** | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Admit to Ward / Bed** | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Discharge Patient** | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Request Blood Units** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Update Blood Stock** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **View Medical Journey** | ✅ (Self) | ✅ | ✅ | ✅ | ✅ |
| **Admin Analytics Dashboard** | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 📌 Implementation Milestones

- [x] **Step 1:** Architecture & project structure setup
- [x] **Step 2:** User authentication & JWT security
- [x] **Step 3:** Patient registration & profile management
- [x] **Step 4:** Specialist doctors & clinic directory
- [x] **Step 5:** OPD Token Queue generation & sequential numbering
- [x] **Step 6:** Live queue tracker with dynamic wait-time formula
- [x] **Step 7:** Doctor examination portal & queue caller
- [x] **Step 8:** Patient Digital Pass Slip & QR Code generator
- [x] **Step 9:** Ward & Bed inventory module with live color coding
- [x] **Step 10:** Automated patient bed admission & 1-click discharge
- [x] **Step 11:** Blood bank stock inventory with $< 3$ units alerts
- [x] **Step 12:** Voluntary donor directory & emergency blood requests
- [x] **Step 13:** Cross-module patient care journey (OPD $\rightarrow$ Bed $\rightarrow$ Blood)
- [x] **Step 14:** Executive Analytics Dashboard with Chart.js visualizations
- [x] **Step 15:** Production deployment on Cloudflare (Frontend) & Render (Backend)

---

## 📄 License
This project is open source and available under the [MIT License](LICENSE).
