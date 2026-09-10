# RECON//LAB Curriculum Remediation Plan

## Goal
Make the current 11-lab curriculum runnable, consistently labeled, easier to operate, and more educationally defensible before further learner testing, then define the next medium-difficulty authentication/authorization branch.

## Current context / assumptions

- Repository: `C:/Users/win/Downloads/Projects/WebApps/Cybersecurity-Lab`.
- Current standalone curriculum: `standalone-labs/00-terminal-basics` through `10-message-recovery`.
- Portal-integrated curriculum is described in `README.md`; curriculum policy is in `docs/CURRICULUM-DESIGN.md`.
- Lab manifests are validated by `tests/standalone-labs.test.mjs`; Docker behavior is exercised by each lab's `smoke.sh` and by `scripts/verify-standalone.mjs`.
- Lab 07 is the immediate blocker. Its README contains the contradictory literal `Bearer ***` in the privilege-escalation hint, while the solution expects a real forged token. The review also found a likely documentation/command issue around the Authorization header, so implementation must reproduce the exact command before changing it.
- Preserve stable lab IDs, objective IDs, flag environment names, CLI syntax, local-only Docker topology, and existing learner progress unless a migration is explicitly designed.
- This is a plan only. No production or curriculum files are changed by this document.

## Architecture / proposed approach

Use a documentation-and-test-first remediation pass, then a curriculum metadata pass, then add the next branch as isolated standalone labs. Keep the existing manifest/objective graph and Docker isolation model; add reusable documentation templates and evidence fields instead of introducing a second runtime or scoring system. All behavior changes follow RED → GREEN → REFACTOR, with targeted unit/smoke tests before full-suite verification.

---

# 1. TRIAGE

## 1.1 Blocking issues

| ID | Issue | Severity | Effort | Scope |
|---|---|---:|---:|---|
| B1 | Lab 07 privilege-escalation and final-request instructions use a literal `Bearer ***` instead of an actual token variable/value. | P0 | Small | `standalone-labs/07-web-breach-chain/README.md`, related smoke/verification coverage |
| B2 | Lab 07 documented commands must be exercised end-to-end to detect quoting, malformed header, or token-construction errors; current review indicates the exact learner path may fail even beyond the placeholder. | P0 | Medium | Lab 07 Docker implementation, README, `smoke.sh`, tests |
| B3 | Lab 07's simulated XSS boundary must be made explicit in every learner-facing path so the exercise does not claim real browser/session compromise. | P1 | Small | Lab 07 README, task metadata, portal lesson content if duplicated |

## 1.2 Structural issues

| ID | Issue | Severity | Effort | Scope |
|---|---|---:|---:|---|
| S1 | Difficulty labels do not match cognitive load: Lab 02 is above basic beginner; Labs 03–05 are intermediate foundations; Labs 06–09 are intermediate/capstone; Lab 10 is intermediate crypto foundations. | P1 | Small | `standalone-labs/*/lab.json`, lab READMEs, `standalone-labs/README.md`, `README.md`, curriculum catalog/rendering |
| S2 | HOST / TOOLBOX / PORTAL terminology is inconsistent or repeated differently across labs, creating command-location errors. | P1 | Medium | All current lab READMEs, `standalone-labs/GETTING-STARTED.md`, shared docs |
| S3 | The project structure implies `HINTS.md` and `SOLUTION.md` may exist, but learner content is embedded in README files and the expected files are absent. | P2 | Small | All standalone lab directories, documentation tests, README references |
| S4 | Lab 10 placement/description is inconsistent: the root README calls it optional after Lab 01, while the curriculum can be read as a linear 00–10 path. | P1 | Small | `README.md`, `ABOUT.md`, `standalone-labs/README.md`, Lab 10 manifest |
| S5 | Current README setup wording mixes host-terminal commands, toolbox commands, portal actions, and verification commands without a standard visual contract. | P1 | Medium | Shared README template and all current lab READMEs |

## 1.3 Curriculum issues

