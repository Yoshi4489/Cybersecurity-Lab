# RECON//LAB architecture record

## Scope

RECON//LAB is an **account-based local-only range** for guided cybersecurity
practice. Trusted learners share one computer, with separate progress and
instances. It is not designed for public hosting or adversarial competition.

## Deployment models

- **Current curriculum:** the default portal presents eleven investigations,
  Labs 00–10. Each learner starts a private Compose project, with generated flags,
  a dynamically allocated subnet, an embedded toolbox terminal, and account-owned
  progress. There is one active instance per account and two per host by default.
  A 60-minute lease can be extended once by 30 minutes. Stopping preserves progress;
  resetting creates a new generation. See [local instances](docs/LOCAL-INSTANCES.md).
- **Legacy portal shared range:** `/legacy` presents 18 guided modules backed by one
  local Docker Compose deployment: `gateway`, `recon-node`, `internal`, and
  `toolbox`. Every portal module uses this same target range. Starting, stopping,
  or resetting it affects every portal module.
- **CLI compatibility:** `standalone-labs/00-*` through `10-*` supply the current
  curriculum sources. After account setup, their CLI uses the controller's same
  lifecycle queue and account progress. Pre-account runtime is backed up and
  imported into the first administrator without rotating its flags.

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

The local controller owns account sessions, lifecycle operations, understanding
checks, and progress in ignored `.lab/accounts.sqlite` state. Run-specific Compose
files and source snapshots live in `.lab/instances/`. The original shared-range
state remains separate for legacy compatibility. Flags support progress consistency and dependency-aware
verification; they are not secrets from the machine owner. See
[the threat model](docs/THREAT-MODEL.md) for the trust boundary and expected
inspection paths.

## Non-goals

- Public multi-user hosting or hostile-tenant isolation.
- Anti-cheat guarantees or hiding answers from a learner who controls the host.
- Attacks, scanning, or payloads against real systems.
- Replacing every safe teaching simulation with a production-equivalent service.
