# Lab 06 — Signals in the Noise

A standalone **capstone** that chains evidence end to end: DNS zone transfer →
Nmap TCP connect service mapping → HTTP artifact retrieval → Linux log
correlation. All data, IPs, and domains are synthetic and live only on an internal
Docker network.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 06-signals-capstone
node scripts/standalone-labctl.mjs shell 06-signals-capstone
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder for `verify`. Authorized scope is `172.30.66.0/24` only. The toolbox has no
`NET_RAW`, so use TCP connect scans (`nmap -sT`) only.

> Each stage's proof value **is** the `RLAB{...}` flag: submit it with `verify`,
> and reuse those same values in the final POST.

Objectives are gated in order: `dns-chain → service-map → http-artifact → final`.

## Walkthrough

### 1. Transfer the zone and recover the relay route (`dns-chain`)

Find the authoritative server with two tools, then AXFR the synthetic zone and pull
the proof record:

```sh
dig @172.30.66.53 signals.test SOA
nslookup -type=ns signals.test 172.30.66.53
dig @172.30.66.53 signals.test AXFR | tee /tmp/signals.axfr
grep '_dns-proof' /tmp/signals.axfr                       # the flag for this stage
awk '$4 == "A" || $4 == "TXT" {print}' /tmp/signals.axfr  # note relay.signals.test + case SG-66
```

Verify the `_dns-proof` value (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone dns-chain 'RLAB{...}'
```

### 2. Map the relay services (`service-map`)

Connect-scan the relay host the zone disclosed (`172.30.66.90`), then read the HTTP
metadata on `9090`. The flag arrives as a response **header**:

```sh
nmap -sT -Pn -p- 172.30.66.90 -oN /tmp/relay-ports.nmap    # finds 8080 and 9090
nmap -sT -Pn -sV -p 8080,9090 --script http-title,http-headers 172.30.66.90
curl -i http://172.30.66.90:9090/
```

In the `curl -i` output, `X-Service-Proof:` is the flag and `X-Artifact-Path:`
points to the bundle you'll fetch next. Verify the service-map flag:

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone service-map 'RLAB{...}'
```

### 3. Acquire and verify the evidence bundle (`http-artifact`)

Download the bundle from port `8080`, check its hash, extract it, and read the
manifest proof:

```sh
curl -fsS http://172.30.66.90:8080/artifact/signals-bundle.tar -o /tmp/signals-bundle.tar
sha256sum /tmp/signals-bundle.tar          # save this hex value for the final step
mkdir -p /tmp/signals && tar -xf /tmp/signals-bundle.tar -C /tmp/signals
grep '^http_proof=' /tmp/signals/signals-66/manifest.txt | cut -d= -f2-
```

Verify the http-artifact flag:

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone http-artifact 'RLAB{...}'
```

### 4. Correlate the logs and submit everything (`final`)

Find the busiest actor in the bundled log, then its one successful event path. The
top actor is `relay-7` and the correlated event is `EVT-6604`:

```sh
LOG=/tmp/signals/signals-66/logs/relay-access.log
cut -d ' ' -f1 "$LOG" | sort | uniq -c | sort -nr
grep '^relay-7 ' "$LOG" | awk '$5 == 200 {print $4}' | sed -n 's#^/events/##p'
```

POST the three flags plus the correlated details (the endpoint refuses a single
flag on its own):

```sh
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

The response prints `final_proof=RLAB{...}` — verify it:

```sh
node scripts/standalone-labctl.mjs verify 06-signals-capstone final 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 06-signals-capstone
node scripts/standalone-labctl.mjs reset  06-signals-capstone
node scripts/standalone-labctl.mjs stop   06-signals-capstone
```

`smoke` is a maintainer/CI self-check, not part of the solution path.

## Detection / remediation

- Disable public AXFR, minimize data in service banners/headers, verify artifact
  hashes, and correlate DNS, network, and application logs by shared case ID and
  timestamp.
- The DNS and relay targets publish no host ports and have no internet egress; the
  toolbox is limited to TCP connect scans.