| ID | Issue | Severity | Effort | Scope |
|---|---|---:|---:|---|
| C1 | Objectives over-reward exact token extraction and do not consistently require a defensible finding. | P1 | Large | Objective/task schema, portal submission model, selected lab tasks, tests |
| C2 | Defensive practice is weak: labs rarely require remediation validation, detection logic, confidence, or control testing. | P1 | Large | Labs 05–09 first, then future-lab template |
| C3 | Lab 05–06 claim forensic/timeline learning but remain deterministic and token-driven; they lack uncertainty, time normalization, evidence quality, and competing hypotheses. | P1 | Medium | Labs 05–06 task wording, artifacts, smoke tests |
| C4 | Lab 07 conflates simulated XSS recognition with actual browser execution unless the boundary is repeatedly stated. | P1 | Small | Lab 07 documentation and task checks |
| C5 | Missing or underdeveloped topic coverage includes authorization, cookies/session security, CSRF, IDOR/BOLA, role enforcement, replay, TLS/SNI, UDP, DNSSEC/split-horizon behavior, archive safety, supply-chain/container security, and modern cryptography. | P1 | Large | Curriculum roadmap and next branch; do not add all topics to existing labs |
| C6 | Some walkthrough hints expose exact routes/values too early, allowing bypass of observation and reasoning in challenge mode. | P2 | Medium | Hint tiers in Labs 02–10 |
| C7 | Defensive boundary and scope are documented, but remediation outcomes are not verified as part of most flags. | P1 | Medium | Evidence-quality objectives and future lab manifests |

---

# 2. FIX SPECIFICATIONS

Implement these in priority order. P0 items must be complete before another learner-facing Lab 07 test. P1 items are required before declaring the curriculum remediation pass complete.

## 2.1 P0 — Fix Lab 07 token/header path first

### F07-1 — Replace the literal bearer placeholder

- **Current behavior / what's broken:** `standalone-labs/07-web-breach-chain/README.md` line 155 says `Authorization: Bearer *** the learner cannot know that this means the forged token constructed in the preceding step, and copying it produces an invalid request.
- **Desired behavior:** The README uses a shell variable consistently and makes clear that the same generated bearer token is used for both `/admin/console` and `/final`.
- **Exact change needed:**
  1. In `standalone-labs/07-web-breach-chain/README.md`, replace the hint's literal placeholder with a complete safe example: `curl -s -H "Authorization: Bearer ***" http://ops-internal:8081/admin/console`.
  2. In the solution section immediately after token construction, define one canonical variable named `forged` and use it in every subsequent command.
  3. In the final proof example, use `-H "Authorization: Bearer ***"` and URL-encoded form fields where needed.
  4. Add a one-line warning: do not paste `***`; it denotes the local shell variable's value in abbreviated prose.
  5. Update the same wording in any duplicated portal lesson source discovered by searching for `Bearer ***`, `privilege-escalation`, and `root-proof`.
- **Verification:**
  - `grep -R "Bearer \*\*\*" -n standalone-labs/07-web-breach-chain app controller data tests` returns no learner command containing the literal placeholder.
  - The lab's smoke test runs the exact README command with a generated `$forged` value and receives the expected admin marker and flag.
  - A request with the literal `***` is rejected, proving the test is not accidentally accepting the broken documentation.

### F07-2 — Make JWT construction shell-safe and reproducible

- **Current behavior / what's broken:** The documented base64url and JWT construction path is long and sensitive to padding/newlines. The review requires exact command execution, not visual inspection.
- **Desired behavior:** A learner using the documented POSIX shell commands in the toolbox can decode `sid`, construct `header.payload.`, call the internal API, and receive the expected application-admin response.
- **Exact change needed:**
  1. Read `standalone-labs/07-web-breach-chain/README.md` lines 244 onward and the remaining solution lines before editing; preserve the existing variable names unless the actual implementation requires a correction.
  2. Add a short shell block that derives `payload_json` and `sid`, constructs `h` and `p`, then assigns `forged="$h.$p."`.
  3. Ensure every base64 operation strips newline output and restores URL-safe padding before decode.
  4. Add a deterministic test fixture only in maintainer smoke code; never expose generated flags or secrets in normal toolbox environment.
  5. Update `standalone-labs/07-web-breach-chain/smoke.sh` with the same request sequence.
