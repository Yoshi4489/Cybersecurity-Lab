# Northstar Shipping: Beginner Security Labs

Ten independent local investigations teach you how evidence leads to the next
question and the next command. Start with the [setup guide](GETTING-STARTED.md).
Read these investigations and submit flags in the portal at `/labs`. The original
shared range still contains eighteen separate modules.

## Learning path

Follow this order: **01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09**.

| Lab | Investigation | Mode | You learn |
| --- | --- | --- | --- |
| [01](01-network-triage/README.md) | First Contact | Guided | Hosts, ports, HTTP, and raw TCP |
| [02](02-service-fingerprint/README.md) | Unmanaged Service Farm | Guided | Inventory, versions, saved evidence |
| [03](03-dns-breadcrumbs/README.md) | Ghost Service in DNS | Guided | Aliases, addresses, mail and service records |
| [04](04-zone-transfer/README.md) | Acquired Company DNS Leak | Guided | AXFR and virtual hosts |
| [05](05-linux-evidence/README.md) | Incident EV-55 | Guided | Hashes, files, logs, printable artifacts |
| [06](06-signals-capstone/README.md) | Signals in the Noise | Midpoint capstone | Correlate DNS, scans, artifacts and logs |
| [07](07-web-breach-chain/README.md) | Support Desk Incident | Challenge | Web discovery, XSS simulation, JWT trust |
| [08](08-cipher-locker/README.md) | Recovered Cache | Challenge | Encoding, integrity and artifact analysis |
| [09](09-content-discovery/README.md) | Close the Breach | Final capstone | Deployment leaks and export evidence |
| [10](10-message-recovery/README.md) | The Mislabelled Secret | Guided elective | Base64, hex, ROT13, MD5 dictionary matching, toy XOR |

Numeric prefixes remain stable IDs. The rebuilt curriculum now follows numeric
order; 06 and 09 are the capstones. Prerequisites are recommendations, not startup
locks. Labs 01–06 form Northstar's infrastructure review; 07–09 form the
ApertureOps incident campaign. Each lab includes its own evidence so earlier
targets can be stopped.

Lab 10 is an optional message-recovery foundations branch available after Lab 01;
you do not need to finish the capstones first. Encoding and hashing are explicitly
distinguished from encryption, using only supplied synthetic training data.

## How to learn

Every README gives a scenario, concepts, objectives, three hints for each flag,
a complete solution, and defensive takeaways. Read concepts first. Try an
objective, reveal one hint if needed, and consult the solution after an attempt.
A correct flag is a progress checkpoint; also write down what the evidence means.

## Commands

Run these in a host terminal from the project directory:

```sh
node scripts/standalone-labctl.mjs list
node scripts/standalone-labctl.mjs start <lab-id>
node scripts/standalone-labctl.mjs shell <lab-id>
node scripts/standalone-labctl.mjs status <lab-id>
node scripts/standalone-labctl.mjs verify <lab-id> <objective-id> 'RLAB{...}'
node scripts/standalone-labctl.mjs reset <lab-id>
node scripts/standalone-labctl.mjs stop <lab-id>
```

After shell opens, that terminal is the Linux toolbox. Use a second host terminal
for verify. Start creates flags on the first run and resumes existing flags and
progress on later runs, including after stop. Reset clears only the selected
lab's progress and rotates its flags. Use reset for a fresh attempt at the rebuilt
curriculum. Old directory IDs and objective IDs still work.

## Runtime and trust

Use Node 22.13+ and Docker Desktop/Engine with Compose v2. Targets remain
unprivileged, capability-dropped, read-only, and on internal networks without
published target ports. They receive only flags needed for their own stage or
report validation. The normal learner toolbox receives no expected flags.

The [local range threat model](../docs/THREAT-MODEL.md) explains why local flags
support progress consistency rather than secrecy from the owner of the machine.
XSS review and application privilege demonstrations are labeled simulations.
No external account, real victim, or internet target is part of the curriculum.

Maintainers can run `node scripts/standalone-labctl.mjs smoke <lab-id>`.
It temporarily supplies expected flags to assert the solution and negative
cases. It is an automated test, not a learner step. See the
[design research](../docs/CURRICULUM-DESIGN.md) for the teaching rationale.
