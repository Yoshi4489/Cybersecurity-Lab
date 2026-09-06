# Lab 02 — The Unmanaged Service Farm

**Level:** Beginner

**Mode:** Guided investigation

**Time:** 40–50 minutes

**Recommended first:** Lab 01

**Skills:** port inventory, service detection, HTTP metadata, evidence files

## Scenario

Northstar Shipping found an unmanaged host named `service-farm` during the first
network review. The asset register lists only “internal tooling,” which is not
enough for a risk decision. Your lead asks for a reproducible service inventory:
every open port, the protocol or product it appears to run, and the web metadata
that could help an attacker identify it.

The evidence chain is:

```text
find every port → identify each protocol → inspect web metadata → submit one inventory
```

## What you need to know

- A quick scan often checks only common ports. `-p-` tells Nmap to check all
  65,535 TCP ports.
- `-sV` sends safe probes to estimate which service/version is listening.
- `-oA NAME` saves normal, grep-friendly, and XML evidence as `NAME.nmap`,
  `NAME.gnmap`, and `NAME.xml`.
- Nmap's `banner`, `http-title`, and `http-headers` scripts collect information;
  they do not exploit the service.
- `curl -D - -o /dev/null URL` prints HTTP response headers without the body.

Each tool answers a different question. First find the doors, then identify what
uses them, then inspect the application-level details.

`ls` lists saved evidence, and `grep` selects matching lines. `nc` is the raw TCP client from Lab 01. `-Pn` skips ping checks, `-p` selects ports, and `--min-rate 500` requests at least 500 scan probes per second in this tiny range. Port numbers are conventions: port 8443 here speaks HTTP, not TLS. A banner is an unverified claim; the SSH banner simulator is not a working SSH server.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

```sh
node scripts/standalone-labctl.mjs start 02-service-fingerprint
node scripts/standalone-labctl.mjs shell 02-service-fingerprint
```

Run investigation commands inside the toolbox and `verify` commands from a
second project terminal. Scope is only `service-farm` and `172.28.2.0/24`.

## Objectives

### Flag 1 — Produce a complete port map (`full-port-map`)

Scan every TCP port, save the results in all Nmap formats, and identify the web
inventory page. Record its `port_token` and submit its objective flag.

### Flag 2 — Identify the versioned service (`version-ledger`)

Use version detection on the ports you found. One high port provides a plain-text
ledger banner. Record its `version_token` and submit its flag.

### Flag 3 — Collect HTTP metadata (`http-metadata`)

Use safe scripts and HTTP headers to identify titles and server metadata. Record
the `X-Lab-Metadata-Token` value and submit the `X-Objective-Flag` header.

### Flag 4 — Deliver the fingerprint report (`fingerprint-proof`)

Combine the port, version, and metadata tokens in the final inventory endpoint.

## Hints

<details>
<summary>Hints for Flag 1 — full-port-map</summary>

1. A default Nmap scan is not a complete port inventory.
2. Use `-p-` for all ports and `-oA /tmp/service-farm-full` to keep evidence.
3. After scanning, request `http://service-farm:8000/`.

</details>

<details>
<summary>Hints for Flag 2 — version-ledger</summary>

1. Add `-sV` to the scan of the open ports.
2. Port `31337` is a raw banner, so use the same simple TCP client introduced in Lab 01.
3. Run `nc -w 3 service-farm 31337 </dev/null`.

</details>

<details>
<summary>Hints for Flag 3 — http-metadata</summary>

1. The two HTTP-like ports are `8000` and `8443`.
2. Try Nmap scripts `http-title,http-headers`; then inspect port `8443` directly.
3. Run `curl -fsS -D - -o /dev/null http://service-farm:8443/` and read the `X-` headers.

</details>

<details>
<summary>Hints for Flag 4 — fingerprint-proof</summary>

1. Reuse the three tokens; no further scanning is required.
2. The final parameters are `ports`, `version`, and `metadata`.
3. Send them to `http://service-farm:8000/final` as query parameters.

</details>

## Solution

### 1. Map and save every port (`full-port-map`)

**Toolbox:**

```sh
nmap -sT -Pn -p- --min-rate 500 -oA /tmp/service-farm-full service-farm
ls -l /tmp/service-farm-full.*
grep '/open/' /tmp/service-farm-full.gnmap
curl -fsS http://service-farm:8000/
```

Record `port_token` and verify the returned flag:

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint full-port-map 'RLAB{...}'
```

### 2. Identify the non-HTTP banner (`version-ledger`)

**Toolbox:**

```sh
nmap -sT -Pn -sV -p2222,8000,8443,31337 service-farm
nc -w 3 service-farm 31337 </dev/null
```

Record `version_token` and verify the objective flag.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint version-ledger 'RLAB{...}'
```

### 3. Inspect HTTP metadata (`http-metadata`)

**Toolbox:**

```sh
nmap -sT -Pn -p2222,31337 --script banner service-farm
nmap -sT -Pn -p8000,8443 --script http-title,http-headers service-farm
curl -fsS -D - -o /dev/null http://service-farm:8443/
```

Record `X-Lab-Metadata-Token` and verify `X-Objective-Flag`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint http-metadata 'RLAB{...}'
```

### 4. Correlate the inventory (`fingerprint-proof`)

**Toolbox:**

```sh
curl -fsS 'http://service-farm:8000/final?ports=<port-token>&version=<version-token>&metadata=<metadata-token>'
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint fingerprint-proof 'RLAB{...}'
```

## What this taught you

Next: Lab 03. Record a one-sentence explanation of how your evidence led to each new command before moving on.

A port number is only an initial clue. Reliable enumeration keeps raw evidence,
identifies protocols, and checks application metadata before drawing a conclusion.
Defenders should limit unnecessary listeners, reduce version disclosure, segment
management services, and alert on broad connection patterns.

## Stop or reset

```sh
node scripts/standalone-labctl.mjs status 02-service-fingerprint
node scripts/standalone-labctl.mjs reset 02-service-fingerprint
node scripts/standalone-labctl.mjs stop 02-service-fingerprint
```