- **Verification:**
  - `bash standalone-labs/07-web-breach-chain/smoke.sh` exits 0 and prints a named success line for `privilege-escalation`.
  - `node scripts/verify-standalone.mjs 07-web-breach-chain` completes the selected-lab lifecycle and rejects a token with the wrong `sid`, wrong `sub`, or non-admin role.
  - `npm run test:unit -- --test-name-pattern="standalone|README|smoke"` passes.

### F07-3 — Lock the simulation boundary into tests and wording

- **Current behavior / what's broken:** The README explains that the ticket reviewer does not execute JavaScript, but the objective language can still be read as a real XSS/session theft chain.
- **Desired behavior:** Every learner sees that this is a deterministic training simulation of unsafe markup handling and that only application-level admin access is demonstrated.
- **Exact change needed:**
  1. In `standalone-labs/07-web-breach-chain/lab.json`, retain `simulated XSS` in `learningOutcomes` and add an explicit outcome for distinguishing simulation from real browser execution if the schema supports it; otherwise put this requirement in the objective/task text.
  2. In `tasks.json`, retain the existing checkpoint answer that rejects real victim compromise and add wording that the returned JWT is synthetic.
  3. In README headings and final takeaways, replace ambiguous verbs such as “steal” or “compromise” with “demonstrate simulated session exposure” where they refer to the training reviewer.
  4. Add a smoke assertion that no browser/collector process is required for the objective.
- **Verification:** `grep -R "real victim\|browser or collector\|synthetic\|simulated" -n standalone-labs/07-web-breach-chain` shows the boundary in scenario, objective, checkpoint, and solution; smoke tests still pass.

## 2.2 P1 — Structural and curriculum contract

### F-S1 — Add a difficulty rubric and relabel current manifests

- **Current behavior:** The repository validates only `beginner`, `intermediate`, and `advanced`, but does not define measurable criteria; current labels understate cognitive load.
- **Desired behavior:** Every manifest's tier is justified by prerequisites, number of new concepts, independent decisions, tooling complexity, and evidence quality.
- **Exact change needed:**
  1. Add the rubric in section 3 of this plan to `docs/CURRICULUM-DESIGN.md`.
  2. Update `standalone-labs/02-service-fingerprint/lab.json` to `beginner-plus` only if the manifest schema is intentionally expanded; otherwise use `intermediate` and add a separate `tier`/`track` field. Prefer a schema-compatible `difficulty: "intermediate"` plus `difficultyBand: "beginner-plus"` to avoid breaking tests.
  3. Add `difficultyBand` to all current manifests if the portal preserves unknown metadata; otherwise update the accepted enum in `tests/standalone-labs.test.mjs` using a failing test first.
  4. Set Labs 03–05 to `intermediate` with band `intermediate-foundations`; Labs 06–09 to `intermediate` with band `intermediate-capstone`; Lab 10 to `intermediate` with band `intermediate-crypto-foundations`.
  5. Update `README.md`, `ABOUT.md`, and `standalone-labs/README.md` so Lab 10 is explicitly an elective after Lab 01, not a required continuation of Lab 09.
- **Verification:** `npm run test:unit -- --test-name-pattern="curriculum|manifest"` passes; rendered curriculum shows the same tier labels as manifests.

### F-S2 — Standardize HOST / TOOLBOX / PORTAL

- **Current behavior:** Labs mix command locations and use “host terminal,” “toolbox,” and portal actions inconsistently.
- **Desired behavior:** Every README starts with one environment block and labels every command block.
- **Exact change needed:** Apply the style guide in section 4 to `standalone-labs/GETTING-STARTED.md`, then to Labs 00–10. Do not change CLI syntax or service names.
- **Verification:** A documentation test checks every current README contains the exact headings `HOST`, `TOOLBOX`, and `PORTAL`, and no unlabeled shell block appears before the environment block. Run `npm run test:unit -- --test-name-pattern="documentation"`.

