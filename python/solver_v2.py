"""Cloudflare Turnstile solver via CapSolver.

Usage (kept backward compatible with main.py):
    arr = []
    solve_captcha(arr)   # appends solved token to arr, or no-op on failure
    token = arr[0] if arr else None
"""

import time
from typing import List, Optional

import requests

from config import (
    CAPSOLVER_API_KEY,
    CAPSOLVER_POLL_INTERVAL_S,
    CAPSOLVER_TIMEOUT_S,
    TURNSTILE_SITE_KEY,
    TURNSTILE_SITE_URL,
)

CAPSOLVER_BASE = "https://api.capsolver.com"
CREATE_TASK_URL = f"{CAPSOLVER_BASE}/createTask"
GET_RESULT_URL = f"{CAPSOLVER_BASE}/getTaskResult"

REQUEST_TIMEOUT_S = 15
MAX_CREATE_RETRIES = 3

_session = requests.Session()


def _create_task() -> Optional[str]:
    payload = {
        "clientKey": CAPSOLVER_API_KEY,
        "task": {
            "type": "AntiTurnstileTaskProxyLess",
            "websiteKey": TURNSTILE_SITE_KEY,
            "websiteURL": TURNSTILE_SITE_URL,
        },
    }
    for attempt in range(1, MAX_CREATE_RETRIES + 1):
        try:
            resp = _session.post(
                CREATE_TASK_URL, json=payload, timeout=REQUEST_TIMEOUT_S
            )
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            print(f"[SOLVER] createTask attempt {attempt} failed: {e}")
            continue

        if data.get("errorId"):
            print(
                f"[SOLVER] createTask attempt {attempt} rejected: "
                f"{data.get('errorCode')} — {data.get('errorDescription')}"
            )
            continue

        task_id = data.get("taskId")
        if task_id:
            return task_id
        print(f"[SOLVER] createTask attempt {attempt} returned no taskId: {data}")

    return None


def _poll_for_token(task_id: str) -> Optional[str]:
    deadline = time.monotonic() + CAPSOLVER_TIMEOUT_S
    payload = {"clientKey": CAPSOLVER_API_KEY, "taskId": task_id}

    while time.monotonic() < deadline:
        try:
            resp = _session.post(
                GET_RESULT_URL, json=payload, timeout=REQUEST_TIMEOUT_S
            )
            data = resp.json()
        except (requests.RequestException, ValueError) as e:
            print(f"[SOLVER] getTaskResult transient error: {e}")
            time.sleep(CAPSOLVER_POLL_INTERVAL_S)
            continue

        status = data.get("status")
        if status == "ready":
            return (data.get("solution") or {}).get("token")
        if status == "failed" or data.get("errorId"):
            print(
                f"[SOLVER] task {task_id} failed: "
                f"{data.get('errorCode')} — {data.get('errorDescription')}"
            )
            return None

        time.sleep(CAPSOLVER_POLL_INTERVAL_S)

    print(f"[SOLVER] task {task_id} timed out after {CAPSOLVER_TIMEOUT_S}s")
    return None


def solve_turnstile() -> Optional[str]:
    if not CAPSOLVER_API_KEY or not TURNSTILE_SITE_KEY:
        print("[SOLVER] CAPSOLVER_API_KEY / TURNSTILE_SITE_KEY not configured")
        return None

    task_id = _create_task()
    if not task_id:
        print("[SOLVER] Could not create task; giving up.")
        return None
    return _poll_for_token(task_id)


def solve_captcha(arr_codes: List[str]) -> Optional[str]:
    """Backward-compatible wrapper: appends token to arr_codes on success."""
    token = solve_turnstile()
    if token:
        arr_codes.append(token)
    return token
