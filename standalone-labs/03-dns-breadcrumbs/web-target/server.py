import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


ADDRESS_TOKEN = "address-iris-30"
MAIL_TOKEN = "mail-kestrel-25"
SERVICE_TOKEN = "service-vault-8088"


class Handler(BaseHTTPRequestHandler):
    server_version = "HiddenVault/1.2"

    def log_message(self, _format, *_args):
        return

    def send_text(self, status: int, body: str):
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_text(200, "ok\n")
            return
        if parsed.path == "/":
            self.send_text(200, "Hidden vault online. Correlate DNS artifacts before requesting /final.\n")
            return
        if parsed.path == "/final":
            query = parse_qs(parsed.query)
            valid = (
                query.get("address") == [ADDRESS_TOKEN]
                and query.get("mail") == [MAIL_TOKEN]
                and query.get("service") == [SERVICE_TOKEN]
            )
            if valid:
                final_flag = os.environ.get("FLAG_L03_DNS_PROOF")
                if not final_flag:
                    self.send_text(500, "final flag is not configured\n")
                else:
                    self.send_text(200, f"final_flag={final_flag}\n")
            else:
                self.send_text(403, "address, mail, and service DNS artifacts are required\n")
            return
        self.send_text(404, "not found\n")


ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
