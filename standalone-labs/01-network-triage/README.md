# Lab 01 — First Contact at Northstar Shipping

**Level:** Complete beginner

**Mode:** Guided investigation

**Time:** 35–45 minutes

**Skills:** network basics, hostnames, ports, HTTP, raw TCP

## Scenario

It is your first shift on Northstar Shipping's security team. A monitoring agent
stopped reporting from a diagnostics server named `triage-node`. The operations
team knows the server hosts several services, but its handover notes are missing.

Your job is to rebuild the service map, inspect each discovered service with the
right client, and give the incident lead one final proof assembled from your
evidence.

The investigation is one connected chain:

```text
your network → resolve triage-node → discover ports → inspect each service → combine evidence
```

Nothing here assumes you already know `nmap`, `curl`, or `nc`. Read the short
tool briefing before starting the objectives.

## What you need to know

- An **IP address** identifies a host on a network.
- A **port** identifies a service on that host, much like a numbered door.
- `getent hosts NAME` asks Linux to resolve a hostname to an IP address.
- `nmap -sT` attempts normal TCP connections and reports which ports accept them.
- Without version detection, Nmap's SERVICE column is a guess based on the port
  number. Confirm the protocol by reading the service's response and handover.
- `curl` speaks HTTP, so use it when a discovered service is a website or API.
- `nc` (netcat) opens a plain TCP connection. Use it when a service sends raw
  text instead of HTTP. In this lab it only reads a banner and then exits.

That is why the workflow changes tools: the scan tells you which doors are open,
and the service type tells you which client can understand what is behind a door.

Begin at the prompt: a terminal accepts commands, and Enter runs one command.
`pwd` shows your folder, `ls` lists files, and `cd` changes folder.

An HTTP URL such as `http://triage-node:8080/network` means protocol, hostname, port, and page path.

`-sT` uses ordinary TCP connections; `-Pn` skips ping discovery; `-p-` checks all TCP ports. This is connection scanning, not packet capture.

`curl -fsS` downloads an HTTP response and reports errors. In `nc -w 3`, `-w` limits waiting to three seconds; `</dev/null` supplies no keyboard input.

Quotes keep a URL's `&` characters together; query fields after `?` send named values. The first flag needs only resolution, a scan, and HTTP; each later service is announced by an earlier response.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first. The commands below start in a **host terminal**.

From the project directory, start the range and enter its toolbox:

```sh
node scripts/standalone-labctl.mjs start 01-network-triage
node scripts/standalone-labctl.mjs shell 01-network-triage
```

Run investigation commands inside the toolbox. Keep a second terminal in the
project directory for `verify` commands. Your authorized scope is only
`triage-node` and `172.28.1.0/24`.

## Objectives

### Flag 1 — Build the network baseline (`network-baseline`)

Answer these questions before submitting the flag:

1. Which subnet is connected to your toolbox?
2. Which IP address belongs to `triage-node`?
3. Which TCP ports are open on it?
4. What does the HTTP `/network` page report?

Save the `segment_token`; it is evidence for the final objective. Submit the
`objective_flag` from the page:

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage network-baseline 'RLAB{...}'
```

### Flag 2 — Identify the unknown TCP service (`service-beacon`)

One discovered port is not a website. Connect to it, identify the banner, and
save its `service_token`. Submit the objective flag returned by that service.

### Flag 3 — Find the operator console (`operator-console`)

Another discovered port serves HTTP. Find the operator page, record its
`operator_token`, and submit its objective flag.

### Flag 4 — Close the triage case (`triage-proof`)

The main web service has a `/final` route. Supply the three tokens collected in
the earlier objectives to prove that your service map is complete.

## Hints

Use hints in order. Stop as soon as you know what to try next.

### Flag 1 — network-baseline

<details>
<summary>Hint 1 — where to look</summary>

Start with `ip -brief addr` and `ip route`; these describe your side of the network.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Resolve the target with `getent hosts triage-node`, then scan it with `nmap -sT -Pn`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The complete command path is `nmap -sT -Pn -p- triage-node`, followed by
`curl http://triage-node:8080/network`.

</details>

### Flag 2 — service-beacon

<details>
<summary>Hint 1 — where to look</summary>

Review the open ports. The raw TCP beacon is the service on port `9090`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

HTTP clients expect HTTP syntax; netcat simply shows bytes sent by a TCP server.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `nc -w 3 triage-node 9090 </dev/null`.

</details>

### Flag 3 — operator-console

<details>
<summary>Hint 1 — where to look</summary>

The remaining HTTP service is on port `7070`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The page name matches the people who maintain the server.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `curl http://triage-node:7070/operator`.

</details>

### Flag 4 — triage-proof

<details>
<summary>Hint 1 — where to look</summary>

This objective checks evidence from all three earlier services; it does not require a new scan.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The query parameter names are `segment`, `beacon`, and `operator`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Request `/final?segment=...&beacon=...&operator=...` on port `8080`.

</details>

## Solution

Try the objectives and hints first. The commands below are the complete path.

### 1. Establish the baseline (`network-baseline`)

**Toolbox:**

```sh
ip -brief addr
ip route
getent hosts triage-node
nmap -sT -Pn -p- triage-node
curl -fsS http://triage-node:8080/network
```

Record `segment_token=...` and verify the displayed `objective_flag`.

Expected observations: the toolbox is on 172.28.1.0/24, triage-node resolves to
172.28.1.20, and ports 7070, 8080, and 9090 are open. The SERVICE column may show
realserver, http-proxy, and zeus-admin; these are port-name guesses. The network
handover explicitly identifies 9090 as plain TCP and tells you to use nc.
No default internet route is expected in this isolated network.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage network-baseline 'RLAB{...}'
```

### 2. Read the raw TCP beacon (`service-beacon`)

**Toolbox:**

```sh
nc -w 3 triage-node 9090 </dev/null
```

`nc` is used here because port `9090` returns a plain-text TCP banner, not an
HTTP response. Record `service_token=...` and verify the displayed flag.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage service-beacon 'RLAB{...}'
```

### 3. Read the HTTP operator console (`operator-console`)

**Toolbox:**

```sh
curl -fsS http://triage-node:7070/operator
```

Record `operator_token=...` and verify the displayed flag.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage operator-console 'RLAB{...}'
```

### 4. Combine the evidence (`triage-proof`)

**Toolbox:**

```sh
curl -fsS 'http://triage-node:8080/final?segment=<segment-token>&beacon=<service-token>&operator=<operator-token>'
```

Replace each placeholder with the value you recorded, then verify the returned
`final_flag`:

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage triage-proof 'RLAB{...}'
```

## What this taught you

Next: Lab 02. Record a one-sentence explanation of how your evidence led to each new command before moving on.

You did not use disconnected commands. You followed a normal triage decision
tree: understand your network, resolve the named asset, discover services, choose
a protocol-appropriate client, and correlate the evidence. Defenders can detect
similar scans as bursts of connection attempts and reduce exposure with network
segmentation, host firewalls, and fewer diagnostic listeners.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 01-network-triage
node scripts/standalone-labctl.mjs stop 01-network-triage
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 01-network-triage
```
