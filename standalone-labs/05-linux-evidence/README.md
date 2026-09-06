# Lab 05 — Incident EV-55: Linux Evidence Hunt

**Level:** Beginner–intermediate

**Mode:** Guided forensic investigation

**Time:** 50–65 minutes

**Recommended first:** Basic Linux shell usage

**Skills:** evidence acquisition, hashes, file metadata, logs, strings

## Scenario

Northstar Shipping's incident team collected a read-only archive from a Linux web
server after an unusual login burst. You are the junior analyst assigned case
`EV-55`. The lead needs four answers: whether the archive stayed intact, which
hidden handoff note was left behind, which source dominated the access log, and
what printable marker exists inside a suspicious binary.

The case follows a forensic workflow:

```text
acquire and hash → inventory files → correlate logs → inspect artifact → report findings
```

There is no SSH, `sudo`, SUID exploitation, or privilege escalation in this lab.

## What you need to know

- `sha256sum FILE` creates an integrity fingerprint. Record it before analysis.
- `tar -tf` lists an archive; `tar -xf` extracts it.
- `find` locates files and `stat` shows permissions and timestamps.
- `base64 -d` decodes data; base64 is an encoding, not encryption.
- `cut | sort | uniq -c | sort -nr` is a common pipeline for counting repeated log fields.
- `strings` extracts printable text from a file that is otherwise binary.

Every step examines the same case dataset. You are narrowing evidence, not
switching to unrelated challenges.

`mkdir -p` creates a working directory; `curl -o` saves a response to a file. `grep` selects log lines, `sed` extracts a matched value, `cut` selects fields, `sort` orders rows, and `uniq -c` counts adjacent repeated rows. `xargs -0` safely passes zero-delimited filenames from `find -print0`. A leading dot marks a hidden filename; mode 400 gives its owner read permission. Start by listing the archive with `tar -tf`; the first file to read after extraction is its README.txt.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

```sh
node scripts/standalone-labctl.mjs start 05-linux-evidence
node scripts/standalone-labctl.mjs shell 05-linux-evidence
```

Investigate inside the toolbox and verify in a second project terminal. Scope is
only case `EV-55` at `172.30.55.55` on subnet `172.30.55.0/24`.

Each stage proof is an `RLAB{...}` flag. Keep all three early flags plus the
archive hash; the final report needs them.

## Objectives

### Flag 1 — Preserve and inventory the case (`filesystem`)

Download the manifest and case archive, record the SHA-256 hash, extract a working
copy, and locate the permission-marked encoded handoff note.

### Flag 2 — Identify the dominant source (`logs`)

Determine which source IP appears most often in the access log. Find the proof
path requested by that source.

### Flag 3 — Inspect the suspicious artifact (`binary`)

Recover the `binary_proof` text embedded in `session.bin` without executing it.

### Flag 4 — Close case EV-55 (`final`)

Submit the three flags, dominant source, original archive hash, and case ID.

## Hints

<details>
<summary>Hints for Flag 1 — filesystem</summary>

1. The server exposes `/manifest` and `/case-55.tar`; work on an extracted copy in `/tmp`.
2. List permissions for every file and look for an unusually restricted `.b64` file.
3. Use `find /tmp/evidence -name '*.b64' -print0 | xargs -0 base64 -d`.

</details>

<details>
<summary>Hints for Flag 2 — logs</summary>

1. The first space-separated field in an access log is the source.
2. Count that field, sort numerically, then inspect requests from the top source.
3. The top source is `10.55.0.23`; extract the value after `/proof/` from its log entries.

</details>

<details>
<summary>Hints for Flag 3 — binary</summary>

1. Do not run an unknown binary during evidence review.
2. `strings` displays printable sequences safely.
3. Run `strings /tmp/evidence/case-55/artifacts/session.bin | grep binary_proof`.

</details>

<details>
<summary>Hints for Flag 4 — final</summary>

1. The final endpoint checks evidence continuity across the whole case.
2. You need `filesystem`, `logs`, `binary`, `top_source`, `archive_sha256`, and `case` fields.
3. POST those fields to `http://172.30.55.55:8080/final`; the case is `EV-55`.

</details>

## Solution

### 1. Acquire, hash, and inspect (`filesystem`)

**Toolbox:**

```sh
curl -fsS http://172.30.55.55:8080/manifest
curl -fsS http://172.30.55.55:8080/case-55.tar -o /tmp/case-55.tar
sha256sum /tmp/case-55.tar
# Compare this hash with sha256= in the manifest; stop if they differ.
tar -tf /tmp/case-55.tar
mkdir -p /tmp/evidence
tar -xf /tmp/case-55.tar -C /tmp/evidence
find /tmp/evidence -type f -exec stat -c '%a %y %n' {} \;
find /tmp/evidence -name '*.b64' -print0 | xargs -0 base64 -d
```

Save the SHA-256 value and `filesystem_proof`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence filesystem 'RLAB{...}'
```

### 2. Correlate the access log (`logs`)

**Toolbox:**

```sh
cut -d ' ' -f 1 /tmp/evidence/case-55/logs/access.log | sort | uniq -c | sort -nr
grep '10.55.0.23' /tmp/evidence/case-55/logs/access.log \
  | sed -n 's#.*GET /proof/\([^ ]*\) .*#\1#p'
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence logs 'RLAB{...}'
```

### 3. Extract printable evidence (`binary`)

**Toolbox:**

```sh
strings /tmp/evidence/case-55/artifacts/session.bin | grep binary_proof
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence binary 'RLAB{...}'
```

### 4. Submit the case report (`final`)

**Toolbox:**

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

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 05-linux-evidence final 'RLAB{...}'
```

## What this taught you

Next: Lab 06. Record a one-sentence explanation of how your evidence led to each new command before moving on.

Forensic commands are connected by evidence handling: preserve integrity, work
from a copy, use metadata to prioritize files, correlate logs, and inspect an
artifact safely. In a real case, document timestamps, preserve originals, and
maintain chain-of-custody records.

## Stop or reset

```sh
node scripts/standalone-labctl.mjs status 05-linux-evidence
node scripts/standalone-labctl.mjs reset 05-linux-evidence
node scripts/standalone-labctl.mjs stop 05-linux-evidence
```
