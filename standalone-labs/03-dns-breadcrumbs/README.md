# Lab 03 — DNS Breadcrumbs: Follow the Records

Practice correlating several kinds of **DNS records** with `dig` and `nslookup`
until you uncover a hidden HTTP service. All data lives in a synthetic
authoritative DNS server on an isolated, offline Docker network and has nothing to
do with real domains.

> The synthetic DNS server listens on port **`5353`** (so it can run unprivileged),
> so you must add `-p 5353` for `dig` or `-port=5353` for `nslookup`.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs shell 03-dns-breadcrumbs
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder for `verify`. Authorized scope is `172.28.3.0/24` only.

## What you're collecting

Each TXT record holds a `*_token=...` value (save it for the final URL) **and** an
`objective_flag=RLAB{...}` value (submit it with `verify`). Objectives are gated in
order: `address-trail → mail-trail → service-trail → dns-proof`.

## Walkthrough

### 1. Follow the CNAME to the address records (`address-trail`)

Start from the alias in your brief, follow the CNAME to the canonical name, then
read its A, AAAA, and TXT records:

```sh
dig @dns-lab -p 5353 entry.recon.test CNAME +short     # -> atlas.recon.test
dig @dns-lab -p 5353 atlas.recon.test A +short
dig @dns-lab -p 5353 atlas.recon.test AAAA +short
dig @dns-lab -p 5353 atlas.recon.test TXT +short       # address_token + objective_flag
```

Save `address_token=...`, then verify the flag (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs address-trail 'RLAB{...}'
```

### 2. Correlate the mail route (`mail-trail`)

Find the MX host, then read its A and TXT records:

```sh
nslookup -port=5353 -type=MX recon.test dns-lab
dig @dns-lab -p 5353 mail.recon.test A +short
dig @dns-lab -p 5353 mail.recon.test TXT +short        # mail_token + objective_flag
```

Save `mail_token=...`, then verify:

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs mail-trail 'RLAB{...}'
```

### 3. Resolve the SRV service and confirm it (`service-trail`)

Look up the service via SRV, confirm the target with a forward A and reverse PTR,
then read its TXT record:

```sh
dig @dns-lab -p 5353 _ops._tcp.recon.test SRV +short   # -> vault.ops.recon.test:8088
dig @dns-lab -p 5353 vault.ops.recon.test A +short
nslookup -port=5353 -type=PTR 172.28.3.30 dns-lab
dig @dns-lab -p 5353 vault.ops.recon.test TXT +short   # service_token + objective_flag
```

Save `service_token=...`, then verify:

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs service-trail 'RLAB{...}'
```

### 4. Unlock the hidden HTTP service (`dns-proof`)

The A and SRV records point to `172.28.3.30:8088`. Chain the three saved **tokens**
into its `/final` route (it answers `403` until all three are correct):

```sh
curl -fsS 'http://172.28.3.30:8088/final?address=<address_token>&mail=<mail_token>&service=<service_token>'
```

Copy the `RLAB{...}` from the response and verify it:

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs dns-proof 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs reset  03-dns-breadcrumbs
node scripts/standalone-labctl.mjs stop   03-dns-breadcrumbs
```

`smoke` is a maintainer/CI self-check, not part of the solution path.

## Detection / remediation

- DNS query logs can expose the sequence of record-type lookups and unusual name
  queries used to enumerate a zone.
- Reduce disclosure with split-horizon DNS, keep internal records private, review
  whether TXT/SRV records are necessary, and audit reverse zones.
- The DNS and HTTP targets publish no host ports; the Docker network is `internal`
  with no internet egress.