### F-S3 — Establish one source of truth for hints and solutions

- **Current behavior:** README files embed hints and solutions; the project shape suggests separate `HINTS.md` and `SOLUTION.md`, but they do not exist.
- **Desired behavior:** Either explicitly standardize embedded sections or create the files and make README links authoritative. Do not maintain duplicate content.
- **Exact change needed:** Prefer embedded content because the portal already renders lesson content. Update `docs/CURRICULUM-DESIGN.md` and `standalone-labs/README.md` to state: “Hints and solutions are embedded in README files; `HINTS.md` and `SOLUTION.md` are not required files.” Add a documentation test preventing broken links to absent files.
- **Verification:** `npm run test:unit -- --test-name-pattern="documentation"` passes and all README links resolve.

### F-S4 — Add evidence-quality objectives without breaking flags

- **Current behavior:** Flags verify exact values but do not consistently require a finding, evidence source, impact, confidence, or remediation.
- **Desired behavior:** Preserve flags as progress checkpoints while task submissions/checks also evaluate structured reasoning.
- **Exact change needed:**
  1. Do not replace the existing flag verifier in the first pass.
  2. Add optional fields to task metadata: `findingPrompt`, `evidencePrompt`, `impactPrompt`, `confidencePrompt`, `remediationPrompt`.
  3. Add the standard template from section 5 to `standalone-labs/README.md` and to Labs 05–09 first.
  4. Add portal rendering and saved-response support only after locating the existing task/check submission schema in `app/`, `controller/`, and `data/`; write a failing unit test for round-trip persistence before implementation.
  5. Keep the objective flag as a separate field so existing CLI verification and progress remain backward-compatible.
- **Verification:** New unit tests prove a task can render the five prompts, save an answer per run, reload it, and still verify the existing flag independently. Existing `npm test` and `npm run lint` remain green.

### F-S5 — Add defensive validation to Labs 05–09

- **Current behavior:** Findings are usually accepted once tokens are collected; remediation or detection quality is not tested.
- **Desired behavior:** At least one objective in each selected lab requires a concrete control decision and a verification step.
- **Exact change needed:**
  - Lab 05: require chain-of-custody statement, hash purpose, timestamp/timezone interpretation, and evidence-preservation remediation.
  - Lab 06: require an ordered timeline, confidence, one alternative hypothesis, and a telemetry improvement.
  - Lab 07: require controls that break the chain: output encoding, secure cookies, JWT signature/claim validation, and server-side authorization.
  - Lab 08: require safe extraction and artifact-integrity controls.
  - Lab 09: require secret rotation, access-control remediation, and confirmation that the exposed artifact is no longer reachable.
  Add these as task prompts/checks first; do not require a new scoring engine until the template persistence work is complete.
- **Verification:** Each target lab has at least one task metadata object containing all five evidence fields or an explicit remediation variant; documentation tests assert coverage.

---

# 3. DIFFICULTY RELABELING

Use the following rubric for future manifests. A lab's band is the highest band whose criteria it satisfies; reviewers must record the criteria in the manifest or curriculum design record.

## Beginner

- 0–2 new security concepts.
- One primary tool family and at most one supporting command family.
- Linear path with no more than two independent decisions.
- No prerequisite beyond terminal navigation and the lab briefing.
- Expected completion: 15–35 minutes.
- Flag can be obtained from directly observable evidence.

## Beginner-plus

- 2–4 new concepts building on one prior lab.
- Two or three command families, with syntax examples.
- Linear path plus one choice of tool or interpretation.
- Learner must distinguish at least one similar concept, such as banner vs proof or port vs service.
- Expected completion: 30–60 minutes.
- Lab 02 belongs here conceptually; preserve schema compatibility by representing it as `difficulty: intermediate`, `difficultyBand: beginner-plus` if needed.

