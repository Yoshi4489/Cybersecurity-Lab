# Lab 01 — Network Triage: First Contact

Practice building a **network baseline** from a Linux toolbox and using a **TCP
connect scan** (`nmap -sT`) to explore a target inside an isolated, offline Docker
network. Every hostname, IP, token, and flag is **synthetic** and exists only for
this lab.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 01-network-triage
node scripts/standalone-labctl.mjs shell 01-network-triage
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder — that's where you submit flags with `verify`. Run the recon commands below
inside the toolbox; run each `verify` in the second terminal. Authorized scope is
`172.28.1.0/24` only — don't point these commands at any other system.

## What you're collecting

Each stage shows you **two** things:

- a `*_token=...` value — save these; you'll chain them into the final URL.
- an `objective_flag=RLAB{...}` value — this is what you submit with `verify`.

Objectives are gated in order: `network-baseline → service-beacon →
operator-console → triage-proof`.

## Walkthrough

### 1. Map the network and read the discovery page (`network-baseline`)

Look at your interfaces, routes, local listeners, and name resolution, then scan
the target and read its `/network` page:

```sh
ip -brief addr                       # your addresses
ip route                             # your routes
ss -lntup                            # local listening sockets
getent hosts triage-node             # resolve the target name to an IP
nmap -sT -Pn -p- triage-node         # TCP connect scan, all ports
curl -fsS http://triage-node:8080/network
```

The `curl` output prints `segment_token=...` (save it) and
`objective_flag=RLAB{...}`. Submit the flag (second terminal):

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage network-baseline 'RLAB{...}'
```

### 2. Read the raw TCP beacon (`service-beacon`)

Your full-port scan revealed a raw service on `9090`. Read its banner:

```sh
nc -w 3 triage-node 9090 </dev/null   # prints service_token + objective_flag
```

Save `service_token=...`, then verify the flag:

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage service-beacon 'RLAB{...}'
```

### 3. Find the operator console (`operator-console`)

Another port hosts a second HTTP console on `7070`:

```sh
curl -fsS http://triage-node:7070/operator   # prints operator_token + objective_flag
```

Save `operator_token=...`, then verify:

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage operator-console 'RLAB{...}'
```

### 4. Chain the three tokens into the final proof (`triage-proof`)

Feed the three saved **tokens** to the `/final` route. It answers `403` until all
three match:

```sh
curl -fsS 'http://triage-node:8080/final?segment=<segment_token>&beacon=<service_token>&operator=<operator_token>'
```

Replace each `<...>` with the token value you saved. The response prints
`final_flag=RLAB{...}` — verify it:

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage triage-proof 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 01-network-triage   # see progress
node scripts/standalone-labctl.mjs reset  01-network-triage   # fresh flags, clean run
node scripts/standalone-labctl.mjs stop   01-network-triage   # shut it down
```

`smoke` (`node scripts/standalone-labctl.mjs smoke 01-network-triage`) is a
maintainer/CI self-check that auto-solves the lab; it is not part of learning.

## Detection / remediation

- Scanning every TCP port creates a burst of short-lived connection attempts.
  Firewall and flow logs can reveal that fan-out pattern.
- Reduce exposure with network segmentation, host firewalls, authenticated service
  discovery, and by shutting down unnecessary diagnostic listeners.
- This lab intentionally has no outbound route, publishes no target host ports, and
  every container drops all Linux capabilities.
