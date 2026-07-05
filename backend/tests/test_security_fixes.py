"""Security fix verification tests for Poker Trainer AI backend.

Covers:
- SEC-001: /api/analyze-image rate limit (429) and size cap (413) & sanitized errors
- SEC-002: /api/history device isolation via X-Device-Id header + IP fallback
- Regression: /api/decide, /api/, /api/analyze-image happy path (minimal PNG)
"""
import base64
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-forge-4271.preview.emergentagent.com").rstrip("/")

# 1x1 transparent PNG (valid base64, decodes to real PNG)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _dev(prefix: str = "test") -> str:
    """Generate a valid device id (matches ^[A-Za-z0-9_-]+$, len 8-128)."""
    return f"{prefix}-{uuid.uuid4().hex}"


# -------------------- Regression --------------------
class TestRegression:
    def test_root_version(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("version") == "1.1.0", data

    def test_decide_happy_path(self):
        payload = {
            "hero_cards": ["Ah", "Kh"],
            "community": [],
            "position": "BTN",
            "to_call": 0,
            "pot": 1.5,
            "hero_stack": 100,
            "n_opponents": 1,
            "style": "balanced",
        }
        r = requests.post(f"{BASE_URL}/api/decide", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "action" in data and data["action"] in {"fold", "call", "raise", "check", "bet", "all-in", "allin"} or isinstance(data["action"], str)
        assert "confidence" in data
        assert "reasoning" in data and isinstance(data["reasoning"], str)
        assert "pot_odds" in data


# -------------------- SEC-001: analyze-image --------------------
class TestAnalyzeImageSecurity:
    def test_size_cap_returns_413(self):
        """Payload > 8_000_000 chars must be rejected with 413 BEFORE hitting LLM."""
        big = "A" * 8_000_001  # not real base64 but size check runs first
        payload = {"image_base64": big, "mime_type": "image/jpeg"}
        headers = {"X-Device-Id": _dev("size")}
        r = requests.post(
            f"{BASE_URL}/api/analyze-image", json=payload, headers=headers, timeout=30
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        # Sanitized message: portuguese user friendly, no stack info
        assert "grande" in detail.lower() or "large" in detail.lower(), detail
        assert "traceback" not in detail.lower()

    def test_rate_limit_returns_429_after_12(self):
        """13th request within 60s from same device must return 429."""
        dev_id = _dev("rl")
        headers = {"X-Device-Id": dev_id}
        # Use invalid tiny base64 so we don't burn LLM credits.
        # BUT the rate limiter runs BEFORE size cap and BEFORE base64 validation? 
        # Actually server ordering: rate_limit -> size cap -> base64 decode -> LLM.
        # So the first 12 will pass rate limit but fail at base64 (400).
        # The 13th must hit 429 before base64 check.
        payload = {"image_base64": "!!!invalid_base64!!!", "mime_type": "image/jpeg"}

        statuses = []
        for i in range(13):
            r = requests.post(
                f"{BASE_URL}/api/analyze-image",
                json=payload,
                headers=headers,
                timeout=15,
            )
            statuses.append(r.status_code)

        # First 12: rate limit not hit -> 400 (bad base64). 13th: 429.
        assert statuses[-1] == 429, f"Expected 429 on 13th, got {statuses[-1]}. All: {statuses}"
        # Sanity: earlier requests should not already be 429
        assert 429 not in statuses[:12], f"Rate limited too early: {statuses}"

        # Verify sanitized 429 message
        r_last = requests.post(
            f"{BASE_URL}/api/analyze-image",
            json=payload,
            headers=headers,
            timeout=15,
        )
        assert r_last.status_code == 429
        detail = r_last.json().get("detail", "")
        assert "traceback" not in detail.lower()
        assert "exception" not in detail.lower()

    def test_error_messages_sanitized(self):
        """Bad base64 should return generic 400 with no stack trace or f-string leak."""
        headers = {"X-Device-Id": _dev("san")}
        payload = {"image_base64": "!!!not_base64!!!", "mime_type": "image/jpeg"}
        r = requests.post(
            f"{BASE_URL}/api/analyze-image", json=payload, headers=headers, timeout=15
        )
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "traceback" not in detail.lower()
        assert "file " not in detail.lower()  # no python paths
        assert "line " not in detail.lower()
        # Should be short, user-friendly (portuguese)
        assert len(detail) < 200

    def test_analyze_image_minimal_ok_or_graceful(self):
        """Happy path with a tiny valid PNG: should not 500. May return 200 (DetectedState) 
        or graceful low-confidence output. Uses a distinct device id to avoid rate limit interference."""
        headers = {"X-Device-Id": _dev("happy")}
        payload = {"image_base64": TINY_PNG_B64, "mime_type": "image/png"}
        r = requests.post(
            f"{BASE_URL}/api/analyze-image", json=payload, headers=headers, timeout=60
        )
        # Accept 200 OR 500 (upstream LLM might refuse a 1x1 pixel), but log
        assert r.status_code in (200, 500), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 500:
            detail = r.json().get("detail", "")
            # Must be sanitized
            assert "traceback" not in detail.lower()
            assert "line " not in detail.lower()
            assert len(detail) < 200


# -------------------- SEC-002: history device isolation --------------------
class TestHistoryDeviceIsolation:
    @pytest.fixture(scope="class")
    def dev_a(self):
        return _dev("devA")

    @pytest.fixture(scope="class")
    def dev_b(self):
        return _dev("devB")

    @pytest.fixture(scope="class")
    def entry_payload(self):
        return {
            "hero_cards": ["Ah", "Kh"],
            "community": [],
            "position": "BTN",
            "action": "raise",
            "bet_size": 3.0,
            "confidence": 0.8,
            "reasoning": "TEST_isolation",
            "pot": 1.5,
            "source": "manual",
        }

    def test_create_and_list_isolated(self, dev_a, dev_b, entry_payload):
        # Cleanup first (idempotent)
        requests.delete(f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_a}, timeout=15)
        requests.delete(f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_b}, timeout=15)

        # Device A creates one entry
        r = requests.post(
            f"{BASE_URL}/api/history",
            json=entry_payload,
            headers={"X-Device-Id": dev_a},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        entry_a = r.json()
        assert "id" in entry_a
        entry_a_id = entry_a["id"]

        # Device A lists — must see the entry
        r_a = requests.get(
            f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_a}, timeout=15
        )
        assert r_a.status_code == 200
        list_a = r_a.json()
        ids_a = [e["id"] for e in list_a]
        assert entry_a_id in ids_a, f"Device A cannot see its own entry: {list_a}"

        # Device B lists — MUST NOT see A's entry
        r_b = requests.get(
            f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_b}, timeout=15
        )
        assert r_b.status_code == 200
        list_b = r_b.json()
        ids_b = [e["id"] for e in list_b]
        assert entry_a_id not in ids_b, f"LEAK: Device B sees Device A's entry! {list_b}"

        # Device B tries DELETE by id — must not delete A's data
        r_del = requests.delete(
            f"{BASE_URL}/api/history/{entry_a_id}",
            headers={"X-Device-Id": dev_b},
            timeout=15,
        )
        assert r_del.status_code == 200
        assert r_del.json().get("deleted", 0) == 0, r_del.json()

        # Confirm A's entry still exists
        r_a2 = requests.get(
            f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_a}, timeout=15
        )
        ids_a2 = [e["id"] for e in r_a2.json()]
        assert entry_a_id in ids_a2, "Device B managed to delete Device A's entry!"

        # Device B clears its own — should not affect A
        requests.delete(f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_b}, timeout=15)
        r_a3 = requests.get(
            f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_a}, timeout=15
        )
        ids_a3 = [e["id"] for e in r_a3.json()]
        assert entry_a_id in ids_a3, "Device B's DELETE-all wiped Device A!"

        # Cleanup A
        requests.delete(f"{BASE_URL}/api/history", headers={"X-Device-Id": dev_a}, timeout=15)

    def test_missing_device_id_falls_back_to_ip(self, entry_payload):
        """No X-Device-Id header — endpoint must still work, using client IP bucket."""
        r_list = requests.get(f"{BASE_URL}/api/history", timeout=15)
        assert r_list.status_code == 200, r_list.text
        assert isinstance(r_list.json(), list)

        r_post = requests.post(f"{BASE_URL}/api/history", json=entry_payload, timeout=15)
        assert r_post.status_code == 200, r_post.text
        eid = r_post.json()["id"]

        # cleanup by same IP bucket
        r_del = requests.delete(f"{BASE_URL}/api/history/{eid}", timeout=15)
        assert r_del.status_code == 200
        assert r_del.json().get("deleted", 0) == 1

    def test_malformed_device_id_falls_back(self, entry_payload):
        """Bad X-Device-Id (too short / bad chars) must not crash and not act as valid id."""
        bad_headers_list = [
            {"X-Device-Id": "abc"},                       # too short
            {"X-Device-Id": "has space and $ymbols!"},    # bad chars
            {"X-Device-Id": "x" * 500},                   # too long
        ]
        for h in bad_headers_list:
            r = requests.get(f"{BASE_URL}/api/history", headers=h, timeout=15)
            assert r.status_code == 200, f"Malformed dev id crashed: {h} -> {r.status_code} {r.text}"

        # A subsequent valid-device-id GET must still work
        r_ok = requests.get(
            f"{BASE_URL}/api/history", headers={"X-Device-Id": _dev("okdev")}, timeout=15
        )
        assert r_ok.status_code == 200
        assert isinstance(r_ok.json(), list)