## Intermediate foundations

- 4–7 new concepts across one domain.
- Three or more tools or one protocol plus one evidence format.
- Two or more observations must be combined; at least one clue is indirect.
- Learner must explain impact, not only copy a value.
- Expected completion: 45–90 minutes.
- Labs 03–05 belong here.

## Intermediate capstone

- Reuses at least three prior skills and introduces one new failure mode.
- Multiple data sources must be correlated.
- At least one decoy, ambiguity, or competing interpretation exists.
- Final response requires evidence, impact, confidence, and remediation.
- Expected completion: 60–120 minutes.
- Labs 06–09 belong here.

## Intermediate crypto foundations

- Requires byte/string or encoding reasoning and at least one cryptographic distinction.
- Learner must distinguish encoding, hashing, encryption, integrity, and authenticity.
- Any intentionally weak primitive must be explicitly labelled non-production.
- Completion requires explaining why the primitive fails, not merely recovering text.
- Expected completion: 60–120 minutes.
- Lab 10 belongs here.

## Advanced

Do not use this tier for the next branch unless the lab has non-linear investigation, multiple valid approaches, substantial ambiguity, or cross-domain exploitation/defense requiring more than 120 minutes. A longer README alone does not justify advanced.

---

# 4. ENVIRONMENT CONVENTION

Drop this section, with only lab-specific service names changed, into every standalone README.

## Where commands run

- **HOST:** Your Windows/macOS/Linux machine in the project directory. Use HOST for `npm`, `node scripts/standalone-labctl.mjs`, Docker lifecycle commands, and flag verification.
- **TOOLBOX:** The isolated Linux toolbox opened by the lab controller. Use TOOLBOX for reconnaissance and investigation commands such as `nmap`, `curl`, `nc`, `dig`, `find`, `jq`, and `base64`.
- **PORTAL:** The local browser application at `http://127.0.0.1:5173/`. Use PORTAL to sign in, start/resume a lab, read tasks/hints, submit understanding checks, and enter flags.

### Correct usage

**HOST — project lifecycle:**

```sh
node scripts/standalone-labctl.mjs start 07-web-breach-chain
node scripts/standalone-labctl.mjs shell 07-web-breach-chain
```

The second command opens the TOOLBOX. Keep a separate HOST terminal for verification:

```sh
node scripts/standalone-labctl.mjs verify 07-web-breach-chain recon-sweep 'RLAB{...}'
```

**TOOLBOX — investigation:**

```sh
nmap -sT -Pn -p 1-10000 edge-gateway
curl -sS http://edge-gateway:8080/
```

**PORTAL — browser actions:**

```text
Open http://127.0.0.1:5173/, sign in, select the lab, click Start/resume lab,
read the task card, and submit the flag in that task's flag field.
```

### Confusing pattern being replaced

Do not tell learners to run this in an unlabeled block:

```sh
# Ambiguous: may fail on the host because edge-gateway exists only in the toolbox network
curl http://edge-gateway:8080/
```

Replace it with:

```text
TOOLBOX — run this inside the isolated toolbox shell:
```

```sh
curl -sS http://edge-gateway:8080/
```

Never describe `localhost` as the controller, portal, or target interchangeably. `127.0.0.1:5173` is PORTAL; controller health is `127.0.0.1:3030/health`; lab service hostnames are available only in TOOLBOX unless the lab explicitly states otherwise.

---

# 5. EVIDENCE-QUALITY OBJECTIVE TEMPLATE

Use this template in task metadata and render it alongside the existing flag field. The flag remains a checkpoint; the evidence response is the learning objective.

