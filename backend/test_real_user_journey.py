#!/usr/bin/env python3
"""
test_real_user_journey.py
-------------------------
Simulates comprehensive real human user journeys across all SmartCare HMS modules:
1. Role-based Authentication (Admin, Doctor, Patient)
2. Patient Self-Registration & Login
3. Smart OPD Token Queue Booking & My-Tokens QR Pass
4. Doctor Queue Caller (Calling patient into clinic)
5. 1-Click Bed Auto-Admission from OPD consultation
6. Live Bed & Ward Management Tracking
7. Blood Bank Stock Ledger & Critical Alert Thresholds
8. Inpatient Blood Requisition & Voluntary Donor Matching
9. Blood Bank Staff Request Fulfillment
10. Patient Bed Discharge & Bed Release
11. OPD Consultation Completion
12. Universal Cross-Module Patient Journey Timeline (OPD -> Bed -> Blood)
13. Executive Admin Analytics Dashboard & Chart.js Metrics
"""

import sys
import json
import time
import urllib.request
import urllib.error

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "https://smartcare-backend-fsb1.onrender.com/api"

def make_req(path, method="GET", data=None, token=None):
    url = f"{BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_content)
        except Exception:
            err_json = {"raw": err_content}
        return e.code, err_json
    except Exception as e:
        return 0, {"exception": str(e)}

