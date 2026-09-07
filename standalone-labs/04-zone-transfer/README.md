# Lab 04 — The Acquired Company DNS Leak

**Level:** Beginner–intermediate

**Mode:** Guided challenge

**Time:** 40–50 minutes

**Recommended first:** Lab 03

**Skills:** authoritative DNS, SOA/NS records, AXFR, virtual hosts

## Scenario

Northstar Shipping has acquired a small logistics company that owns the internal
domain `range.test`. During integration, the new DNS server was configured from
an old template. Your manager suspects it may reveal the entire internal zone to
any client on the network.

Validate the suspicion, determine what the disclosure exposes, and follow the
leaked hostname to the affected archive application:

```text
identify authority → test zone transfer → inspect leaked records → reach virtual host → report
```

## What you need to know

- An `SOA` record describes a DNS zone and names its primary authority.
- An `NS` record names an authoritative DNS server.
- `AXFR` is a full zone transfer used between authorized DNS servers. If it is
  open to everyone, one request can reveal every hostname and TXT note in a zone.
- A **virtual host** lets one web server host multiple sites. The HTTP `Host`
  header selects which site should answer.
- `tee FILE` shows output and saves the same output as evidence.

`grep` selects lines from saved evidence. `curl -H` sets an HTTP header, `-X POST` sends a report, and `--data-urlencode` safely encodes one form field. A backslash at the end of a Linux command continues it on the next line.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

```sh
node scripts/standalone-labctl.mjs start 04-zone-transfer
node scripts/standalone-labctl.mjs shell 04-zone-transfer
```

Investigate inside the toolbox and verify from a second project terminal. Scope
is only `range.test`, `172.30.44.53`, `172.30.44.80`, and `172.30.44.0/24`.

Each stage returns an `RLAB{...}` flag. Verify it and retain it because the final
case submission also uses the earlier flags.

## Objectives

### Flag 1 — Confirm the authoritative server (`authority`)

Query the zone's SOA and NS information with `dig` or `nslookup`. Find the
`_authority` TXT proof and submit it.

### Flag 2 — Validate the exposure (`axfr`)

Attempt a full zone transfer, save the response, and find the `_axfr-proof`
record. Also record any disclosed host, path, case, and serial values.

### Flag 3 — Inspect the disclosed application (`vhost`)

Reach the archive virtual host and retrieve the proof page named in DNS.

### Flag 4 — Submit the assessment (`final`)

Send the authority, AXFR, and virtual-host flags together with the case metadata
to the archive's final route.

## Hints

### Flag 1 — authority

<details>
<summary>Hint 1 — where to look</summary>

Start with `range.test SOA` and `range.test NS` against `172.30.44.53`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

TXT labels can begin with an underscore.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Query `dig @172.30.44.53 _authority.range.test TXT +short`.

</details>

### Flag 2 — axfr

<details>
<summary>Hint 1 — where to look</summary>

`AXFR` is used in the same position where you normally write `A` or `TXT`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Save the whole answer before filtering it.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `dig @172.30.44.53 range.test AXFR | tee /tmp/range.axfr`, then search for `_axfr-proof`, `_route`, and `_case`.

</details>

### Flag 3 — vhost

<details>
<summary>Hint 1 — where to look</summary>

The transfer discloses `ops-archive.range.test`, its IP, and a proof path.

</details>

<details>
<summary>Hint 2 — what to try</summary>

DNS resolution is not configured globally in the toolbox, so select the site with an HTTP header.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Use `curl -H 'Host: ops-archive.range.test' http://172.30.44.80:8080/proof/blue-team`.

</details>

### Flag 4 — final

<details>
<summary>Hint 1 — where to look</summary>

This is the written finding represented as a POST: all prior evidence plus case metadata.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The fields are `authority`, `axfr`, `vhost`, `case`, and `serial`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The fixed metadata is `case=ZT-44` and `serial=2026081304`.

</details>

## Solution

### 1. Find and verify the authority (`authority`)

**Toolbox:**

```sh
dig @172.30.44.53 range.test SOA
dig @172.30.44.53 range.test NS +short
nslookup -type=ns range.test 172.30.44.53
dig @172.30.44.53 _authority.range.test TXT +short
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer authority 'RLAB{...}'
```

### 2. Transfer and review the zone (`axfr`)

**Toolbox:**

```sh
dig @172.30.44.53 range.test AXFR | tee /tmp/range.axfr
grep '_axfr-proof' /tmp/range.axfr
grep -E '_route|_case' /tmp/range.axfr
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer axfr 'RLAB{...}'
```

### 3. Follow the disclosed virtual host (`vhost`)

**Toolbox:**

```sh
curl -i -H 'Host: ops-archive.range.test' http://172.30.44.80:8080/proof/blue-team
```

Record `vhost_proof`, case `ZT-44`, and serial `2026081304`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer vhost 'RLAB{...}'
```

### 4. Submit the evidence chain (`final`)

**Toolbox:**

```sh
curl -H 'Host: ops-archive.range.test' -X POST \
  --data-urlencode 'authority=<authority-flag>' \
  --data-urlencode 'axfr=<axfr-flag>' \
  --data-urlencode 'vhost=<vhost-flag>' \
  --data-urlencode 'case=ZT-44' \
  --data-urlencode 'serial=2026081304' \
  http://172.30.44.80:8080/final
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 04-zone-transfer final 'RLAB{...}'
```

## What this taught you

Next: Lab 05. Record a one-sentence explanation of how your evidence led to each new command before moving on.

The weakness is not “DNS exists”; it is that an administrative replication
operation trusts an unauthorized client. Restrict AXFR with allowlists and TSIG,
separate public and internal views, and treat every disclosed hostname and note
as exposed.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 04-zone-transfer
node scripts/standalone-labctl.mjs stop 04-zone-transfer
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 04-zone-transfer
```