```text
Finding:
State the security or operational finding in one sentence. Name the affected
service, asset, or control. Do not paste only a token.

Evidence source:
Name the exact observation that supports the finding: command, endpoint, file,
log line, artifact, or task response. Include the relevant value without exposing
maintainer-only generated flags.

Impact:
Explain what an attacker, operator, or unauthorized user can do because of the
finding. State the boundary: application access, data disclosure, execution,
or no demonstrated impact.

Confidence:
Choose High, Medium, or Low and give one reason. High requires corroboration by
at least two independent observations or one authoritative artifact.

Recommended remediation:
Name the control change and how to verify it. Include a validation step, such as
re-running the request, checking authorization, rotating a secret, or confirming
that the exposed path is no longer reachable.
```

## Retrofit order

### Retrofit first: Labs 05–09

- **Lab 05:** already framed as evidence handling; add custody, integrity, timeline, and preservation.
- **Lab 06:** already framed as an investigation capstone; add correlation, uncertainty, and detection/telemetry remediation.
- **Lab 07:** add vulnerable-control finding, application boundary, confidence, and controls that break the chain.
- **Lab 08:** add artifact trust, safe extraction, and validation.
- **Lab 09:** add exposure impact, authorization, secret rotation, and remediation verification.

### Keep as mostly pure token labs initially: Labs 00–04 and Lab 10

- Labs 00–04 are foundational command/protocol drills; adding a full evidence report to every early task would increase friction without improving fundamentals.
- Lab 10 can remain a guided recovery exercise, but its final objective must require the cryptographic explanation template: why MD5/toy XOR are unsuitable and what modern replacement is appropriate.
- Revisit Labs 00–04 after the template is proven in Labs 05–09.

---

# 6. NEXT CURRICULUM BRANCH

## Branch name and placement

Create the next branch after **Lab 07 — ApertureOps: The Support Desk Incident**. The branch should follow Lab 07's simulated XSS/JWT exposure but move from exploit-chain recognition to authentication and authorization analysis. It assumes Labs 01–02, HTTP basics, JSON, cookies, base64url/JWT segment structure, and the Lab 07 simulation boundary.

Do not make the branch depend on Lab 07's rotating containers or flags. Each sub-lab must have its own synthetic target, isolated subnet, manifest, smoke test, and generated flags.

## Proposed sub-labs

### 11 — JWT Validation and Trust Boundaries

- **Focus:** signature verification, allowed algorithms, issuer/audience/expiry, key selection, key rotation, and server-side claim validation.
- **Exercise:** compare a correctly signed token, `alg:none`, wrong-key token, expired token, wrong issuer, and altered role claim. The target must accept only the valid token.
- **Output:** evidence report plus a remediation verification request.
- **Tier:** Intermediate foundations.
- **Prerequisites:** Lab 07 JWT segment decoding and HTTP bearer headers.

### 12 — Cookie and Session Security

- **Focus:** `Secure`, `HttpOnly`, `SameSite`, session rotation, logout invalidation, fixation, and scope/path.
- **Exercise:** inspect response headers, demonstrate which cookie protections are absent in a synthetic app, then verify the hardened session behavior.
- **Output:** cookie finding, affected boundary, and post-fix observation.
- **Tier:** Intermediate foundations.

### 13 — CSRF and Request Integrity

- **Focus:** state-changing requests, synchronizer tokens, SameSite limitations, Origin/Referer validation, and JSON/API CSRF distinctions.
- **Exercise:** reproduce a harmless state change without a CSRF defense, then submit the same request with the correct defense and verify rejection.
- **Output:** attack precondition, browser/request evidence, and control validation.
- **Tier:** Intermediate foundations.

### 14 — IDOR / BOLA

- **Focus:** object-level authorization, user-controlled IDs, tenant boundaries, read vs write authorization, and predictable identifiers.
- **Exercise:** two synthetic users access ticket/report objects; the vulnerable endpoint trusts an object ID while the fixed endpoint checks ownership.
- **Output:** affected object, unauthorized action, evidence, and corrected response.
- **Tier:** Intermediate capstone.

### 15 — Role Enforcement and Privilege Boundaries

- **Focus:** RBAC/ABAC, server-side enforcement, confused deputy behavior, role inheritance, and method/path inconsistencies.
- **Exercise:** test the same action through UI, GET, POST, and alternate API paths; only authorized roles should succeed.
- **Output:** authorization matrix and remediation test.
- **Tier:** Intermediate capstone.

