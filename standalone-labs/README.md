# Standalone Recon & Linux Labs

These exercises are **separate, self-contained labs**. They do not extend the
18-lab portal catalog in `data/labs.json`. Each numbered directory owns its own
manifest, Docker Compose topology, synthetic targets, walkthrough, and smoke
test. Starting, stopping, or resetting one lab never operates on another lab.

> **New here?** Start with the **[beginner setup guide](GETTING-STARTED.md)** — it
> walks you through installing Node.js and Docker, the two-terminal workflow, and
> playing your first lab end to end, then hands off to each lab's own README.

## Available labs

| ID | Focus |
| --- | --- |
| `01-network-triage` | Network baseline, host resolution, TCP connect scanning |
| `02-service-fingerprint` | Service and version fingerprinting across multiple ports |
| `03-dns-breadcrumbs` | DNS enumeration and record breadcrumbs |
| `04-zone-transfer` | DNS zone transfer (AXFR) against a synthetic authority |
| `05-linux-evidence` | Linux host evidence and artifact triage |
| `06-signals-capstone` | Multi-step DNS → scan → HTTP signals capstone |
| `07-web-breach-chain` | Recon → reflected XSS → JWT alg:none privesc → chained root proof |
| `08-cipher-locker` | Layered-encoding artifact recovery and checksum verification |
| `09-content-discovery` | Web content discovery: robots.txt, exposed `.git`, and backup files |

Each lab is independent. Numeric prefixes are stable IDs, not a strict difficulty
ramp; do not infer prerequisite relationships from the directory number alone.

## Recommended learning order

For a first pass, use this order:

```text
01 → 02 → 03 → 04 → 05 → 09 → 08 → 06 → 07
```

Labs 06 and 07 are capstones, so save them until after the foundational
reconnaissance, evidence, content-discovery, and artifact-recovery exercises.

## Requirements and safety boundary

- Node.js 22.13 or newer (`node -v`)
- Docker Engine/Desktop with Docker Compose v2
- A writable Docker data location for the first toolbox image build

Every lab network is internal. Target services do not publish host ports. The
toolbox runs as UID/GID `10001`, drops capabilities, and is intended only for
the synthetic services named by that lab. Never reuse the commands against a
public address or a system you do not own and have explicit permission to test.
Read the [local range threat model](../docs/THREAT-MODEL.md) for the trust
boundary: local flags support progress consistency, not secrecy from the machine
owner.

## Lab controller

Run commands from the repository root:

```text
node scripts/standalone-labctl.mjs list
node scripts/standalone-labctl.mjs start <lab-id>
node scripts/standalone-labctl.mjs shell <lab-id>
node scripts/standalone-labctl.mjs status <lab-id>
node scripts/standalone-labctl.mjs verify <lab-id> <objective-id> 'RLAB{...}'
node scripts/standalone-labctl.mjs smoke <lab-id>
node scripts/standalone-labctl.mjs reset <lab-id>
node scripts/standalone-labctl.mjs stop <lab-id>
```

`start` creates new HMAC-derived flags for that run and stores them in the
ignored `standalone-labs/.runtime/<lab-id>/flags.env` file. Targets receive only
their required flags; the learner toolbox does not. `verify` checks the submitted
flag locally and enforces objective dependencies. `reset` removes only the
selected Compose project and its volumes, rotates its flags, clears its progress,
and starts it again.

The lab ID is resolved through a checked-in `lab.json`; it is never treated as a
path or a Docker argument. All Compose paths, project names, service names, and
commands are fixed by the controller.

## Suggested workflow

1. Use `list`, choose one lab, and read that lab's `README.md`.
2. Run `start`, then enter the toolbox with `shell`.
3. Work through the objectives in order and submit each discovered flag with
   `verify` from a second terminal.
4. Use `reset` for a clean run or `stop` when finished.

`smoke` is a maintainer/CI command. It transiently supplies expected values to
the read-only smoke script inside the toolbox; it is not part of the learner
solution path.
