"""Publish only synthetic practice evidence; no service or command execution."""
import os
import time
from pathlib import Path

root = Path("/evidence")
(root / "handover.txt").write_text(
    "Welcome to Northstar's training desk. Case: PRACTICE-00\n"
    "You read a file using a command and its filename argument.\n"
    f"practice_flag={os.environ['FLAG_L00_NOTE']}\n"
    "Next: inspect events.log and keep only lines containing READY.\n",
    encoding="utf-8",
)
(root / "events.log").write_text(
    "09:00 WAIT desk setup\n"
    "09:01 WAIT supplies checked\n"
    f"09:02 READY practice_flag={os.environ['FLAG_L00_PIPE']}\n"
    "09:03 WAIT end of exercise\n",
    encoding="utf-8",
)
while True:
    time.sleep(3600)
