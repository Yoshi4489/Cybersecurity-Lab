# Lab 06 — Signals in the Noise

**Level:** Intermediate

**Mode:** Investigation capstone

**Time:** 75–90 minutes

**Recommended first:** Labs 01–05

**Skills:** DNS exposure, service mapping, artifact acquisition, log correlation

## Scenario

Northstar Shipping detected repeated connections to a forgotten relay in the
`signals.test` environment. No single alert proves an incident. The DNS team has
an unusual transfer log, network monitoring sees two open web ports, and the
response team has not yet retrieved the relay's evidence bundle.

Act as the incident investigator. Build one defensible timeline by connecting the
signals instead of treating them as separate puzzles:

```text
DNS disclosure → relay address → service map → evidence bundle → actor/event correlation
```

## What you need to know

This capstone deliberately reuses earlier skills:

- Lab 03: DNS queries and interpreting record types.
- Lab 04: why an open AXFR discloses a zone.
- Labs 01–02: TCP connect scans, HTTP headers, and saved scan evidence.
- Lab 05: hashing archives and counting/correlating log fields.

Use `nmap -sT` only. The toolbox has no raw-socket capability. If any tool feels
unfamiliar, revisit its earlier guided lab before continuing.

`awk` selects fields and rows; `sed` extracts an event ID from a matching path. These are the field-analysis skills introduced in Lab 05. An actor can make several successful requests: select the successful /events/ path specifically.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

```sh
node scripts/standalone-labctl.mjs start 06-signals-capstone
node scripts/standalone-labctl.mjs shell 06-signals-capstone
```

Investigate inside the toolbox and verify in a second project terminal. Authorized
scope is only `signals.test` and `172.30.66.0/24`. Keep every early flag and the
bundle hash because the final report validates the full evidence chain.

## Objectives

### Flag 1 — Recover the relay route (`dns-chain`)

Identify the authoritative DNS service, test whether the synthetic zone allows
AXFR, and record the relay address, case ID, and DNS proof.

### Flag 2 — Map the relay (`service-map`)

Scan the disclosed relay address, identify all open services, and inspect the
metadata service for the proof and artifact path.

### Flag 3 — Preserve the HTTP artifact (`http-artifact`)

Download the disclosed bundle, calculate its SHA-256 hash before extraction, and
recover the HTTP proof from its manifest.

### Flag 4 — Correlate the incident (`final`)

Analyze the bundled relay log to find the busiest actor and that actor's successful
event. Submit all earlier evidence as one case report.

## Hints

### Flag 1 — dns-chain

<details>
<summary>Hint 1 — where to look</summary>

The authoritative server is `172.30.66.53`; begin with SOA and NS queries.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Attempt `AXFR` for `signals.test` and save it to `/tmp/signals.axfr`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Search the transfer for `_dns-proof`, A records, TXT records, and case `SG-66`.

</details>

### Flag 2 — service-map

<details>
<summary>Hint 1 — where to look</summary>

The transfer reveals the relay at `172.30.66.90`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Run an all-port TCP connect scan, then version detection only on open ports.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Inspect port `9090` with `curl -i`; the proof and artifact path are HTTP headers.

</details>

### Flag 3 — http-artifact

<details>
<summary>Hint 1 — where to look</summary>

The metadata header points to a tar archive on port `8080`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Hash the downloaded bytes before extracting them.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Extract the bundle and find `http_proof=` in `signals-66/manifest.txt`.

</details>

### Flag 4 — final

<details>
<summary>Hint 1 — where to look</summary>

Count the first field of `relay-access.log`; then inspect successful requests from the top actor.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The dominant actor is `relay-7`, and its successful event is `EVT-6604`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

POST the three flags, `ports=8080,9090`, actor, event, hash, and `case=SG-66` to `/final`.

</details>

## Solution

### 1. Transfer the synthetic zone (`dns-chain`)

**Toolbox:**

```sh
dig @172.30.66.53 signals.test SOA
nslookup -type=ns signals.test 172.30.66.53
dig @172.30.66.53 signals.test AXFR | tee /tmp/signals.axfr
grep '_dns-proof' /tmp/signals.axfr
awk '$4 == "A" || $4 == "TXT" {print}' /tmp/signals.axfr
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone dns-chain 'RLAB{...}'
```

### 2. Map the disclosed relay (`service-map`)

**Toolbox:**

```sh
nmap -sT -Pn -p- 172.30.66.90 -oN /tmp/relay-ports.nmap
nmap -sT -Pn -sV -p 8080,9090 --script http-title,http-headers 172.30.66.90
curl -i http://172.30.66.90:9090/
```

Record `X-Service-Proof` and `X-Artifact-Path`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone service-map 'RLAB{...}'
```

### 3. Acquire and inspect the evidence (`http-artifact`)

**Toolbox:**

```sh
curl -fsS http://172.30.66.90:8080/artifact/signals-bundle.tar -o /tmp/signals-bundle.tar
sha256sum /tmp/signals-bundle.tar
# Compare with X-Artifact-SHA256 from step 2; stop if they differ.
mkdir -p /tmp/signals
tar -xf /tmp/signals-bundle.tar -C /tmp/signals
grep '^http_proof=' /tmp/signals/signals-66/manifest.txt | cut -d= -f2-
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone http-artifact 'RLAB{...}'
```

### 4. Correlate and report (`final`)

**Toolbox:**

```sh
LOG=/tmp/signals/signals-66/logs/relay-access.log
cut -d ' ' -f1 "$LOG" | sort | uniq -c | sort -nr
grep '^relay-7 ' "$LOG" | awk '$5 == 200 {print $4}' | sed -n 's#^/events/##p'
curl -X POST \
  --data-urlencode 'dns=<dns-flag>' \
  --data-urlencode 'nmap=<service-map-flag>' \
  --data-urlencode 'http=<http-artifact-flag>' \
  --data-urlencode 'ports=8080,9090' \
  --data-urlencode 'actor=relay-7' \
  --data-urlencode 'event=EVT-6604' \
  --data-urlencode 'bundle_sha256=<sha256-from-step-3>' \
  --data-urlencode 'case=SG-66' \
  http://172.30.66.90:8080/final
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone final 'RLAB{...}'
```

## What this taught you

Real investigations become useful when separate telemetry shares an asset, case,
time, or actor. Reduce this attack path by restricting AXFR, minimizing banners,
segmenting relay services, signing artifacts, and correlating DNS, flow, and
application logs in one detection timeline.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 06-signals-capstone
node scripts/standalone-labctl.mjs stop 06-signals-capstone
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 06-signals-capstone
```
