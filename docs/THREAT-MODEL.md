# Local range threat model

## Intended environment

RECON//LAB is a single-user local teaching range. Its security controls are for
containment: they protect the host and external networks from the synthetic
exercise environment. They are not designed to establish a secrecy boundary
between a learner and a range running on that learner's own machine.

Portal services and the terminal publish only loopback ports, while target
networks are internal Docker networks. Containers use reduced privileges and
read-only filesystems where practical. These controls reduce accidental exposure;
they do not authorize use of the included tools beyond the named synthetic targets.

## Flags and progress

Flags are progress consistency checks, not secrecy. They confirm that a submitted
value belongs to the current local run and allow the controllers to enforce
objective dependencies and record progress. A machine owner can inspect source,
runtime env files, containers, and smoke scripts; that inspection is expected in a
local learning environment, not treated as a product failure.

The controllers still limit unnecessary flag distribution:

- Standalone targets should continue receiving only their own flags, and the
  learner toolbox should not receive target flag files as part of the normal path.
- The portal's all-flags mount is accepted for the shared simulator because all
  18 portal modules share one range. Avoid accidental route leakage that exposes
  unrelated proofs through an exercise's intended interface.

## Non-goals and reporting

This project does not provide multi-user isolation, anti-cheat controls, secret
protection from a host owner, or a platform for attacks against real systems. If
a change creates a host escape, external network path, non-loopback published
port, or unintended cross-exercise route exposure, treat it as a safety defect and
report it rather than relying on the local-only threat model.
