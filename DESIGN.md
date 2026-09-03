# RECON//LAB architecture record

## Scope

RECON//LAB is a **single-user local range** for guided cybersecurity practice. It
runs on the learner's own machine and is designed for repeatable learning, not
for shared hosting or adversarial competition.

## Deployment models

- **Portal shared range:** the portal presents 18 guided modules backed by one
  local Docker Compose deployment: `gateway`, `recon-node`, `internal`, and
  `toolbox`. Every portal module uses this same target range. Starting, stopping,
  or resetting it affects every portal module.
- **Standalone labs:** each `standalone-labs/01-*` through `09-*` directory is an
  independent Compose project with its own manifest, lifecycle, generated flags,
  progress, targets, and toolbox session. Operating one standalone lab does not
  operate another or the portal range.

## Safety boundary

All targets, data, credentials, and flags are synthetic. Target networks are
internal, services use non-root users and restrictive container settings where
practical, and host-exposed portal, controller, target-browser, and terminal
ports bind to loopback. Learners must use the supplied tools only against the
range services named by the current exercise.

Some lessons intentionally use guided simulations rather than high-fidelity
services when real exploitation would create unnecessary host risk or complexity.
Those simulations should state their boundary plainly while still teaching the
advertised observation, decision, or remediation skill.

## State, flags, and lifecycle ownership

The local controller owns portal lifecycle operations and stores portal progress,
notes, and per-run proofs in ignored `.lab/` state. The standalone controller
owns one selected standalone project's start, stop, reset, verification, and
ignored runtime state. Flags support progress consistency and dependency-aware
verification; they are not secrets from the machine owner. See
[the threat model](docs/THREAT-MODEL.md) for the trust boundary and expected
inspection paths.

## Non-goals

- Multi-user hosting or tenant isolation.
- Anti-cheat guarantees or hiding answers from a learner who controls the host.
- Attacks, scanning, or payloads against real systems.
- Replacing every safe teaching simulation with a production-equivalent service.