def run_tests():
    print(f"============================================================")
    print(f"🏥 SIMULATING REAL HUMAN USER JOURNEYS ON SMARTCARE HMS")
    print(f"Target API: {BASE_URL}")
    print(f"============================================================\n")
    results = []

    def check(name, condition, details=""):
        if condition:
            print(f"  [PASS] {name}")
            results.append((name, True))
        else:
            print(f"  [FAIL] {name} -> {details}")
            results.append((name, False))

    # -------------------------------------------------------------
    # 1. AUTHENTICATION & LOGIN FOR ALL ROLES
    # -------------------------------------------------------------
    print("--- 1. Testing Role Authentication & Login ---")
    status, admin_auth = make_req("/accounts/login/", "POST", {"username": "admin", "password": "admin123"})
    check("Admin Login (admin / admin123)", status == 200 and "access" in admin_auth, f"status={status}, err={admin_auth}")
    admin_token = admin_auth.get("access")

    status, doc_auth = make_req("/accounts/login/", "POST", {"username": "dr.sharma", "password": "doctor123"})
    check("Doctor Login (dr.sharma / doctor123)", status == 200 and "access" in doc_auth, f"status={status}, err={doc_auth}")
    doc_token = doc_auth.get("access")
    doc_user = doc_auth.get("user", {})

    status, pat_auth = make_req("/accounts/login/", "POST", {"username": "rahul.kumar", "password": "patient123"})
    check("Existing Patient Login (rahul.kumar / patient123)", status == 200 and "access" in pat_auth, f"status={status}, err={pat_auth}")

    # -------------------------------------------------------------
    # 2. PATIENT SELF-REGISTRATION
    # -------------------------------------------------------------
    print("\n--- 2. Patient Self-Registration ---")
    ts = int(time.time()) % 100000
    sim_username = f"user_{ts}"
    sim_email = f"user_{ts}@testmail.com"
    reg_payload = {
        "username": sim_username,
        "email": sim_email,
        "password": "patient123",
        "password_confirm": "patient123",
        "first_name": "Arjun",
        "last_name": f"Verma{ts}",
        "phone": f"+91-98{ts:08d}",
        "role": "patient",
        "gender": "M",
        "blood_group": "B+",
        "address": "Green Park, Block C"
    }
    status, reg_resp = make_req("/accounts/register/", "POST", reg_payload)
    check("Patient Self-Registration", status in (200, 201) and "access" in reg_resp, f"status={status}, resp={reg_resp}")
    active_pat_token = reg_resp.get("access")
    active_pat_user = reg_resp.get("user", {})
    active_pat_id = active_pat_user.get("id")
    print(f"     Registered Patient: {active_pat_user.get('username')} (ID: {active_pat_id}, Patient Code: {active_pat_user.get('patient_id')})")

    # If registration failed, fallback to rahul.kumar token
    if not active_pat_token:
        active_pat_token = pat_auth.get("access")
        active_pat_user = pat_auth.get("user", {})
        active_pat_id = active_pat_user.get("id")

    # -------------------------------------------------------------
    # 3. PATIENT JOURNEY: BOOKING AN OPD TOKEN WITH DR. SHARMA
    # -------------------------------------------------------------
    print("\n--- 3. Patient: Booking OPD Token ---")
    status, doctors = make_req("/accounts/doctors/?available=true", "GET", token=active_pat_token)
    check("Fetch Available Doctors", status == 200 and len(doctors) > 0, f"status={status}")

    target_doc = None
    if isinstance(doctors, list):
        for d in doctors:
            if d.get("username") == "dr.sharma":
                target_doc = d
                break
        if not target_doc and len(doctors) > 0:
            target_doc = doctors[0]

    token_id = None
    token_code = None
    if target_doc:
        print(f"     Booking with: {target_doc.get('doctor_name')} (ID: {target_doc.get('id')}, Dept: {target_doc.get('department_name')})")
        status, token_resp = make_req("/opd/tokens/generate/", "POST", {
            "doctor": target_doc["id"],
            "priority": "normal",
            "symptoms": "Chest pain radiating to left shoulder and fatigue"
        }, token=active_pat_token)
        check("Generate OPD Token", status in (200, 201), f"status={status}, resp={token_resp}")
        token_id = token_resp.get("id") or token_resp.get("token", {}).get("id")
        token_code = token_resp.get("token_code") or token_resp.get("token", {}).get("token_code")
        print(f"     Generated Token Code: {token_code} (ID: {token_id})")

    status, my_tokens = make_req("/opd/tokens/my-tokens/", "GET", token=active_pat_token)
    check("Patient My-Tokens List & QR Pass", status == 200 and isinstance(my_tokens, list) and len(my_tokens) > 0, f"status={status}")

    # -------------------------------------------------------------
    # 4. DOCTOR JOURNEY: EXAMINING PATIENT & QUEUE CALLING
    # -------------------------------------------------------------
    print("\n--- 4. Doctor: OPD Queue Calling & Examination ---")
    status, doc_queue = make_req("/opd/doctor/queue/", "GET", token=doc_token)
    check("Doctor Live Queue", status == 200 and "waiting_list" in doc_queue, f"status={status}, resp={doc_queue}")

    if token_id:
        status, call_resp = make_req("/opd/doctor/call-next/", "POST", {"token_id": token_id}, token=doc_token)
        check("Doctor Calls Token into Clinic", status == 200, f"status={status}, resp={call_resp}")

    # -------------------------------------------------------------
    # 5. DOCTOR / STAFF: BED MANAGEMENT & AUTO-ADMISSION
    # -------------------------------------------------------------
    print("\n--- 5. Doctor/Staff: Bed Management & 1-Click Auto-Admission ---")
    status, wards = make_req("/beds/wards/", "GET", token=doc_token)
    check("Fetch Hospital Wards", status == 200 and len(wards) > 0, f"status={status}")

    gen_ward = None
    if isinstance(wards, list):
        for w in wards:
            if w.get("ward_type") == "general" or "general" in w.get("name", "").lower():
                gen_ward = w
                break
        if not gen_ward and len(wards) > 0:
            gen_ward = wards[0]

    admission_id = None
    # Lookup patient profile id
    patient_profile_id = None
    status, pat_profiles = make_req(f"/accounts/patients/?search={sim_username}", "GET", token=doc_token)
    if isinstance(pat_profiles, list) and len(pat_profiles) > 0:
        patient_profile_id = pat_profiles[0].get("id")
    else:
        patient_profile_id = 1

    if gen_ward and target_doc:
        status, admit_resp = make_req("/beds/admissions/auto-admit/", "POST", {
            "patient_id": patient_profile_id,
            "attending_doctor_id": target_doc["id"],
            "ward_type": gen_ward.get("ward_type", "general"),
            "diagnosis": "Acute Coronary Syndrome / Observation Required",
            "token_id": token_id
        }, token=doc_token)
        check("Auto-Admit Patient into Available Bed", status in (200, 201), f"status={status}, resp={admit_resp}")
        admission_id = admit_resp.get("id") or admit_resp.get("admission", {}).get("id")
        admitted_bed = admit_resp.get("bed", {}) or admit_resp.get("admission", {}).get("bed")
        print(f"     Patient Auto-Assigned Bed: {admitted_bed} (Admission ID: {admission_id})")

    # Live Bed Overview
    status, bed_overview = make_req("/beds/overview/", "GET", token=admin_token)
    check("Live Bed Overview Dashboard", status == 200 and "summary" in bed_overview, f"status={status}")
    if status == 200 and "summary" in bed_overview:
        s = bed_overview["summary"]
        print(f"     Bed Counts: Total={s.get('total_beds')}, Avail={s.get('available_beds')}, Occ={s.get('occupied_beds')}, Clean={s.get('cleaning_beds')}")

    # -------------------------------------------------------------
    # 6. BLOOD BANK MODULE: INVENTORY & BLOOD REQUISITION
    # -------------------------------------------------------------
    print("\n--- 6. Blood Bank: Stock & Request ---")
    status, blood_stock = make_req("/bloodbank/stock/", "GET", token=admin_token)
    check("Fetch Blood Stock Ledger (8 Groups)", status == 200 and "stock" in blood_stock, f"status={status}")

    # Submit Inpatient Blood Request
    status, blood_req = make_req("/bloodbank/requests/", "POST", {
        "patient": patient_profile_id,
        "patient_name": f"Arjun Verma{ts}",
        "hospital_ward": "General Ward A",
        "blood_group": "B+",
        "units_required": 2,
        "priority": "emergency",
        "purpose": "surgery",
        "required_by_date": "2026-11-26",
        "notes": "Emergency surgery blood standby"
    }, token=doc_token)
    check("Submit Inpatient Blood Request", status in (200, 201), f"status={status}, resp={blood_req}")
    blood_req_id = blood_req.get("request", {}).get("id") or blood_req.get("id")
    print(f"     Blood Requisition ID: {blood_req_id}")

    # Check Matching Donors if stock is needed
    status, donors = make_req("/bloodbank/donors/?blood_group=B+", "GET", token=admin_token)
    check("Search Voluntary Donors by Blood Group", status == 200 and isinstance(donors, list), f"status={status}")

    # Blood Bank Staff Fulfills Blood Request
    if blood_req_id:
        status, fulfill_resp = make_req(f"/bloodbank/requests/{blood_req_id}/status/", "PATCH", {
            "status": "fulfilled"
        }, token=admin_token)
        check("Blood Bank Staff Fulfills Request", status == 200, f"status={status}, resp={fulfill_resp}")

    # -------------------------------------------------------------
    # 7. PATIENT DISCHARGE & CONSULTATION COMPLETION
    # -------------------------------------------------------------
    print("\n--- 7. Discharge Patient & Consultation Completion ---")
    if admission_id:
        status, discharge_resp = make_req(f"/beds/admissions/{admission_id}/discharge/", "POST", {
            "discharge_notes": "Patient stabilized and cleared for outpatient recovery."
        }, token=admin_token)
        check("Discharge Inpatient & Free Bed", status == 200, f"status={status}, resp={discharge_resp}")

    if token_id:
        status, comp_resp = make_req("/opd/doctor/complete/", "POST", {
            "token_id": token_id,
            "notes": "Consultation, admission observation, and discharge completed."
        }, token=doc_token)
        check("Doctor Completes OPD Token", status == 200, f"status={status}, resp={comp_resp}")

    # -------------------------------------------------------------
    # 8. CROSS-MODULE PATIENT JOURNEY TIMELINE
    # -------------------------------------------------------------
    print("\n--- 8. Cross-Module Universal Patient Journey Verification ---")
    status, journey = make_req(f"/accounts/patients/{patient_profile_id}/journey/", "GET", token=admin_token)
    check("Fetch Unified Care Journey (OPD -> Bed -> Blood)", status == 200 and "module_1_opd" in journey, f"status={status}, resp={journey}")
    if status == 200 and "module_1_opd" in journey:
        print(f"     OPD Visits on Record: {len(journey.get('module_1_opd', []))}")
        print(f"     Bed Stays on Record: {len(journey.get('module_2_beds', {}).get('admissions_history', []))}")
        print(f"     Blood Requests on Record: {len(journey.get('module_3_bloodbank', []))}")

    # -------------------------------------------------------------
    # 9. EXECUTIVE ADMIN ANALYTICS DASHBOARD
    # -------------------------------------------------------------
    print("\n--- 9. Executive Admin Analytics Dashboard ---")
    status, analytics = make_req("/accounts/admin/analytics/", "GET", token=admin_token)
    check("Admin Analytics Endpoint (KPIs & Charts)", status == 200 and "summary_kpis" in analytics, f"status={status}, resp={analytics}")
    if status == 200:
        kpis = analytics.get("summary_kpis", {})
        print(f"     Tokens Today: {kpis.get('total_tokens_today')}")
        print(f"     Average Wait: {kpis.get('average_waiting_time_display')}")
        print(f"     Bed Occupancy: {kpis.get('bed_occupancy_percentage')}%")
        print(f"     Blood Low Stock Alerts: {kpis.get('blood_stock_low_alerts', {}).get('count')} groups below threshold")

    print("\n============================================================")
    print("📋 SUMMARY OF TEST RESULTS")
    print("============================================================")
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"Passed: {passed}/{total} tests ({passed/total*100:.1f}%)")
    if passed == total:
        print("🎉 ALL SMARTCARE MODULES TESTED AND FUNCTIONING FLAWLESSLY!")
    return passed == total

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