### 16 — Replay, Session Lifecycle, and Token Revocation

- **Focus:** replay windows, token expiry, logout, password-change invalidation, nonce/state, refresh-token rotation, and concurrent sessions.
- **Exercise:** replay a captured synthetic token before and after logout/password change/rotation; verify expected acceptance or rejection.
- **Output:** lifecycle timeline, replay evidence, and control verification.
- **Tier:** Intermediate capstone.

### 17 — Authentication/Authorization Remediation Capstone

- **Focus:** correlate JWT, cookie, CSRF, BOLA, role, and replay findings into one incident and validate a remediation set.
- **Exercise:** identify which controls break the chain, prioritize them, apply or inspect a hardened deployment, and prove the former requests fail for the correct reason.
- **Output:** complete Finding/Evidence/Impact/Confidence/Remediation report, plus final flag.
- **Tier:** Intermediate capstone.

## Branch-wide implementation rules

- Use synthetic identities and records only.
- Never require a public cloud account or external target.
- Avoid real browser exploitation; if browser behavior matters, use a local Playwright smoke test or clearly labelled deterministic simulation.
- Every vulnerability must have a corresponding fixed behavior or remediation check.
- Every sub-lab gets `README.md`, `docker-compose.yml`, `lab.json`, `tasks.json`, `smoke.sh`, and contained Docker build contexts, matching the existing manifest tests.

---

# 7. SEQUENCING

## Phase 0 — Baseline and reproduction (must be first)

1. Read the complete Lab 07 README, compose file, target source, and smoke script.
2. Run the existing targeted test and Lab 07 smoke path without editing:
   - `cd C:/Users/win/Downloads/Projects/WebApps/Cybersecurity-Lab`
   - `npm run test:unit -- --test-name-pattern="standalone|documentation"`
   - `bash standalone-labs/07-web-breach-chain/smoke.sh`
3. Capture the exact failure, command, and expected/actual output in the implementation issue or commit message.
4. Create a failing regression test for the literal bearer-placeholder failure before changing documentation or runtime code.

## Phase 1 — P0 Lab 07 repair

5. Fix the README variable/header commands using F07-1.
6. Run the new targeted test and the exact shell request; verify RED → GREEN.
7. Fix shell-safe JWT construction and smoke coverage using F07-2.
8. Add simulation-boundary assertions and wording using F07-3.
9. Run `npm run test:unit -- --test-name-pattern="standalone|documentation|rendered"` and the Lab 07 smoke/lifecycle check.
10. Commit only the Lab 07 blocker fix after all targeted tests pass.

## Phase 2 — Structural documentation contract

11. Add the difficulty rubric to `docs/CURRICULUM-DESIGN.md`.
12. Add a failing documentation test for `difficultyBand`, then update manifests and rendering code minimally.
13. Add the HOST/TOOLBOX/PORTAL block to `standalone-labs/GETTING-STARTED.md`.
14. Apply the convention to Labs 00–10 in bite-sized commits, one lab per commit.
15. Clarify embedded hints/solutions and Lab 10 elective placement in root and standalone curriculum docs.
16. Run `npm run test:unit -- --test-name-pattern="curriculum|manifest|documentation"`, then `npm run lint`.

## Phase 3 — Evidence-quality retrofit

17. Add failing metadata-schema tests for the five evidence prompts.
18. Implement metadata loading/rendering/persistence in one vertical slice for Lab 05 only.
19. Add Lab 05 prompts and verify saved responses plus independent flag verification.
20. Repeat the same vertical slice for Labs 06, 07, 08, and 09.
21. Add remediation-validation checks to each selected lab's smoke test where behavior is executable.
22. Run `npm test` and `npm run lint`; commit each completed lab retrofit separately.

## Phase 4 — Branch design and build

