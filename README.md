# RECON//LAB

A local, beginner-first security curriculum. Start with terminal practice, then
follow connected investigations with scenarios, evidence, progressive hints,
understanding checks and hidden walkthroughs.

This is an **account-based, local-only** product for trusted learners on one computer,
not a production multi-user service.

## Start here

New to the project? Read the [Beginner’s Guide](BEGINNER-GUIDE.md) first. It
explains the purpose of the lab, the learning path, and what to expect in a
session without assuming prior security knowledge.

Install Node.js 22.13+ and Docker Desktop with Linux containers (or Docker Engine
and Compose v2 on Linux). Start Docker and wait for its engine, then run these
commands from this project folder:

```sh
npm run doctor
npm install
npm run admin:create -- admin
npm run lab
```

On Windows PowerShell use `npm.cmd` instead of `npm` if execution policy blocks
npm.ps1. Open **http://127.0.0.1:5173/**. The current curriculum is the home page;
`/labs` remains a compatible link to the same workspace.

Begin with **Lab 00 — Your First Shift: Terminal Practice**. Click **Start / resume
lab** after signing in and changing your temporary password. The investigation
terminal opens inside the portal. Use Administration to create learner accounts. The portal contains the lesson and solution; you do not
need to open local Markdown files.

For detailed setup help, see [Getting started](standalone-labs/GETTING-STARTED.md).
For migration, admin controls, leases and configuration, see [Local instances](docs/LOCAL-INSTANCES.md).

## One current learning path

The current curriculum has **11 labs**: a short terminal orientation, nine
connected investigations, and a message-recovery elective.

- **00:** prompts, commands, arguments, files, pipes and copying practice flags.
- **01–05:** networks, service identification, DNS and Linux evidence.
- **06:** infrastructure investigation capstone.
- **07–09:** the ApertureOps web incident, recovered artifacts and final case.
- **10:** optional Base64, hex, ROT13, MD5 candidate matching and toy XOR, after 01.

[Curriculum details](standalone-labs/README.md) describe skills and recommended
prerequisites. Earlier targets need not remain running: each case supplies its
own evidence. Use only each lesson's fictional, explicitly authorized scope.

## How a task works

Each task card keeps its question, starting evidence, expected observation,
three closed hints, understanding check and flag field together. Try the task,
open one hint if stuck, explain your reasoning in the check, then submit the flag.
The full solution stays separately hidden.

Flags are generated for each run and verified by the local controller.
The portal and CLI share your account's saved flag progress. Understanding checks are
formative practice, not secure exams: they give immediate explanations and are
saved to your account per run. They are required for the portal submission flow,
and the maintainer/CLI verifier checks flags independently. Existing flag
progress is preserved; you can complete checks for previously verified tasks.

## Start, stop and resume

- **Start / resume:** creates a first run or preserves existing flags and submissions.
- **Stop lab / expiry:** removes that lab's containers, preserving submissions and flags.
  Toolbox `/tmp` files are lost; download evidence again on resume.
- **Reset this lab:** explicitly deletes that lab's progress and volumes and creates
  fresh flags. It does not reset other investigations.
- **Reconnect / Refresh status:** retries controller connectivity or reads runtime state.

Each account may run one lab; the host default is two. A lease lasts 60 minutes,
with one 30-minute extension. Resume grants a new lease on the same run.
`npm run lab:stop` stops account instances before the portal, controller and legacy range.

The controller is an API at `http://127.0.0.1:3030/health`, not the lesson portal.
It accepts only loopback access, trusted origins and protected lifecycle actions.
Do not publish it, the portal, or training containers to the internet.

## Legacy modules

The original **18 shared-range modules** are retained at
**http://127.0.0.1:5173/legacy** for returning learners. They are not part of the
recommended beginner path. Their original scores, notes, flags and shared runtime
remain separate and unchanged; no progress has been migrated or deleted. Their
browser toolbox belongs to that legacy range, not to the current investigations.
All 18 portal modules share the same local target range: legacy start, stop and
reset actions affect every portal module in that range. Its browser toolbox is
at http://127.0.0.1:7681 and is only for those legacy modules.

## CLI and development

The historical `standalone-labs/` directory and CLI names remain stable for
compatibility; these labs are integrated into the default portal.

```sh
npm run labs:list
node scripts/standalone-labctl.mjs start 00-terminal-basics
node scripts/standalone-labctl.mjs shell 00-terminal-basics --user admin
```

Run investigation commands only inside the toolbox. In another host terminal,
optional verification uses `node scripts/standalone-labctl.mjs verify <lab-id>
<objective-id> 'RLAB{...}'`.

```sh
npm run dev
npm run lab:controller
npm test
npm run lint
```

Maintainers can run `node scripts/verify-standalone.mjs <lab-id>` for a full
Docker lifecycle check. This deliberately resets the selected lab; do not use it
on progress you want to keep.

See the [threat model](docs/THREAT-MODEL.md) and
[curriculum design](docs/CURRICULUM-DESIGN.md). All targets and evidence are
synthetic. Local flags track learning progress; they are not secrets from the
owner of the computer.
