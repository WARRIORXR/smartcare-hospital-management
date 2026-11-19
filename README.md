# 🏥 SmartCare – Integrated Hospital Management System

> **BTech Final Year Project** | Developed with React JS + Django REST Framework + MySQL

---

## 📋 Project Overview

SmartCare is a full-stack web application designed to digitize and streamline hospital operations across three core modules:

| Module | Description |
|--------|-------------|
| 🎟️ **OPD Token Queue System** | Patients get tokens, doctors manage queues in real-time |
| 🛏️ **Bed Management** | Track ward/bed availability, admissions & discharges |
| 🩸 **Blood Bank Management** | Manage blood inventory, donors, and requests |

---

## 👥 User Roles

| Role | Access |
|------|--------|
| **Patient** | Register, get OPD token, request blood |
| **Doctor** | View & manage OPD queue, call next patient |
| **Reception** | Register patients, assign tokens, manage beds |
| **Blood Bank Staff** | Manage blood stock, approve/reject requests |
| **Admin** | Full access to all modules and user management |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React JS 18, Tailwind CSS 3, Axios |
| **Backend** | Django 4.x, Django REST Framework |
| **Database** | MySQL 8 |
| **Auth** | JWT (djangorestframework-simplejwt) |

---

## 📁 Project Structure

```
smartcare-hospital-management/
├── backend/                    # Django backend
│   ├── smartcare/              # Main Django project settings
│   ├── apps/
│   │   ├── accounts/           # User auth (JWT login/register)
│   │   ├── opd/                # OPD Token Queue module
│   │   ├── beds/               # Bed Management module
│   │   └── bloodbank/          # Blood Bank module
│   ├── requirements.txt
│   └── manage.py
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Page-level components per role
│   │   ├── services/           # Axios API service files
│   │   └── context/            # Auth context (JWT token store)
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```

---

## 🚀 Setup Instructions

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
# Configure MySQL in smartcare/settings.py
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

---

## 🔐 API Authentication
All protected API endpoints require a **JWT Bearer token** in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## 📌 Development Roadmap

- [x] Step 1 — Project setup, folder structure, GitHub repo
- [ ] Step 2 — Django backend: settings, models, JWT auth
- [ ] Step 3 — OPD Token Queue module (backend)
- [ ] Step 4 — Bed Management module (backend)
- [ ] Step 5 — Blood Bank module (backend)
- [ ] Step 6 — React frontend setup + Auth pages
- [ ] Step 7 — OPD frontend pages
- [ ] Step 8 — Bed Management frontend pages
- [ ] Step 9 — Blood Bank frontend pages
- [ ] Step 10 — Admin dashboard

---

*Made with ❤️ for BTech Final Year Project*
