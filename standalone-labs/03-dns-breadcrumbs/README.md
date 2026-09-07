# Lab 03 — The Ghost Service in DNS

**Level:** Beginner

**Mode:** Guided investigation

**Time:** 40–50 minutes

**Recommended first:** Labs 01–02

**Skills:** DNS record types, name correlation, service discovery, HTTP follow-up

## Scenario

Northstar Shipping's inventory has no record of an old operations vault, but a
retired dashboard still refers to `entry.recon.test`. You have been asked to
follow only the organization's internal DNS data and determine whether that name
leads to a live service.

This time, you are not scanning randomly. Every DNS answer tells you what to ask
next:

```text
alias → address → mail record → service record → reverse check → hidden web service
```

## What you need to know

- `CNAME` maps an alias to a canonical hostname.
- `A` and `AAAA` map a hostname to IPv4 and IPv6 addresses.
- `MX` names a domain's mail server.
- `SRV` advertises a service hostname and port.
- `PTR` maps an IP address back to a hostname.
- `TXT` stores text metadata. In real environments it often contains ownership
  or policy data; this range also uses it for objective evidence.
- `dig @SERVER -p PORT NAME TYPE` asks a specific DNS server for one record type.

The lab DNS server uses port `5353` because its unprivileged container cannot
bind the usual DNS port `53`.

`nslookup` is another DNS query client. `+short` keeps dig output compact. Ask for TXT metadata on a discovered name; it can explain who owns it and where to investigate next. Only the advertised IPv4 vault is live: the mail and IPv6 records are synthetic metadata, not additional listening services.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

```sh
node scripts/standalone-labctl.mjs start 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs shell 03-dns-breadcrumbs
```

Use the toolbox for investigation and a second project terminal for verification.
Scope is only `dns-lab`, `hidden-web`, and `172.28.3.0/24`.

## Objectives

### Flag 1 — Follow the address trail (`address-trail`)

Start with `entry.recon.test`. Find its canonical name, its address records, and
the related TXT evidence. Record `address_token` and submit the objective flag.

### Flag 2 — Explain the mail route (`mail-trail`)

Identify the mail exchanger for `recon.test`, resolve it, and inspect its TXT
record. Record `mail_token` and submit its objective flag.

### Flag 3 — Locate the operations service (`service-trail`)

Find the `_ops._tcp` service record. Confirm the disclosed target with both
forward and reverse DNS, then collect its TXT evidence and `service_token`.

### Flag 4 — Reach the ghost service (`dns-proof`)

Use the hostname, IP, and port learned from DNS. Send all three recorded tokens
to its final HTTP route.

## Hints

### Flag 1 — address-trail

<details>
<summary>Hint 1 — where to look</summary>

Ask specifically for the `CNAME` of `entry.recon.test`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Query the returned hostname for `A`, `AAAA`, and `TXT` records.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Use `dig @dns-lab -p 5353 atlas.recon.test TXT +short` for the evidence.

</details>

### Flag 2 — mail-trail

<details>
<summary>Hint 1 — where to look</summary>

An `MX` record tells you the mail hostname, not necessarily its IP.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Query `recon.test MX`, then query the returned mail host for `A` and `TXT`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The evidence is in `mail.recon.test TXT`.

</details>

### Flag 3 — service-trail

<details>
<summary>Hint 1 — where to look</summary>

SRV names begin with `_service._transport`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Query `_ops._tcp.recon.test SRV`; its answer includes a port and target.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Confirm `vault.ops.recon.test`, reverse-query `172.28.3.30`, then read the target's TXT record.

</details>

### Flag 4 — dns-proof

<details>
<summary>Hint 1 — where to look</summary>

The SRV answer identifies an HTTP listener on port `8088`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The final endpoint needs `address`, `mail`, and `service` parameters.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Request `http://172.28.3.30:8088/final?address=...&mail=...&service=...`.

</details>

## Solution

### 1. Follow the alias (`address-trail`)

**Toolbox:**

```sh
dig @dns-lab -p 5353 entry.recon.test CNAME +short
dig @dns-lab -p 5353 atlas.recon.test A +short
dig @dns-lab -p 5353 atlas.recon.test AAAA +short
dig @dns-lab -p 5353 atlas.recon.test TXT +short
```

Record `address_token` from the TXT response.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs address-trail 'RLAB{...}'
```

### 2. Map mail DNS (`mail-trail`)

**Toolbox:**

```sh
nslookup -port=5353 -type=MX recon.test dns-lab
dig @dns-lab -p 5353 mail.recon.test A +short
dig @dns-lab -p 5353 mail.recon.test TXT +short
```

Record `mail_token`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs mail-trail 'RLAB{...}'
```

### 3. Map and confirm the service (`service-trail`)

**Toolbox:**

```sh
dig @dns-lab -p 5353 _ops._tcp.recon.test SRV +short
dig @dns-lab -p 5353 vault.ops.recon.test A +short
nslookup -port=5353 -type=PTR 172.28.3.30 dns-lab
dig @dns-lab -p 5353 vault.ops.recon.test TXT +short
```

Record `service_token`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs service-trail 'RLAB{...}'
```

### 4. Follow DNS to HTTP (`dns-proof`)

**Toolbox:**

```sh
curl -fsS 'http://172.28.3.30:8088/final?address=<address-token>&mail=<mail-token>&service=<service-token>'
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 03-dns-breadcrumbs dns-proof 'RLAB{...}'
```

## What this taught you

Next: Lab 04. Record a one-sentence explanation of how your evidence led to each new command before moving on.

DNS is a connected data model, not a list of trivia. Aliases, address records,
mail routes, service advertisements, and reverse names can reveal systems that
never appear in a web navigation menu. Defenders should use appropriate internal
DNS views, minimize unnecessary TXT/SRV disclosure, and audit stale records.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs stop 03-dns-breadcrumbs
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 03-dns-breadcrumbs
```
