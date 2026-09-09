"""Synthetic local cookie/session lab; no real accounts or browser victim."""
import json
import os
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer

CASES = {}
VULNERABLE_SESSIONS = {}
FIXED_SESSIONS = {}
CONTROLS = {"secure": True, "http_only": True, "same_site": "Strict", "rotate_on_login": True, "invalidate_on_logout": True}


def session_cookie(headers):
    jar = SimpleCookie()
    try:
        jar.load(headers.get("Cookie", ""))
        return jar["session"].value if "session" in jar else None
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, cookie=None):
        data = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
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
            return self.reply(200, {"service": "session-review", "state": "ready"})
        sid = session_cookie(self.headers)
        if self.path == "/vulnerable/session" and sid in VULNERABLE_SESSIONS:
            return self.reply(200, {"authenticated": True, "account": "training-user"})
        if self.path == "/fixed/session":
            case_id = FIXED_SESSIONS.get(sid)
            if case_id:
                CASES[case_id]["new_accepted"] = True
                return self.reply(200, {"authenticated": True, "account": "training-user"})
            for case in CASES.values():
                if sid == case["fixation_session"]:
                    case["old_rejected"] = True
                if sid and sid == case.get("logged_out_session"):
                    case["logout_rejected"] = True
            return self.reply(401, {"reason": "invalid-session"})
        return self.reply(404, {"reason": "not-found"})

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if self.path == "/case":
            case_id = secrets.token_urlsafe(18)
            fixation = "fixed-by-reviewer-" + secrets.token_hex(8)
            CASES[case_id] = {"fixation_session": fixation, "finding_token": None, "old_rejected": False, "new_accepted": False, "logged_out": False, "logout_rejected": False}
            return self.reply(201, {"case_id": case_id, "fixation_session": fixation})
        case = CASES.get(body.get("case_id"))
        if not case:
            return self.reply(404, {"reason": "unknown-case"})
        if self.path == "/vulnerable/login":
            supplied = session_cookie(self.headers) or secrets.token_urlsafe(24)
            VULNERABLE_SESSIONS[supplied] = body["case_id"]
            case["vulnerable_seen"] = supplied == case["fixation_session"]
            return self.reply(200, {"authenticated": True}, f"session={supplied}; Path=/")
        if self.path == "/finding":
            expected = ["Secure", "HttpOnly", "SameSite"]
            if not case.get("vulnerable_seen") or body.get("accepted_supplied_id") is not True or body.get("missing_attributes") != expected:
                return self.reply(422, {"reason": "finding-mismatch"})
            case["finding_token"] = secrets.token_urlsafe(18)
            return self.reply(200, {"finding_token": case["finding_token"], "objective_flag": os.environ["FLAG_L12_FIXATION"]})
        if self.path == "/fixed/login":
            supplied = session_cookie(self.headers)
            if supplied:
                FIXED_SESSIONS.pop(supplied, None)
            rotated = secrets.token_urlsafe(32)
            FIXED_SESSIONS[rotated] = body["case_id"]
            case["fixed_session"] = rotated
            return self.reply(200, {"authenticated": True, "rotated": True}, f"session={rotated}; Path=/; Secure; HttpOnly; SameSite=Strict")
        if self.path == "/fixed/logout":
            sid = session_cookie(self.headers)
            if not sid or FIXED_SESSIONS.get(sid) != body["case_id"]:
                return self.reply(401, {"reason": "invalid-session"})
            FIXED_SESSIONS.pop(sid, None)
            case["logged_out"] = True
            case["logged_out_session"] = sid
            return self.reply(200, {"reason": "logged-out"}, "session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict")
        if self.path == "/remediation":
            proof = case["old_rejected"] and case["new_accepted"] and case["logged_out"] and case["logout_rejected"]
            if body.get("finding_token") != case["finding_token"] or not case["finding_token"]:
                return self.reply(409, {"reason": "complete-finding-first"})
            if body.get("controls") != CONTROLS or not proof:
                return self.reply(422, {"reason": "remediation-not-proven"})
            return self.reply(200, {"reason": "lifecycle-validated", "objective_flag": os.environ["FLAG_L12_LIFECYCLE"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
