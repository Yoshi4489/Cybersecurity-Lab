# Lab 02 — Service Fingerprint: Ports Tell Stories

Practice a full **port inventory**, **service/version detection**, saving durable
evidence with `-oA`, and running **safe NSE scripts** against a synthetic service
farm. Everything runs inside an isolated, offline Docker network; all data is
**synthetic**.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 02-service-fingerprint
node scripts/standalone-labctl.mjs shell 02-service-fingerprint
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder for `verify`. Authorized scope is `172.28.2.0/24` only.

## What you're collecting

Each stage reveals a `*_token=...` value (save these for the final URL) and an
`objective_flag=RLAB{...}` value (submit this with `verify`). Objectives are gated
in order: `full-port-map → version-ledger → http-metadata → fingerprint-proof`.

## Walkthrough

### 1. Full port scan with saved evidence (`full-port-map`)

Connect-scan every TCP port and save all three output formats to the toolbox's
scratch space, then open the HTTP inventory page:

```sh
nmap -sT -Pn -p- --min-rate 500 -oA /tmp/service-farm-full service-farm
ls -l /tmp/service-farm-full.*        # .nmap, .gnmap, .xml
grep '/open/' /tmp/service-farm-full.gnmap
curl -fsS http://service-farm:8000/   # HTML prints port_token + objective_flag
```

Save `port_token=...`, then verify the flag (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint full-port-map 'RLAB{...}'
```

### 2. Fingerprint the version banner (`version-ledger`)

Run version detection on the open ports, then read the ledger banner on `31337`:

```sh
nmap -sT -Pn -sV -p2222,8000,8443,31337 service-farm
nc -w 3 service-farm 31337 </dev/null   # prints version_token + objective_flag
```

Save `version_token=...`, then verify:

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint version-ledger 'RLAB{...}'
```

### 3. Collect HTTP metadata with safe NSE (`http-metadata`)

Use only the named, safe NSE scripts, then read the response **headers** on `8443`
— that's where this stage's token and flag live:

```sh
nmap -sT -Pn -p2222,31337 --script banner service-farm
nmap -sT -Pn -p8000,8443 --script http-title,http-headers service-farm
curl -fsS -D - -o /dev/null http://service-farm:8443/
```

In the header dump, `X-Lab-Metadata-Token:` is the token to save, and
`X-Objective-Flag:` is the flag to submit:

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint http-metadata 'RLAB{...}'
```

### 4. Submit the correlated fingerprint (`fingerprint-proof`)

Chain the three saved **tokens** into the final endpoint (it withholds the flag if
any artifact is missing):

```sh
curl -fsS 'http://service-farm:8000/final?ports=<port_token>&version=<version_token>&metadata=<metadata_token>'
```

The response prints `final_flag=RLAB{...}` — verify it:

```sh
node scripts/standalone-labctl.mjs verify 02-service-fingerprint fingerprint-proof 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 02-service-fingerprint
node scripts/standalone-labctl.mjs reset  02-service-fingerprint
node scripts/standalone-labctl.mjs stop   02-service-fingerprint
```

`smoke` is a maintainer/CI self-check, not part of the solution path.

## Detection / remediation

- Watch flow logs for one source touching every port in sequence, and application
  logs for NSE-style HTTP probes.
- Minimize version/banner disclosure, disable unused listeners, use a firewall
  allowlist, and separate the management plane from public services.
- No target port is published to the host, and the Docker network is `internal`.
