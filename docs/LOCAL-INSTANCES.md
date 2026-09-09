# Account-based local instances

The 11 current labs support accounts on one computer. All listeners bind to
loopback. Each user has one active lab; the host default is two active labs.
This is not an internet service or a hostile multi-tenant sandbox.

## First setup and migration

Run `npm run doctor`, `npm install`, then `npm run admin:create -- admin` once.
The command validates the old run files, copies them into a timestamped
`.lab/runtime-backup-*` directory, stops their old Compose projects, and imports
flags, run IDs and verified objectives into the first administrator account.
The original `.runtime` files and legacy shared-range database remain intact.
The generated password must be changed at first sign-in. Subsequent users are
created in Administration and receive a one-time password.

Run `npm run lab`, open http://127.0.0.1:5173 and sign in. Saved browser checks
are imported once for the original administrator when their run IDs match.
Use separate browser profiles to test two accounts on the same computer.
Tabs within one profile intentionally share a signed-in account.

## Learner lifecycle

- Start creates or resumes a run with a 60-minute lease. First builds take longer.
- Extend adds 30 minutes once per lease.
- Stop or expiry removes containers and networks, retaining flags, verified
  objectives, understanding checks and named evidence volumes.
- Resume keeps the run and grants another 60-minute lease.
- Reset removes that run's volumes, archives its record, and starts a new run
  with new flags and no completed objectives/checks.
- Closing a browser tab does not stop the instance. The timer continues.
- Reconnect terminal reattaches to tmux while the toolbox is running. Temporary
  files and the shell session disappear when the containers are removed.

The controller reconciles Docker every ten seconds and on startup. It retries
failed cleanup while reserving the occupied capacity. If the controller is shut
down unexpectedly, expiry is enforced when it restarts. `npm run lab:stop`
normally stops account instances before stopping the controller.

## Architecture and maintenance

`controller/accounts.mjs` owns the SQLite account schema, password hashing and
sessions. `controller/instances.mjs` owns run state, lifecycle reservations,
generated Compose projects and address allocation. `controller/instance-access.mjs`
owns WebSocket terminals and browser target grants. All writes go through the
controller; the host CLI authenticates using `.lab/maintenance-key`.

Runtime state lives under `.lab/instances/<run-id>`. Each directory contains a
snapshot of the lab source, generated Compose definition, flag environment and
scope file. Source addresses, including reverse DNS records, are rendered into
the allocated network. In the toolbox, `lab-scope` shows the actual addresses.
The portal renders the same addresses in its lesson and solution.

The lab API preserves `/api/standalone/<lab-id>/...`, now scoped to the signed-in
account. Lifecycle calls return 202 while status is polled. Objective submission
and checks include the current `runId` to reject stale browser requests.
Browser WebSockets use `reconlab.terminal.v1`; the server chooses the toolbox
from the authenticated run, never from a client-supplied container ID.

Only Lab 07 and Lab 09 declare browser entrypoints. Their target tabs open
through a one-use launch ticket on a separate `.localhost` hostname. Gateway
cookies never reach the target; portal cookies never reach the gateway hostname.
Target grants are revoked by stop, expiry, account disable and session revocation.
Each entrypoint has a small fixed-destination HTTP relay on an ingress bridge;
the target and toolbox remain exclusively on internal networks. The relay cannot
select an arbitrary destination from request data. Its Docker port binds to
loopback and is accessible to the machine owner, just like the Docker daemon
and runtime files.

Admin controls create/disable learners, reset passwords, display active-instance
capacity and stop runs. Password changes/reset revoke prior sessions. The
administrator changes their own password from the account menu.

Host CLI examples (default account: first administrator):

```sh
node scripts/standalone-labctl.mjs start 00-terminal-basics --user alice
node scripts/standalone-labctl.mjs shell 00-terminal-basics --user alice
node scripts/standalone-labctl.mjs status 00-terminal-basics --user alice
node scripts/standalone-labctl.mjs stop 00-terminal-basics --user alice
```

CLI lifecycle and verification need the controller running. The CLI is a machine
owner tool; it is not an account-security boundary. Before account setup the
historical CLI behavior remains available. Run `npm run labs:prepare` to cache
build layers; no learner instance is started by that command.

Process environment settings: `LAB_INSTANCE_POOL_CIDR=10.240.0.0/16`,
`LAB_MAX_ACTIVE_INSTANCES=2`, `LAB_CONTROLLER_PORT=3030`, `LAB_TARGET_PORT=3031`.
The pool must be a private IPv4 /16 through /24. Allocation excludes existing
Docker networks, host routes and recorded run allocations. Run `npm run doctor`
after changing the pool. Set these in the launching shell; `.env.example` is a
reference, not an automatically loaded controller configuration file.

## Verification

`npm test`, `npm run lint`, and TypeScript check the portal and API contracts.
`node scripts/verify-instances.mjs` tests all 11 labs with disposable state and
containers, including smoke, stop/resume and reset. An optional starting numeric
prefix resumes the suite, for example `node scripts/verify-instances.mjs 03`.
`node scripts/verify-instance-browser.mjs` uses headless Edge with temporary
accounts and a separate preview on ports 5174/3032/3033. It does not migrate or
reset the user's saved runs.

For rollback, stop managed instances, retain `.lab` and its backups, and restore
the earlier application version. Existing `.runtime` files remain the pre-import
snapshot; new account progress is not automatically exported back into them.
