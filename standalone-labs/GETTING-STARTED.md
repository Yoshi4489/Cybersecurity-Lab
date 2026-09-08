# Getting Started

These labs assume you are new to the terminal and networking. You investigate
fictional Northstar Shipping incidents on your own computer.

## Install and check the tools

Install Node.js 22.13 or newer and Docker Desktop (Linux containers), or Docker
Engine with Compose v2 on Linux. Open Docker Desktop and wait for its engine.
Use the [Node downloads](https://nodejs.org/en/download) and
[Docker documentation](https://docs.docker.com/get-started/get-docker/) for your OS.

Open PowerShell or Windows Terminal on Windows, or Terminal on macOS/Linux.
A terminal accepts text commands; Enter runs a command. Change into the downloaded
project directory using `cd`, for example:

```powershell
cd C:\Users\win\Downloads\Projects\WebApps\Cybersecurity-Lab
node -v
docker version
docker compose version
```

Check your computer before installation or startup:

```sh
npm run doctor
npm install
```

On Windows, if PowerShell blocks npm.ps1, use `npm.cmd run doctor` and
`npm.cmd install`. This does not require changing PowerShell's execution policy.
Doctor checks prerequisites and potential network conflicts. Fix any reported
failure before starting a range.

## Read and submit in the portal

Run `npm run lab` (or `npm.cmd run lab` in PowerShell), then open
**http://127.0.0.1:5173/**. Begin with Lab 00 and use Start / resume. The portal
contains the scenario, objective descriptions, individual hints, and complete
walkthrough, so you do not need to open a local Markdown file.

Use the displayed shell command to enter that lab's toolbox and investigate.
Paste each discovered flag into its matching portal form. CLI verification is
still supported, and both interfaces use the same saved progress and per-run flags.
Returning learners can find the original modules under Legacy at `/legacy`; their saved progress is unchanged.

## Two terminals with different jobs

**Host terminal:** your ordinary computer, in this project directory. It runs
the lab controller to start, submit flags, check progress, and stop.

**Toolbox terminal:** after the shell command, you are in the lab's Linux
container as student. It has the commands needed for investigation. Linux
pipelines and quoting in the README belong here, not in PowerShell.

A hostname such as triage-node only resolves inside its lab network. If curl or
getent cannot resolve it, check which terminal you are using.

## Practice before your first investigation

Choose **Lab 00 — Your First Shift: Terminal Practice** in the portal. Its
[written lesson](00-terminal-basics/README.md) is also available for CLI users.

In the host terminal:

```sh
npm run labs:start -- 00-terminal-basics
node scripts/standalone-labctl.mjs shell 00-terminal-basics
```

The second command enters the toolbox. Start with its prompt and a simple command:

```sh
pwd
```

This prints your current Linux folder. Follow Lab 00's first task: move into
`/practice`, list the files, and read `handover.txt`. The second task filters a log
through a pipe and checks that the source file did not change. Continue to Lab 01
only after you are comfortable entering commands and copying their output.

When the note displays `practice_flag=RLAB{...}`, copy only the complete
`RLAB{...}` value. In a **second host terminal**:

```sh
node scripts/standalone-labctl.mjs verify 00-terminal-basics read-note 'RLAB{...}'
```

Replace the dots with the flag you found. The controller reports success and a
checklist. Tokens are different from flags: save tokens as investigation evidence,
but submit the flag with verify. Some later cases reuse earlier flags in their
final report; their READMEs say so explicitly.

## Hints, solutions and progress

Each flag has three hints, from a gentle clue to a concrete command. Read one at
a time. A full solution explains what each command reveals. Understanding why a
tool is useful matters more than finishing without hints.

The first start creates flags. Starting again preserves those flags and your
submitted progress, including after stop. Only reset creates a fresh run.
Submit current flags in dependency order. A wrong
flag, an old run's flag, or an incomplete prerequisite objective is rejected.
The CLI recommends prior labs but allows you to start any lab independently.

When finished, exit the toolbox and stop the lab from a host terminal:

```sh
node scripts/standalone-labctl.mjs status 00-terminal-basics
node scripts/standalone-labctl.mjs stop 00-terminal-basics
```

For a clean retry:

```sh
node scripts/standalone-labctl.mjs reset 00-terminal-basics
```

To resume later, run the same start and shell commands. Stop preserves submitted
progress and flags, but downloaded files under the toolbox's /tmp disappear when
its container is removed. Reacquire those files when continuing an investigation.

Reset removes this lab's containers and volumes, clears its progress, and creates
fresh flags. Files under the toolbox's /tmp are temporary and disappear with its
container.

## Recommended order

**01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09**

Numeric prefixes remain stable IDs. Labs 06 and 09 are the capstones. See the
[lab index](README.md) for the two campaigns and prerequisites.

## Common problems

- Docker connection error: start Docker Desktop and wait for the engine.
- docker command missing: ensure Docker's resources/bin directory is on PATH,
  then reopen the terminal.
- Hostname not found: use the toolbox for the selected running lab.
- HTTP 403 from a final report: check the required case fields and saved tokens.
- Changed artifact hash: stop and reacquire the original before analyzing it.
- Unknown command: confirm whether it is a host command or a Linux toolbox command.
- First build is slow: Docker downloads the pinned base images and toolbox tools.
The current learning path starts with **00 → 01**: terminal practice before networking.
