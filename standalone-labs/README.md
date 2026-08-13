# Standalone Recon & Linux Labs

These exercises are **separate, self-contained labs**. They do not extend the
18-lab portal catalog in `data/labs.json`. Each numbered directory owns its own
manifest, Docker Compose topology, synthetic targets, walkthrough, and smoke
test. Starting, stopping, or resetting one lab never operates on another lab.

## Requirements and safety boundary

- Node.js 22 or newer
- Docker Engine/Desktop with Docker Compose v2
- Enough disk space to build the shared Kali toolbox on first use

Every lab network is internal. Target services do not publish host ports. The
toolbox runs as UID/GID `10001`, drops capabilities, and is intended only for
the synthetic services named by that lab. Never reuse the commands against a
public address or a system you do not own and have explicit permission to test.

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
