# Authentication and authorization curriculum branch

This branch follows Lab 07 and turns its simulated unsigned-token failure into defensive validation work. Every lab is self-contained, local-only, uses synthetic identities and records, and requires both an invalid-case rejection and a valid-case success. Labs never depend on another lab's running containers or generated flags.

| Lab | Difficulty band | Focus | Required remediation proof |
| --- | --- | --- | --- |
| 11 — Claims Under Oath | intermediate-foundations | JWT signature, algorithm allowlist, issuer, audience, expiry, active key and role | Invalid fixtures fail for the right reason; the valid token succeeds |
| 12 — Session Boundaries | intermediate-foundations | Cookie attributes, fixation, rotation, logout invalidation and scope | Hardened session rotates and cannot be reused after logout |
| 13 — Request Integrity | intermediate-foundations | CSRF token, SameSite assumptions, Origin checks and state-changing requests | Cross-origin/missing-token requests fail while a valid request succeeds |
| 14 — Object Boundaries | intermediate-capstone | IDOR/BOLA, tenant ownership, read/write authorization | Cross-user object reads and writes fail; owner operations still work |
| 15 — Policy at Every Door | intermediate-capstone | RBAC/ABAC, method/path consistency, deny-by-default | An authorization matrix is enforced across alternate routes and methods |
| 16 — Replay Window | intermediate-capstone | Logout, password-change invalidation, refresh rotation and replay | Captured credentials fail after lifecycle events; refresh tokens are one-use |
| 17 — Close the Trust Chain | intermediate-capstone | Correlated JWT, cookie, CSRF, BOLA, role and replay evidence | Hardened controls break the former chain without blocking legitimate access |

## Prerequisites

Learners should complete Labs 01–02 and Lab 07. They should understand HTTP request/response structure, headers, cookies, JSON, shell variables, Base64url JWT segments, and the difference between a controlled simulation and a real victim browser.

## Shared acceptance contract

1. The target is reachable only on an internal Docker network from its toolbox.
2. The target and toolbox run non-root, read-only, capability-dropped and without internet egress.
3. Each task has starting evidence, an expected observation, three progressive hints, an understanding check and a complete working solution.
4. Generated flags are progress markers and are never exposed to the normal learner toolbox environment.
5. Every final task includes Finding, Evidence source, Impact, Confidence and Recommended remediation prompts.
6. Remediation is tested with positive and negative requests; rejecting everything is not a passing control.
7. Technical conclusions state the demonstrated boundary and do not claim operating-system or external-account compromise.
