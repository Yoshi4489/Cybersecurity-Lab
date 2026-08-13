import base64
import hashlib
import io
import os
import tarfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs


FILESYSTEM_FLAG = os.environ["LAB05_FILESYSTEM_FLAG"]
LOG_FLAG = os.environ["LAB05_LOG_FLAG"]
BINARY_FLAG = os.environ["LAB05_BINARY_FLAG"]
FINAL_FLAG = os.environ["LAB05_FINAL_FLAG"]
TOP_SOURCE = "10.55.0.23"


def add_file(archive, name, content, mode, mtime):
    data = content if isinstance(content, bytes) else content.encode()
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.mtime = mtime
    info.uid = 1000
    info.gid = 1000
    info.uname = "analyst"
    info.gname = "analyst"
    archive.addfile(info, io.BytesIO(data))


def make_archive():
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        add_file(
            archive,
            "case-55/README.txt",
            "Synthetic evidence case EV-55. Work as the unprivileged analyst; do not escalate.\n",
            0o444,
            1786579200,
        )
        encoded = base64.b64encode(f"filesystem_proof={FILESYSTEM_FLAG}\n".encode())
        add_file(archive, "case-55/notes/.handoff.b64", encoded + b"\n", 0o400, 1786579260)
        logs = "".join(
            [
                "10.55.0.11 - - [13/Aug/2026:04:01:01 +0000] GET /index 200\n",
                f"{TOP_SOURCE} - - [13/Aug/2026:04:02:09 +0000] GET /stage-one 200\n",
                "10.55.0.19 - - [13/Aug/2026:04:02:44 +0000] GET /health 200\n",
                f"{TOP_SOURCE} - - [13/Aug/2026:04:03:10 +0000] GET /exports 403\n",
                f"{TOP_SOURCE} - - [13/Aug/2026:04:04:18 +0000] GET /proof/{LOG_FLAG} 200\n",
                f"{TOP_SOURCE} - - [13/Aug/2026:04:05:21 +0000] GET /case/EV-55 200\n",
                "10.55.0.11 - - [13/Aug/2026:04:06:01 +0000] GET /logout 302\n",
            ]
        )
        add_file(archive, "case-55/logs/access.log", logs, 0o440, 1786579500)
        binary = b"\x00\x01RANGE_CAPTURE\x00" + f"binary_proof={BINARY_FLAG}".encode() + b"\x00\xffEV-55\x00"
        add_file(archive, "case-55/artifacts/session.bin", binary, 0o440, 1786579800)
        add_file(
            archive,
            "case-55/artifacts/timeline.txt",
            "04:02 discovery\n04:04 proof access\n04:05 case confirmation\n",
            0o444,
            1786579860,
        )
    return output.getvalue()


ARCHIVE = make_archive()
ARCHIVE_SHA256 = hashlib.sha256(ARCHIVE).hexdigest()
ARCHIVE_PATH = "/run/evidence/case-55.tar"
with open(ARCHIVE_PATH, "wb") as archive_file:
    archive_file.write(ARCHIVE)
os.chmod(ARCHIVE_PATH, 0o400)


class Handler(BaseHTTPRequestHandler):
    server_version = "EvidenceVault/5.5"

    def reply(self, status, body, content_type="text/plain; charset=utf-8"):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Evidence-Read-Only", "true")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/case-55.tar":
            with open(ARCHIVE_PATH, "rb") as archive_file:
                self.reply(200, archive_file.read(), "application/x-tar")
        elif self.path == "/manifest":
            self.reply(200, "case=EV-55\nsource=read-only-runtime-generated\nartifact=/case-55.tar\n")
        else:
            self.reply(404, "not found\n")

    def do_POST(self):
        if self.path != "/final":
            self.reply(404, "not found\n")
            return
        size = min(int(self.headers.get("Content-Length", "0")), 8192)
        form = parse_qs(self.rfile.read(size).decode(errors="replace"))
        supplied = {
            "filesystem": form.get("filesystem", [""])[0],
            "logs": form.get("logs", [""])[0],
            "binary": form.get("binary", [""])[0],
            "top_source": form.get("top_source", [""])[0],
            "archive_sha256": form.get("archive_sha256", [""])[0],
            "case": form.get("case", [""])[0],
        }
        expected = {
            "filesystem": FILESYSTEM_FLAG,
            "logs": LOG_FLAG,
            "binary": BINARY_FLAG,
            "top_source": TOP_SOURCE,
            "archive_sha256": ARCHIVE_SHA256,
            "case": "EV-55",
        }
        if supplied != expected:
            self.reply(403, "evidence chain rejected\n")
            return
        self.reply(200, f"final_proof={FINAL_FLAG}\n")

    def log_message(self, fmt, *args):
        print(f"evidence-vault {self.address_string()} {fmt % args}", flush=True)


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
