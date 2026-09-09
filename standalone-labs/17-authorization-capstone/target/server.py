"""Layered authorization capstone target using only synthetic local evidence."""
import base64
import hashlib
import hmac
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

KEY = secrets.token_bytes(32)
CASES = {}
EXPECTED_CORRELATION = {
    "actor": "analyst-17",
    "session_id": "sid-17",
    "jwt_jti": "jwt-17",
    "bola_object": "acct-9002",
    "role": "analyst",
    "csrf_request": "req-403",
    "replay_request": "req-402",
    "excluded_decoy": "noise-900",
}
EXPECTED_RESULTS = {
    "jwt": "jwt-invalid",
    "owner_access": "accepted",
    "bola": "object-owner-mismatch",
    "role": "role-denied",
    "csrf": "csrf-invalid",
    "cookie_binding": "session-binding-mismatch",
    "replay": "replay-detected",
}
CONTROLS = {
    "verify_jwt": True,
    "bind_cookie_session": True,
    "enforce_csrf": True,
    "authorize_object_owner": True,
    "enforce_role_server_side": True,
    "reject_duplicate_request_id": True,
}
SOURCES = {
    "gateway.log": [
        {"request_id":"req-400","path":"/accounts/acct-1001","status":200,"session_id":"sid-17"},
        {"request_id":"req-401","path":"/accounts/acct-9002","status":200,"session_id":"sid-17"},
        {"request_id":"req-402","path":"/transfers","status":200,"session_id":"sid-17","duplicate_of":"req-401"},
        {"request_id":"req-403","path":"/profile","status":403,"session_id":"sid-17","csrf":"missing"},
    ],
    "auth-audit.json": [
        {"event":"jwt-accepted","actor":"analyst-17","role":"analyst","jti":"jwt-17","session_id":"sid-17","request_id":"req-401"},
        {"event":"jwt-replayed","actor":"analyst-17","jti":"jwt-17","session_id":"sid-17","request_id":"req-402"},
    ],
    "app-audit.json": [
        {"request_id":"req-401","actor":"analyst-17","owner_object":"acct-1001","requested_object":"acct-9002","decision":"legacy-owner-check-missing"},
        {"request_id":"req-404","actor":"analyst-17","presented_role":"analyst","operation":"admin-export","decision":"denied"},
    ],
    "browser-trace.json": [
        {"request_id":"req-400","session_cookie":"sid-17","csrf":"csrf-17","origin":"http://training.local"},
        {"request_id":"req-403","session_cookie":"sid-17","csrf":None,"origin":"http://training.local"},
    ],
    "scanner-decoy.log": [
        {"request_id":"noise-900","actor":"health-scanner","session_id":"sid-noise","path":"/robots.txt","status":404,"note":"unrelated scheduled probe"}
    ],
}


