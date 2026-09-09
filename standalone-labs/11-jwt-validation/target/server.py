"""Synthetic local JWT validation lab; not a general JWT library."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

ISSUER = "northstar-auth"
AUDIENCE = "review-api"
KEYS = {"old": secrets.token_bytes(32), "new": secrets.token_bytes(32)}
CASES = {}
EXPECTED = {
    "valid": "accepted",
    "alg_none": "algorithm",
    "bad_signature": "signature",
    "expired": "expiry",
    "wrong_issuer": "issuer",
    "wrong_audience": "audience",
    "old_key": "key-retired",
    "wrong_role": "authorization",
    "tampered_role": "signature",
}
CONTROLS = {
    "verify_signature": True,
    "allowlist_algorithm": True,
    "validate_issuer_audience_expiry": True,
    "enforce_role_server_side": True,
    "reject_retired_keys": True,
}


def encode(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode(value):
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def token(claims, kid="new", key=None, alg="HS256"):
    header = {"alg": alg, "kid": kid, "typ": "JWT"}
    signing_input = ".".join(encode(json.dumps(part, separators=(",", ":")).encode()) for part in (header, claims))
    if alg == "none":
        return signing_input + "."
    signature = hmac.digest(key or KEYS[kid], signing_input.encode(), "sha256")
    return signing_input + "." + encode(signature)


def claims(**overrides):
    value = {
        "sub": "supervisor",
        "role": "admin",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": int(time.time()) + 3600,
    }
    value.update(overrides)
    return value


def new_case():
    valid = token(claims())
    valid_header, valid_payload, _valid_signature = valid.split(".")
    wrong_role = token(claims(role="analyst"))
    analyst_header, _analyst_payload, analyst_signature = wrong_role.split(".")
    tampered = claims(role="admin")
    fixtures = {
        "valid": valid,
        "alg_none": token(claims(), alg="none"),
        "bad_signature": valid_header + "." + valid_payload + "." + encode(bytes(32)),
        "expired": token(claims(exp=int(time.time()) - 60)),
        "wrong_issuer": token(claims(iss="other-issuer")),
        "wrong_audience": token(claims(aud="other-api")),
        "old_key": token(claims(), kid="old"),
        "wrong_role": wrong_role,
        "tampered_role": analyst_header + "." + encode(json.dumps(tampered, separators=(",", ":")).encode()) + "." + analyst_signature,
    }
    return {"fixtures": fixtures, "matrix_complete": False, "matrix_token": None}


def validate(raw):
    try:
        parts = raw.split(".")
        if len(parts) != 3:
            return 401, "malformed"
        encoded_header, encoded_payload, encoded_signature = parts
        header = json.loads(decode(encoded_header))
        payload = json.loads(decode(encoded_payload))
        if not isinstance(header, dict) or not isinstance(payload, dict):
            return 401, "malformed"
        if header.get("alg") != "HS256":
            return 401, "algorithm"
        if header.get("kid") != "new":
            return 401, "key-retired"
        expected = hmac.digest(KEYS["new"], f"{encoded_header}.{encoded_payload}".encode(), hashlib.sha256)
        if not hmac.compare_digest(decode(encoded_signature), expected):
            return 401, "signature"
        if payload.get("iss") != ISSUER:
            return 401, "issuer"
        if payload.get("aud") != AUDIENCE:
            return 401, "audience"
        expiry = payload.get("exp")
        if isinstance(expiry, bool) or not isinstance(expiry, int) or expiry <= int(time.time()):
            return 401, "expiry"
        if payload.get("sub") != "supervisor" or payload.get("role") != "admin":
            return 403, "authorization"
        return 200, "accepted"
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return 401, "malformed"


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

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"service": "jwt-review", "state": "ready"})
        case = CASES.get(self.headers.get("X-Case-ID"))
        if self.path == "/fixed" and case:
            authorization = self.headers.get("Authorization", "")
            raw = authorization[7:] if authorization.startswith("Bearer ") else ""
            status, reason = validate(raw)
            return self.reply(status, {"reason": reason})
        return self.reply(404, {"reason": "not-found"})

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if self.path == "/case":
            case_id = secrets.token_urlsafe(24)
            CASES[case_id] = new_case()
            return self.reply(201, {
                "case_id": case_id,
                "policy": {"issuer": ISSUER, "audience": AUDIENCE, "active_kid": "new", "required_role": "admin"},
                "fixtures": CASES[case_id]["fixtures"],
            })
        case = CASES.get(body.get("case_id"))
        if not case:
            return self.reply(404, {"reason": "unknown-case"})
        if self.path == "/matrix":
            if body.get("results") != EXPECTED:
                return self.reply(422, {"reason": "matrix-mismatch", "expected_names": list(EXPECTED)})
            case["matrix_complete"] = True
            case["matrix_token"] = secrets.token_urlsafe(18)
            return self.reply(200, {"reason": "matrix-confirmed", "matrix_token": case["matrix_token"], "objective_flag": os.environ["FLAG_L11_MATRIX"]})
        if self.path == "/remediation":
            if not case["matrix_complete"] or body.get("matrix_token") != case["matrix_token"]:
                return self.reply(409, {"reason": "complete-matrix-first"})
            if body.get("controls") != CONTROLS:
                return self.reply(422, {"reason": "controls-incomplete"})
            return self.reply(200, {"reason": "controls-validated", "objective_flag": os.environ["FLAG_L11_REMEDIATION"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
