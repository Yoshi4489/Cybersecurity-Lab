"""Local synthetic BOLA teaching target; never use against external systems."""
import json
import os
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer

CASES = {}
OBSERVATIONS = {
    "vulnerable_cross_owner_read": 200,
    "vulnerable_cross_owner_write": 200,
    "fixed_cross_owner_read": 403,
    "fixed_cross_owner_write": 403,
    "fixed_owner_read": 200,
    "fixed_owner_write": 200,
}
CONTROLS = {"filter_by_owner": True, "authorize_each_read": True, "authorize_each_write": True, "deny_cross_owner": True}


def report(finding, evidence, impact, remediation):
    return {"finding": finding, "evidence": evidence, "impact": impact, "confidence": "High — repeated real HTTP requests produced the expected positive and negative results.", "remediation": remediation}


def new_case():
    users = {name: {"user_id": f"USR-{number}", "token": secrets.token_urlsafe(18)} for name, number in (("mina", "1401"), ("noah", "1402"))}
    tickets = {
        "TKT-1401": {"id": "TKT-1401", "owner": "mina", "subject": "Synthetic VPN reset", "status": "open"},
        "TKT-1402": {"id": "TKT-1402", "owner": "noah", "subject": "Synthetic payroll portal issue", "status": "open"},
    }
    return {"users": users, "tokens": {value["token"]: name for name, value in users.items()}, "tickets": tickets, "exposure_token": None}


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

    def locate(self):
        token = self.headers.get("X-Lab-Token", "")
        for case_id, case in CASES.items():
            if token in case["tokens"]:
                return case_id, case, case["tokens"][token]
        return None, None, None

    def ticket_request(self, method, body=None):
        parts = self.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] not in ("vulnerable", "fixed") or parts[1] != "tickets":
            return self.reply(404, {"reason": "not-found"})
        mode, ticket_id = parts[0], parts[2]
        _case_id, case, user = self.locate()
        if not case:
            return self.reply(401, {"reason": "authentication-required"})
        ticket = case["tickets"].get(ticket_id)
        if not ticket:
            return self.reply(404, {"reason": "ticket-not-found"})
        if mode == "fixed" and ticket["owner"] != user:
            return self.reply(403, {"reason": "owner-required"})
        if method == "PATCH":
            if body is None:
                return self.reply(400, {"reason": "invalid-json"})
            if body.get("status") not in ("open", "closed"):
                return self.reply(422, {"reason": "invalid-status"})
            ticket["status"] = body["status"]
        return self.reply(200, {"mode": mode, "actor": user, "ticket": ticket})

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"service": "object-authorization", "state": "ready"})
        return self.ticket_request("GET")

    def do_PATCH(self):
        return self.ticket_request("PATCH", self.read_json())

    def do_POST(self):
        body = self.read_json()
        if body is None:
            return self.reply(400, {"reason": "invalid-json"})
        if self.path == "/case":
            case_id = secrets.token_urlsafe(20)
            CASES[case_id] = new_case()
            case = CASES[case_id]
            return self.reply(201, {"case_id": case_id, "users": case["users"], "tickets": {"mina": "TKT-1401", "noah": "TKT-1402"}, "scope": "Only this local synthetic service"})
        case = CASES.get(body.get("case_id"))
        if not case:
            return self.reply(404, {"reason": "unknown-case"})
        if self.path == "/reports/exposure":
            if body.get("observations") != OBSERVATIONS:
                return self.reply(422, {"reason": "observations-mismatch", "required": list(OBSERVATIONS)})
            case["exposure_token"] = secrets.token_urlsafe(16)
            evidence = report("Object identifiers alone authorized cross-owner ticket reads and writes.", "Mina received HTTP 200 for GET and PATCH of Noah's ticket; fixed routes returned 403 while Noah retained 200 access.", "An authenticated user could disclose or alter another user's ticket.", "Filter queries by the authenticated owner and enforce ownership server-side for every read and write.")
            return self.reply(200, {"evidence_report": evidence, "exposure_token": case["exposure_token"], "objective_flag": os.environ["FLAG_L14_EXPOSURE"]})
        if self.path == "/reports/remediation":
            if not case["exposure_token"] or body.get("exposure_token") != case["exposure_token"]:
                return self.reply(409, {"reason": "complete-exposure-report-first"})
            if body.get("controls") != CONTROLS:
                return self.reply(422, {"reason": "controls-incomplete"})
            evidence = report("Server-side ownership checks block cross-owner reads and writes without blocking owners.", "Both fixed cross-owner requests returned 403 and both owner requests returned 200.", "The tested BOLA path is removed while legitimate ticket access remains available.", "Keep server-side owner scoping on every object lookup and mutation, deny mismatches, and regression-test positive and negative cases.")
            return self.reply(200, {"evidence_report": evidence, "objective_flag": os.environ["FLAG_L14_REMEDIATION"]})
        return self.reply(404, {"reason": "not-found"})

    def log_message(self, _format, *_args):
        pass


if __name__ == "__main__":
    server = HTTPServer((os.environ.get("LAB_HOST", "0.0.0.0"), int(os.environ.get("LAB_PORT", "8080"))), Handler)
    print(json.dumps({"port": server.server_port}), flush=True)
    server.serve_forever()