def b64(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def unb64(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_token():
    header = b64(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({"sub":"analyst-17","role":"analyst","jti":"jwt-17","sid":"sid-17","exp":1700003600}, separators=(",", ":")).encode())
    signature = b64(hmac.digest(KEY, f"{header}.{payload}".encode(), hashlib.sha256))
    return f"{header}.{payload}.{signature}"


def verify_token(raw):
    try:
        header, payload, signature = raw.split(".")
        metadata = json.loads(unb64(header))
        claims = json.loads(unb64(payload))
        expected = hmac.digest(KEY, f"{header}.{payload}".encode(), hashlib.sha256)
        if metadata.get("alg") != "HS256" or not hmac.compare_digest(unb64(signature), expected):
            return None
        required = {"sub":"analyst-17","role":"analyst","jti":"jwt-17","sid":"sid-17"}
        return claims if all(claims.get(key) == value for key, value in required.items()) else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def new_case():
    return {
        "access_token": make_token(),
        "session_cookie": "sid-17",
        "decoy_cookie": "sid-noise",
        "csrf_token": "csrf-17",
        "correlation_token": None,
        "request_ids": set(),
    }


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 65536:
                return None
            value = json.loads(self.rfile.read(length) or b"{}")
            return value if isinstance(value, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def authenticate(self, case, require_csrf=False):
        authorization = self.headers.get("Authorization", "")
        raw = authorization[7:] if authorization.startswith("Bearer ") else ""
        claims = verify_token(raw)
        if not claims or raw != case["access_token"]:
            return 401, "jwt-invalid", None
        cookies = {}
        for part in self.headers.get("Cookie", "").split(";"):
            if "=" in part:
                key, value = part.strip().split("=", 1)
                cookies[key] = value
        if cookies.get("session") != claims["sid"] or cookies.get("session") != case["session_cookie"]:
            return 401, "session-binding-mismatch", None
        if require_csrf and self.headers.get("X-CSRF-Token") != case["csrf_token"]:
            return 403, "csrf-invalid", None
        return 200, "accepted", claims

    def find_case_from_query(self, parsed):
        return CASES.get(parse_qs(parsed.query).get("case_id", [""])[0])

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self.reply(200, {"service":"authorization-capstone","state":"ready"})
        if parsed.path.startswith("/evidence/"):
            case = self.find_case_from_query(parsed)
            name = parsed.path.removeprefix("/evidence/")
            if not case or name not in SOURCES:
                return self.reply(404, {"reason":"evidence-not-found"})
            return self.reply(200, {"source":name,"events":SOURCES[name]})
        if parsed.path.startswith("/hardened/accounts/"):
            account = parsed.path.removeprefix("/hardened/accounts/")
            case = next((value for value in CASES.values() if value["access_token"] == self.headers.get("Authorization", "")[7:]), None)
            if not case:
                return self.reply(401, {"reason":"jwt-invalid"})
            status, reason, _claims = self.authenticate(case)
            if status != 200:
                return self.reply(status, {"reason":reason})
            if account != "acct-1001":
                return self.reply(403, {"reason":"object-owner-mismatch"})
            return self.reply(200, {"reason":"accepted","account":"acct-1001"})
        return self.reply(404, {"reason":"not-found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason":"invalid-json"})
        if parsed.path == "/case":
            case_id = "case." + secrets.token_urlsafe(18)
            case = new_case()
            CASES[case_id] = case
            return self.reply(201, {"case_id":case_id,"evidence_sources":list(SOURCES),"credentials":{"access_token":case["access_token"],"session_cookie":case["session_cookie"],"decoy_cookie":case["decoy_cookie"],"csrf_token":case["csrf_token"]}})
        if parsed.path == "/correlate":
            case = CASES.get(body.get("case_id"))
            if not case:
                return self.reply(404, {"reason":"unknown-case"})
            if body.get("correlation") != EXPECTED_CORRELATION:
                return self.reply(422, {"reason":"correlation-mismatch"})
            case["correlation_token"] = "correlation." + secrets.token_urlsafe(18)
            return self.reply(200, {"reason":"incident-correlated","correlation_token":case["correlation_token"],"objective_flag":os.environ["FLAG_L17_CORRELATION"]})
        if parsed.path == "/controls":
            case = CASES.get(body.get("case_id"))
            if not case:
                return self.reply(404, {"reason":"unknown-case"})
            if not case["correlation_token"] or body.get("correlation_token") != case["correlation_token"]:
                return self.reply(409, {"reason":"complete-correlation-first"})
            if body.get("results") != EXPECTED_RESULTS or body.get("controls") != CONTROLS:
                return self.reply(422, {"reason":"control-proof-mismatch"})
            return self.reply(200, {"reason":"layered-controls-validated","objective_flag":os.environ["FLAG_L17_HARDENING"]})
        authorization = self.headers.get("Authorization", "")
        raw = authorization[7:] if authorization.startswith("Bearer ") else ""
        case = next((value for value in CASES.values() if value["access_token"] == raw), None)
        if not case:
            return self.reply(401, {"reason":"jwt-invalid"})
        status, reason, claims = self.authenticate(case, require_csrf=True)
        if status != 200:
            return self.reply(status, {"reason":reason})
        if parsed.path == "/hardened/admin/export":
            if claims["role"] != "admin":
                return self.reply(403, {"reason":"role-denied"})
        elif parsed.path == "/hardened/profile":
            return self.reply(200, {"reason":"accepted"})
        elif parsed.path == "/hardened/transfer":
            request_id = self.headers.get("X-Request-ID", "")
            if not request_id:
                return self.reply(400, {"reason":"request-id-required"})
            if request_id in case["request_ids"]:
                return self.reply(409, {"reason":"replay-detected"})
            case["request_ids"].add(request_id)
            return self.reply(200, {"reason":"accepted","request_id":request_id})
        else:
            return self.reply(404, {"reason":"not-found"})
        return self.reply(200, {"reason":"accepted"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port":server.server_port}), flush=True)
    server.serve_forever()
