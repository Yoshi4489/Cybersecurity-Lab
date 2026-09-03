# Lab 05 — Linux Evidence Hunt

Practice **Linux command-line forensics** on a synthetic evidence set that the
target generates fresh at start-up and serves **read-only**. There is no SSH, no
`sudo`, no SUID exploitation, and no privilege escalation — just careful analysis.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 05-linux-evidence
node scripts/standalone-labctl.mjs shell 05-linux-evidence
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder for `verify`. Authorized scope is `172.30.55.0/24` and case `EV-55` only.

> Each stage's proof value **is** the `RLAB{...}` flag: submit it with `verify`,
> and reuse those same values in the final POST.

Objectives are gated in order: `filesystem → logs → binary → final`.

## Walkthrough

### 1. Acquire the evidence and decode the note (`filesystem`)

Download the manifest and archive, record the archive checksum (you'll need it at
the end), list the contents, then extract to scratch space:

```sh
curl -fsS http://172.30.55.55:8080/manifest
curl -fsS http://172.30.55.55:8080/case-55.tar -o /tmp/case-55.tar
sha256sum /tmp/case-55.tar               # save this hex value for the final step
tar -tf /tmp/case-55.tar
mkdir -p /tmp/evidence && tar -xf /tmp/case-55.tar -C /tmp/evidence
```

Inventory the files, then decode the permission-marked note (`.handoff.b64`,
mode `400`), which prints `filesystem_proof=RLAB{...}`:

```sh
find /tmp/evidence -type f -exec stat -c '%a %y %n' {} \;
find /tmp/evidence -name '*.b64' -print0 | xargs -0 base64 -d
```

Verify the filesystem flag (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence filesystem 'RLAB{...}'
```

### 2. Correlate the top log source (`logs`)

Find the most frequent source IP in the access log, then read the proof path that
source requested. The busiest source is `10.55.0.23`:

```sh
cut -d ' ' -f 1 /tmp/evidence/case-55/logs/access.log | sort | uniq -c | sort -nr
grep '10.55.0.23' /tmp/evidence/case-55/logs/access.log \
  | sed -n 's#.*GET /proof/\([^ ]*\) .*#\1#p'          # prints RLAB{...}
```

Verify the log flag:

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence logs 'RLAB{...}'
```

### 3. Recover strings from the binary (`binary`)

Pull printable strings out of the binary artifact and find `binary_proof=`:

```sh
strings /tmp/evidence/case-55/artifacts/session.bin | grep binary_proof
```

Verify the binary flag:

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence binary 'RLAB{...}'
```

### 4. Close the evidence chain (`final`)

POST the three flags, the correlated source, the archive checksum from step 1, and
the case ID:

```sh
curl -X POST \
  --data-urlencode 'filesystem=<filesystem-flag>' \
  --data-urlencode 'logs=<log-flag>' \
  --data-urlencode 'binary=<binary-flag>' \
  --data-urlencode 'top_source=10.55.0.23' \
  --data-urlencode 'archive_sha256=<sha256-from-step-1>' \
  --data-urlencode 'case=EV-55' \
  http://172.30.55.55:8080/final
```

The response prints `final_proof=RLAB{...}` — verify it:

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence final 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 05-linux-evidence
node scripts/standalone-labctl.mjs reset  05-linux-evidence
node scripts/standalone-labctl.mjs stop   05-linux-evidence
```

`smoke` is a maintainer/CI self-check, not part of the solution path.

## Detection / remediation

- Keep original evidence immutable, record a cryptographic hash before analysis,
  work only on copies, and maintain a documented chain of custody.
- Correlate filesystem metadata, logs, and artifacts by case ID and timestamp.
- The target serves the dataset read-only, publishes no host ports, and has no
  internet egress.
