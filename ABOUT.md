# RECON//LAB: A Beginner’s Guide

## Where commands run

### HOST

Your Windows/macOS/Linux machine, in the project directory. Run `npm`,
`node scripts/standalone-labctl.mjs`, Docker lifecycle commands and flag
verification here. The `shell` command opens TOOLBOX; keep a second HOST
terminal for verification. `reset` is destructive, not routine cleanup.

### TOOLBOX

The isolated Linux investigation shell, opened by the controller or the portal's
embedded terminal. Run reconnaissance and evidence commands here, not in
PowerShell. Lab service hostnames resolve only inside the selected lab network.
Use `lab-scope` and the portal's current instructions for allocated target addresses.

### PORTAL

The browser application at `http://127.0.0.1:5173/`: sign in, select the lab,
start/resume, read tasks and hints, answer checks and submit flags. The embedded
terminal is TOOLBOX even though it appears in PORTAL. Controller health at
`http://127.0.0.1:3030/health` is an API, not a lesson or a target.

## What is this?

RECON//LAB is a private, local cybersecurity learning environment. It runs on
your own computer and gives you fictional systems to investigate safely. You are
not attacking real websites, companies, or people.

The lab is designed for someone who may not yet know what a terminal, port, DNS,
HTTP, hash, or Docker container is. It introduces each idea before asking you
to combine it with another one.

The main question throughout the course is:

> What does this evidence tell me, and what should I check next?

## What will I do as a learner?

You sign in to the portal, choose an investigation, start its private practice
environment, and work in the built-in terminal. Each task gives you:

1. A story or incident context.
2. A question to answer.
3. Starting evidence.
4. The observation you should expect.
5. Three optional hints.
6. A short understanding check.
7. A flag submission box.

The flag proves that you found the intended evidence. The understanding check
asks you to explain why the command or conclusion makes sense, so the lab is not
just a copy-and-paste exercise. Full solutions are available separately when you
need them.

## The learning path

The recommended current path contains eleven small investigations:

| Lab | Plain-English purpose |
| --- | --- |
| 00 — Your First Shift | Practice the terminal prompt, commands, arguments, files, pipes, and copying output. |
| 01 — First Contact | Learn what a host, port, HTTP service, and raw TCP connection are. |
| 02 — Unmanaged Service Farm | Inventory services and record useful version evidence. |
| 03 — Ghost Service in DNS | Use DNS records to connect names, addresses, and services. |
| 04 — Acquired Company DNS Leak | Read DNS information and understand a zone-transfer scenario. |
| 05 — Incident EV-55 | Investigate Linux files, logs, hashes, and printable evidence. |
| 06 — Signals in the Noise | Combine network, DNS, file, and log evidence in a capstone. |
| 07 — Support Desk Incident | Follow a fictional web incident involving discovery, an XSS simulation, and JWT trust. |
| 08 — Recovered Cache | Analyze encoded data, integrity evidence, and recovered artifacts. |
| 09 — Close the Breach | Correlate deployment leaks, an exposed backup, and export evidence. |
| 10 — The Mislabelled Secret | Optional practice with Base64, hex, ROT13, MD5 candidate matching, and toy XOR. |

Lab 10 is an optional branch after Lab 01. You do not have to finish every
capstone before trying it.

## A few important words

- **Terminal:** a text window where you type commands.
- **Command:** a program or instruction, such as `pwd` or `cat`.
- **Argument:** extra information given to a command, such as the filename in `cat note.txt`.
- **File:** saved information, such as a log or handover note.
- **Pipe (`|`):** sends one command’s output into another command.
- **Host:** a computer or service address.
- **Port:** a numbered doorway used by a network service.
- **DNS:** the system that maps names to network addresses.
- **HTTP:** the web protocol used by browsers and many APIs.
- **Hash:** a one-way fingerprint used for comparison; it is not encryption.
- **Encoding:** a reversible representation such as Base64 or hex.
- **Container:** a small isolated process used to run one part of the practice environment.
- **Flag:** a generated value such as `RLAB{...}` that confirms an objective.

You do not need to memorize these definitions before starting. Lab 00 gives you
hands-on practice with the terminal, and later labs introduce the network terms
when they become useful.

## How one lab session works

1. Open the portal at `http://127.0.0.1:5173`.
2. Sign in. The first administrator account is created during setup; a learner account is created by an administrator.
3. Select a lab and click **Start / resume lab**.
4. Read the scenario and the task card before typing commands.
5. Use the embedded **Investigation toolbox** terminal. The scope file in that terminal tells you which fictional services are authorized.
6. Make an observation and complete the understanding check.
7. Paste the complete flag into the card’s submission box.
8. Continue to the next task only after understanding what the evidence means.

If you get stuck, open one hint at a time. The hints are deliberately short so
you can continue thinking. Use the walkthrough after you have made a genuine
attempt.

## Starting and stopping safely

Each account can run one current lab at a time. A lab normally has a 60-minute
lease, with one optional 30-minute extension. You can close the browser and come
back later; the instance continues until it is stopped or expires.

- **Stop lab:** removes the temporary containers but keeps flags, checks, and progress.
- **Resume:** brings the same run back with its saved progress.
- **Reset this lab:** deliberately starts a fresh attempt with new flags and no completed tasks.
- **Reconnect terminal:** reconnects to the same toolbox shell while the instance is running.

Only the local computer is in scope. Do not publish the portal, controller, or
training services to the internet, and do not use the supplied tools against
systems outside the lesson’s stated scope.

## First-time setup

From the project folder, a maintainer runs:

**HOST — lifecycle and verification**

```text
npm run doctor
npm install
npm run admin:create -- admin
npm run lab
```

Then open `http://127.0.0.1:5173`. The temporary administrator password must be
changed at first sign-in. The administrator can create learner accounts from
**Administration**.

For Windows PowerShell, use `npm.cmd` if `npm` is blocked by execution policy.
Docker Desktop must be running with Linux containers enabled.

## What this lab is not

RECON//LAB is not a real penetration-testing target, a public competition
platform, or a guarantee that a learner has mastered security. It is a guided
practice course. Its flags are progress markers, not secrets from the owner of
the computer. The older eighteen-module portal is retained under **Legacy** for
returning learners; new learners should use the eleven-lab current curriculum.

## Where to read next

- [Project setup and commands](README.md)
- [All current labs](standalone-labs/README.md)
- [Local accounts and instance lifecycle](docs/LOCAL-INSTANCES.md)
- [Safety and trust boundaries](docs/THREAT-MODEL.md)
