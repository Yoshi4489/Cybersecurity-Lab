# Getting Started — Standalone Labs (Beginner Guide)

New here and not sure how any of this works? **You're in the right place.** This
guide takes you from a fresh computer all the way to solving your first lab, one
small step at a time. No prior experience with Docker, Node.js, or hacking tools
is assumed.

You only have to do the **Prerequisites** and **One-time setup** sections once.
After that, starting any lab is three commands.

---

## 1. What these labs are (in plain words)

Each **standalone lab** is a tiny, self-contained practice range that runs
entirely on your own computer inside **Docker**. A lab gives you:

- A **toolbox** — a Linux machine (Kali) you control, preloaded with hacking and
  networking tools (`nmap`, `curl`, `dig`, `nc`, `jq`, and more). This is *your*
  attacker box.
- One or more **targets** — fake, deliberately vulnerable services for you to
  investigate. Everything about them (names, addresses, data) is **made up** for
  the lab.
- A set of **objectives** you complete in order. Finishing an objective reveals a
  **flag** that looks like `RLAB{a1b2c3...}`. You submit that flag to score the
  objective.

The whole thing is sealed off: the lab network has **no internet access** and the
targets are **not reachable from outside** your machine. You can break things
freely and reset anytime.

> **Two ways to type every command.** Throughout this guide you'll see commands
> written as `node scripts/standalone-labctl.mjs <action> ...`. There's also a
> shorter `npm run labs:<action> -- ...` form. They do the exact same thing — pick
> whichever you like. See the [command cheat-sheet](#6-command-cheat-sheet).

---

## 2. Prerequisites (install these once)

You need **two** programs installed and one of them **running**. Instructions are
Windows 11 first (with macOS/Linux notes), since that's the most common setup.
Before setup, check that your Docker data location is writable: the first toolbox
image build needs local storage, but its size varies by Docker version and cache.

### a) Node.js (version 22.13 or newer)

Node runs the small controller script that starts and checks the labs.

- **Windows 11:** Download the "LTS" installer from
  [nodejs.org](https://nodejs.org) and run it (click through the defaults). Or, in
  a terminal: `winget install OpenJS.NodeJS.LTS`.
- **macOS:** `brew install node`, or the installer from nodejs.org.
- **Linux:** use your distro's package manager or [nvm](https://github.com/nvm-sh/nvm).

**Check it worked** — open a terminal and run:

```sh
node -v
```

You should see something like `v22.13.0` or higher. If the number is lower,
update Node.

### b) Docker Desktop (and keep it running)

Docker is what actually builds and runs the lab machines.

- **Windows 11:** Download **Docker Desktop** from
  [docker.com](https://www.docker.com/products/docker-desktop/) and install it.
  The installer will set up **WSL2** (Windows Subsystem for Linux) for you; accept
  that. After installing, **launch Docker Desktop** and wait until the whale icon
  says "Docker Desktop is running."
- **macOS:** install Docker Desktop and launch it.
- **Linux:** install Docker Engine + the Compose v2 plugin and make sure the
  `docker` service is running.

**Check it worked** — in a terminal run both of these:

```sh
docker --version      # prints a version number
docker ps             # prints a table header with no error
docker compose version # prints a Compose v2 version
```

If `docker ps` prints an error like *"Cannot connect to the Docker daemon"*, then
Docker Desktop isn't running yet — open it and wait for it to finish starting.

### c) Git (optional)

Only needed if you're downloading the project with `git clone`. If you already
have the project folder, skip this.

---

## 3. One-time setup

1. **Open a terminal.**
   - Windows: use **Git Bash**, **PowerShell**, or **Windows Terminal**.
   - macOS/Linux: use the built-in Terminal.

2. **Go into the project folder** (the one that contains `package.json`). Replace
   the path with wherever you put the project:

   ```sh
   cd /path/to/Cybersecurity-Lab
   ```

3. **Check your machine before installing or starting a lab.** This non-mutating
   preflight verifies Node, Docker, required local ports, and Docker/host subnet
   collisions:

   ```sh
   npm run doctor
   ```

4. **Install the project's dependencies** (downloads the small helper packages):

   ```sh
   npm install
   ```

That's the one-time part done. Everything below is the normal, repeatable flow.

---

## 4. The one golden rule: use TWO terminals

This trips up almost everyone at first, so here it is up front:

- **Terminal 1** is where you *enter the toolbox* (`shell`). Once you're inside,
  that terminal is "busy" being your attacker machine.
- **Terminal 2** stays in the project folder on your normal computer, and is where
  you run `verify` to submit flags, plus `status`, `stop`, etc.

Open two terminal windows/tabs, both `cd`'d into the project folder, before you
start a lab. Keep them side by side.

---

## 5. Play your first lab, step by step

We'll use **`01-network-triage`** (the easiest lab) to learn the loop. Run
everything from the project root.

### Step 1 — See what labs exist

```sh
node scripts/standalone-labctl.mjs list
```

### Step 2 — Start the lab (Terminal 1)

```sh
node scripts/standalone-labctl.mjs start 01-network-triage
```

**The first time is slow** — Docker has to build your Kali toolbox image, which
can take several minutes. Later starts are fast. When it's done you'll see
"Started 01-network-triage ..." and a hint to open a shell.

### Step 3 — Enter the toolbox (Terminal 1)

```sh
node scripts/standalone-labctl.mjs shell 01-network-triage
```

Your prompt changes — you are now **inside** the toolbox (a Linux shell as user
`student`). Two handy commands in here:

```sh
cat /opt/cyberlab/welcome.txt   # what tools you have
lab-scope                       # what you're allowed to touch
```

### Step 4 — Do the first objective and find a flag (Terminal 1, inside the toolbox)

The first objective, `network-baseline`, is about mapping the network and reading
the target's discovery page:

```sh
getent hosts triage-node                 # resolve the target's name to an IP
nmap -sT -Pn -p- triage-node             # TCP connect scan of all ports
curl -fsS http://triage-node:8080/network
```

The `curl` output includes a line like:

```
objective_flag=RLAB{0123456789abcdef0123456789abcdef}
```

**Copy that whole `RLAB{...}` value.** That's your flag for `network-baseline`.

### Step 5 — Submit the flag (Terminal 2)

Switch to your **second** terminal (still in the project folder, *not* inside the
toolbox) and verify it:

```sh
node scripts/standalone-labctl.mjs verify 01-network-triage network-baseline 'RLAB{0123456789abcdef0123456789abcdef}'
```

Wrap the flag in **single quotes** so the `{ }` are treated literally. On success
you'll see `Verified 01-network-triage/network-baseline.` and a progress checklist.

### Step 6 — Repeat for the remaining objectives

Each lab has its own step-by-step **README** (for lab 01, that's
[`01-network-triage/README.md`](01-network-triage/README.md)). Follow it stage by
stage: run the commands in Terminal 1, copy each `RLAB{...}`, and `verify` it in
Terminal 2. Objectives are **gated** — you must complete them in order.

Check progress anytime (Terminal 2):

```sh
node scripts/standalone-labctl.mjs status 01-network-triage
```

### Step 7 — Stop when you're done (Terminal 2)

```sh
node scripts/standalone-labctl.mjs stop 01-network-triage
```

That's the whole loop: **start → shell → find flag → verify → stop.** Every other
lab works exactly the same way.

---

## 6. Command cheat-sheet

Run all of these from the project root. The two columns are equivalent.

| What it does | `node` form | `npm` form |
| --- | --- | --- |
| List all labs | `node scripts/standalone-labctl.mjs list` | `npm run labs:list` |
| Start a lab | `node scripts/standalone-labctl.mjs start <id>` | `npm run labs:start -- <id>` |
| Enter the toolbox | `node scripts/standalone-labctl.mjs shell <id>` | `npm run labs:shell -- <id>` |
| Show progress | `node scripts/standalone-labctl.mjs status <id>` | `npm run labs:status -- <id>` |
| Submit a flag | `node scripts/standalone-labctl.mjs verify <id> <objective> 'RLAB{...}'` | `npm run labs:verify -- <id> <objective> 'RLAB{...}'` |
| Reset (fresh flags) | `node scripts/standalone-labctl.mjs reset <id>` | `npm run labs:reset -- <id>` |
| Stop the lab | `node scripts/standalone-labctl.mjs stop <id>` | `npm run labs:stop -- <id>` |

> **Why the `--` in the npm form?** It tells npm "everything after this is an
> argument for the script, not for npm." Forget it and the lab id won't be passed
> through.

`smoke` (`node scripts/standalone-labctl.mjs smoke <id>`) also exists, but it's a
**maintainer/CI self-check** that auto-solves the lab to prove it works — it is
**not** part of learning, so skip it.

---

## 7. Troubleshooting

| You see... | What it means / the fix |
| --- | --- |
| `node: command not found` or an older Node version | Install/update Node.js LTS, open a **new** terminal, then confirm `node -v` reports at least `v22.13.0`. |
| `docker: command not found` | Docker isn't installed, or your terminal was open before you installed it. Install Docker Desktop and open a **new** terminal. |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running. Open it and wait for "Docker Desktop is running," then retry. |
| `docker compose` is not recognized | Install or update Docker Desktop/Engine with the Compose v2 plugin, then confirm `docker compose version` in a new terminal. |
| First `start` hangs for minutes | Normal on the very first run — it's building the Kali toolbox image. Let it finish; later runs are quick. |
| Docker reports a storage or image-build error | Check that Docker Desktop has access to a writable data location, free space if needed, then retry the build. This project intentionally does not prescribe a disk-space number because image and cache sizes vary. |
| `Start <id> before opening its toolbox.` | You ran `shell`/`verify` before `start`. Run `start <id>` first. |
| `Complete dependencies first: ...` | You're verifying objectives out of order. Do the earlier objective(s) listed first. |
| `Flag is not valid for this run.` | Flags are **unique per run** and change on every `start`/`reset`. Copy the exact `RLAB{...}` from *this* run's output — no extra spaces, keep the `{ }`. |
| Nothing happens / I'm stuck in the toolbox | You're inside the `shell` (Terminal 1). Type `exit` to leave, and use Terminal 2 for `verify`/`status`/`stop`. |
| I want a clean restart | `reset <id>` tears the lab down, rotates the flags, and starts it fresh. `stop <id>` just shuts it down. |
| Windows: `docker` works in PowerShell but not Git Bash (or vice-versa) | Make sure Docker Desktop finished starting, then open a fresh terminal. Docker Desktop must be running for any terminal to reach it. |

---

## 8. Safety boundary (please read)

- Every target, hostname, address, credential, and flag is **synthetic** — created
  only for the lab.
- Each lab runs on an **internal** Docker network with **no internet access**, and
  the targets publish **no ports** to your computer.
- The toolbox runs unprivileged, with Linux capabilities dropped; `nmap` can only
  do **TCP connect scans** (`-sT`). "Privilege escalation" in these labs is an
  **application-layer simulation**, never a real attack on your operating system.
- Use these tools **only** against the services named inside the lab you started.
  Never point them at a public address, your employer's systems, or anything you
  don't own and have written permission to test. Run `lab-scope` inside the
  toolbox anytime to review this.
- Read the [local range threat model](../docs/THREAT-MODEL.md): flags keep local
  progress consistent, not secret from the person who owns the machine.

---

## 9. The labs

Numeric prefixes are stable IDs, not a strict difficulty ramp. For a first pass,
follow `01 → 02 → 03 → 04 → 05 → 09 → 08 → 06 → 07`; labs 06 and 07 are
capstones. Each folder has its own beginner-friendly README:

| Lab | You'll practice |
| --- | --- |
| [`01-network-triage`](01-network-triage/README.md) | Network baseline, name resolution, TCP connect scanning |
| [`02-service-fingerprint`](02-service-fingerprint/README.md) | Full-port scans, version detection, saved evidence, safe NSE |
| [`03-dns-breadcrumbs`](03-dns-breadcrumbs/README.md) | Following DNS records (`dig`/`nslookup`) to a hidden service |
| [`04-zone-transfer`](04-zone-transfer/README.md) | Finding an authoritative DNS server and abusing an open AXFR |
| [`05-linux-evidence`](05-linux-evidence/README.md) | Linux command-line forensics on a synthetic evidence set |
| [`06-signals-capstone`](06-signals-capstone/README.md) | Capstone: DNS → scan → HTTP artifact → log correlation |
| [`07-web-breach-chain`](07-web-breach-chain/README.md) | Recon → reflected XSS → JWT `alg:none` privesc → chained root proof |
| [`08-cipher-locker`](08-cipher-locker/README.md) | Peeling layered base64, verifying a tar with `sha256sum`, carving a binary with `strings` |
| [`09-content-discovery`](09-content-discovery/README.md) | Web content discovery: `robots.txt` breadcrumbs, an exposed `.git/config`, a leftover `.bak` |

Have fun, and reset freely — you can't break anything that a `reset` won't fix.