23. Add a curriculum design record for Labs 11–17 with prerequisites, outcomes, band, scope, and remediation objective before writing targets.
24. Implement Lab 11 as the tracer-bullet branch: manifest, one target, one invalid-token test, one valid-token test, README, tasks, and smoke test.
25. Run its RED → GREEN cycle and full manifest/documentation tests.
26. Add Labs 12–16 in parallel only after Lab 11 establishes reusable authentication fixtures and task fields.
27. Implement Lab 17 last because it depends on the branch's preceding behavior and evidence template.
28. Run `npm test`, `npm run lint`, and `node scripts/verify-standalone.mjs <lab-id>` for every new lab in a clean local Docker environment.
29. Run a three-persona learner review again, specifically testing the revised commands and evidence submissions.

## Parallelization boundaries

- Documentation convention work can run in parallel with Lab 07 runtime investigation, but neither may alter stable IDs.
- Difficulty relabeling and README standardization can run in parallel after the baseline manifest test is recorded.
- Evidence-template implementation must precede retrofitting Labs 05–09; individual lab content edits can then proceed in parallel.
- New branch design can proceed during Phase 3, but branch implementation should wait until the evidence schema and environment convention are stable.

## Commit discipline

Use small commits with one purpose, for example:

```text
fix(lab07): use forged bearer variable in documented admin requests
 test(lab07): reject literal bearer placeholder and wrong subject
 docs(curriculum): define difficulty bands
 docs(labs): standardize host toolbox portal labels
 feat(tasks): persist evidence-quality responses
 feat(lab11): add jwt validation tracer lab
```

---

# Tests / validation

For every behavior change, follow this exact cycle:

1. **RED:** add one focused test in the nearest existing test file; run it and confirm it fails for the intended missing behavior, not because of a syntax or setup error.
2. **GREEN:** make the smallest change that satisfies the test; rerun the focused test and confirm pass.
3. **REGRESSION:** run the relevant suite, then the full suite:
   - `npm run test:unit -- --test-name-pattern="<focused name>"`
   - `npm test`
   - `npm run lint`
4. **Docker verification:** for changed standalone behavior, run `bash standalone-labs/<lab-id>/smoke.sh`; for lifecycle changes run `node scripts/verify-standalone.mjs <lab-id>`.
5. **Documentation verification:** run the documentation tests and manually follow every changed command in a clean toolbox session.
6. **Commit:** commit only after the focused, regression, lint, and applicable Docker checks pass.

Expected full-suite result: Node test runner reports all tests passing, `npm run lint` exits 0, and each selected smoke script exits 0. Do not report completion from a written plan or a successful build alone.

# Risks, tradeoffs, and open questions

- **Schema compatibility:** Adding `difficultyBand` or evidence fields may affect portal rendering and strict manifest tests. Prefer optional fields and backward-compatible defaults; add schema tests before implementation.
- **Progress preservation:** Changing objective IDs, flag environment names, or dependency graphs can invalidate saved progress. Do not rename them without a migration plan.
- **Simulation realism:** Making Lab 07 use a real browser could increase complexity and safety risk. Keep the deterministic simulation unless the learning objective specifically requires browser execution.
- **Scoring fairness:** Evidence-quality responses should initially be formative or rubric-reviewed, not an opaque automated score. Preserve flag verification independently.
- **Documentation duplication:** Creating separate `HINTS.md` and `SOLUTION.md` would create synchronization risk. The plan intentionally keeps embedded README sections as the source of truth.
- **Challenge-mode leakage:** Exact endpoint hints are useful in guided mode but reduce challenge value. Add mode-aware hint disclosure only after the basic documentation and blocker fixes are stable.
- **Open question:** Confirm whether the portal can persist arbitrary task-response fields without schema changes. Inspect `app/`, `controller/`, and `data/` before choosing between extending the existing check payload and adding a new evidence-response endpoint.
- **Open question:** Confirm whether `difficultyBand` is rendered or ignored by current curriculum code before changing the accepted manifest schema. If it is ignored, keep the rubric in docs and use existing `difficulty` values to avoid unnecessary product work.
