#!/usr/bin/env python3
"""
test_real_user_journey.py
-------------------------
Local development HTTP smoke script simulating user journeys against a LOCAL backend.
Refuses to run against live/remote production databases unless `--unsafe-allow-remote`
is explicitly provided. For automated CI testing, run: `python manage.py test`.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "http://127.0.0.1:8000/api"


def make_req(base_url, path, method="GET", data=None, token=None):
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "SmartCare-Local-Smoke/2.0",
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


def run_tests(base_url=DEFAULT_BASE_URL, allow_remote=False):
    parsed = urllib.parse.urlparse(base_url)
    if not allow_remote and parsed.hostname not in ("127.0.0.1", "localhost"):
        print("=" * 64)
        print("ABORTED: Refusing to run write-heavy E2E script against remote URL!")
        print(f"  Target URL: {base_url}")
        print("  Running this script against production inserts junk tokens/admissions.")
        print("  Use `python manage.py test` (isolated test DB) or target localhost.")
        print("=" * 64)
        return False

    print("=" * 60)
    print("SMARTCARE LOCAL SANDBOX SMOKE SIMULATION")
    print(f"Target API: {base_url}")
    print("=" * 60)
    results = []

    def check(name, condition, details=""):
        if condition:
            print(f"  [PASS] {name}")
            results.append((name, True))
        else:
            print(f"  [FAIL] {name} -> {details}")
            results.append((name, False))

    status, doc_auth = make_req(base_url, "/accounts/login/", "POST", {"username": "dr.sharma", "password": "Doctor@Demo26"})
    check("Doctor Login (dr.sharma)", status == 200 and "access" in doc_auth, f"status={status}, err={doc_auth}")

    status, rec_auth = make_req(base_url, "/accounts/login/", "POST", {"username": "reception.desk", "password": "Reception@Demo26"})
    check("Receptionist Login (reception.desk)", status == 200 and "access" in rec_auth, f"status={status}, err={rec_auth}")

    status, bb_auth = make_req(base_url, "/accounts/login/", "POST", {"username": "bloodbank.staff", "password": "BloodBank@Demo26"})
    check("Blood Bank Staff Login (bloodbank.staff)", status == 200 and "access" in bb_auth, f"status={status}, err={bb_auth}")

    ts = int(time.time()) % 100000
    reg_payload = {
        "username": f"user_{ts}",
        "email": f"user_{ts}@example.com",
        "password": f"StrongPass@{ts}",
        "password_confirm": f"StrongPass@{ts}",
        "first_name": "Arjun",
        "last_name": f"Verma{ts}",
        "phone": f"+91-98{ts:08d}",
        "gender": "M",
        "blood_group": "B+",
    }
    status, reg_resp = make_req(base_url, "/accounts/register/", "POST", reg_payload)
    check("Patient Self-Registration (Strong Password)", status in (200, 201) and "access" in reg_resp, f"status={status}, resp={reg_resp}")
    pat_token = reg_resp.get("access")

    status, idor_leak = make_req(base_url, "/accounts/patients/1/journey/", "GET", token=pat_token)
    check("Anti-IDOR: Patient Blocked From Other Journey (403)", status == 403, f"status={status}, resp={idor_leak}")

    status, donor_leak = make_req(base_url, "/bloodbank/donors/", "GET", token=pat_token)
    check("Anti-IDOR: Patient Blocked From Donors Directory (403)", status == 403, f"status={status}, resp={donor_leak}")

    passed = sum(1 for _, ok in results if ok)
    print(f"\nPassed: {passed}/{len(results)} local checks")
    return passed == len(results)


if __name__ == "__main__":
    allow_remote_flag = "--unsafe-allow-remote" in sys.argv
    target_url = DEFAULT_BASE_URL
    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            target_url = arg
            break
    sys.exit(0 if run_tests(target_url, allow_remote=allow_remote_flag) else 1)
