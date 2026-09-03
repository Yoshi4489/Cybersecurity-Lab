import base64
import hashlib
import io
import json
import os
import tarfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


MANIFEST_FLAG = os.environ["FLAG_L08_MANIFEST"]
BUNDLE_FLAG = os.environ["FLAG_L08_BUNDLE"]
CARVE_FLAG = os.environ["FLAG_L08_CARVE"]
FINAL_FLAG = os.environ["FLAG_L08_FINAL"]

MANIFEST_TOKEN = "cache-cobalt-08"
BUNDLE_TOKEN = "vault-lantern-42"
CARVE_TOKEN = "locker-sable-71"

# Single base64 layer for the manifest payload.
MANIFEST_PAYLOAD = base64.b64encode(
    f"manifest_token={MANIFEST_TOKEN}\nobjective_flag={MANIFEST_FLAG}\n".encode()
).decode()


def add_file(archive, name, content, mode=0o444):
    data = content if isinstance(content, bytes) else content.encode()
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.mtime = 1786608000
    info.uid = 1000
    info.gid = 1000
    info.uname = "analyst"
    info.gname = "analyst"
    archive.addfile(info, io.BytesIO(data))


def make_archive():
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as archive:
        add_file(
            archive,
            "cipher-08/README.txt",
            "Synthetic cache CACHE-08. Peel the payload, then carve the binary. Do not escalate.\n",
        )
        # payload.b64 is base64 wrapped twice: base64 -d | base64 -d recovers the tokens.
        inner = f"bundle_token={BUNDLE_TOKEN}\nobjective_flag={BUNDLE_FLAG}\n".encode()
        double = base64.b64encode(base64.b64encode(inner))
        add_file(archive, "cipher-08/payload.b64", double + b"\n", 0o400)
        # session.bin hides printable evidence between non-printable bytes.
        binary = (
            b"\x00\x01CACHE_CAPTURE\x00\x7f"
            + f"carve_token={CARVE_TOKEN}\nbinary_proof={CARVE_FLAG}\n".encode()
            + b"\x00\xffCACHE-08\x00"
        )
        add_file(archive, "cipher-08/session.bin", binary, 0o440)
    return stream.getvalue()


ARCHIVE = make_archive()
ARCHIVE_SHA256 = hashlib.sha256(ARCHIVE).hexdigest()


class Handler(BaseHTTPRequestHandler):
    server_version = "CipherVault/8.0"

    def reply(self, status, body, content_type="text/plain; charset=utf-8"):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Lab-Scope", "172.31.8.0/24")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.reply(200, "ok\n")
        elif path == "/":
            self.reply(
                200,
                "cipher-vault: recover the cache.\n"
                "1) GET /manifest and decode the base64 payload field\n"
                "2) GET /artifact/cache.tar, checksum it, extract it, peel payload.b64\n"
                "3) carve session.bin for printable evidence\n"
                "4) POST the three tokens plus archive_sha256 to /final\n",
            )
        elif path == "/manifest":
            self.reply(
                200,
                json.dumps({"note": "base64-decode the payload field", "payload": MANIFEST_PAYLOAD}) + "\n",
                "application/json; charset=utf-8",
            )
        elif path == "/artifact/cache.tar":
            self.reply(200, ARCHIVE, "application/x-tar")
        else:
            self.reply(404, "not found\n")

    def do_POST(self):
        if urlparse(self.path).path != "/final":
            self.reply(404, "not found\n")
            return
        size = min(int(self.headers.get("Content-Length", "0")), 8192)
        form = parse_qs(self.rfile.read(size).decode(errors="replace"))
        supplied = {
            "manifest": form.get("manifest", [""])[0],
            "bundle": form.get("bundle", [""])[0],
            "carve": form.get("carve", [""])[0],
            "archive_sha256": form.get("archive_sha256", [""])[0],
        }
        expected = {
            "manifest": MANIFEST_TOKEN,
            "bundle": BUNDLE_TOKEN,
            "carve": CARVE_TOKEN,
            "archive_sha256": ARCHIVE_SHA256,
        }
        if supplied != expected:
            self.reply(403, "decode chain rejected\n")
            return
        self.reply(200, f"final_flag={FINAL_FLAG}\n")

    def log_message(self, fmt, *args):
        print(f"cipher-vault {self.address_string()} {fmt % args}", flush=True)


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
