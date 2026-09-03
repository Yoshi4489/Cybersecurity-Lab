# Lab 09 — Content Discovery: Forgotten Artifacts

A web content-discovery exercise. The `ops-archive` portal looks empty, but it
leaks the things a web root should never expose: a `robots.txt` that names
internal paths, an accidentally published `.git/` directory, and a stale `.bak`
backup left over from a migration. Follow each breadcrumb, recover its token, and
chain them into a final proof.

Every host, token, and flag is synthetic and the lab network is internal-only
(`172.31.9.0/24`, no host ports published, no outbound). Use these techniques
only against the `web-archive` service named below.

Target:

- `web-archive` (`172.31.9.20`) — an HTTP portal on `8080` serving the index,
  `robots.txt`, `/server-status`, an exposed `.git/config`, and a leftover
  `config.php.bak`.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 09-content-discovery
node scripts/standalone-labctl.mjs shell 09-content-discovery
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder — that's where you submit each flag with `verify`. Authorized scope is
`172.31.9.0/24` only; no external targets.

## Walkthrough

Record the `objective_flag=RLAB{...}` value at each stage and submit it with
`verify` (from the second terminal). Objectives are gated in order:
`robots → gitleak → backup → final`.

### 1. Follow the robots.txt breadcrumb (`robots`)

`robots.txt` is a map of what the site wants hidden. Read it, then request the
path it discloses:

```sh
curl -fsS http://web-archive:8080/robots.txt      # Disallow: /server-status and /.git/
curl -fsS http://web-archive:8080/server-status   # robots_token=index-quartz-09 + objective_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 09-content-discovery robots 'RLAB{...}'
```

### 2. Read the exposed .git configuration (`gitleak`)

`robots.txt` disallowed `/.git/` — which means it is reachable. A published
`.git` directory leaks repository config:

```sh
curl -fsS http://web-archive:8080/.git/config     # remote URL + git_token=repo-ember-33 + objective_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 09-content-discovery gitleak 'RLAB{...}'
```

### 3. Recover the leftover backup file (`backup`)

Check the homepage source for developer comments, then grab the backup they
forgot to delete:

```sh
curl -fsS http://web-archive:8080/                # HTML comment mentions config.php.bak
curl -fsS http://web-archive:8080/config.php.bak | grep -E 'backup_token|objective_flag'
# backup_token=stale-onyx-58 + objective_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 09-content-discovery backup 'RLAB{...}'
```

### 4. Submit the chained proof (`final`)

POST the three recovered tokens. The endpoint returns `403` until all match:

```sh
curl -fsS -X POST \
  --data-urlencode 'robots=index-quartz-09' \
  --data-urlencode 'git=repo-ember-33' \
  --data-urlencode 'backup=stale-onyx-58' \
  http://web-archive:8080/final            # final_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 09-content-discovery final 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 09-content-discovery
node scripts/standalone-labctl.mjs reset  09-content-discovery
node scripts/standalone-labctl.mjs stop   09-content-discovery
```

`smoke` (`node scripts/standalone-labctl.mjs smoke 09-content-discovery`)
transiently injects the expected flags to self-check the whole chain; it is a
maintainer/CI command, not part of the solution path.

## Detection / remediation

- **Don't leak paths in robots.txt:** it is public. Use it for crawler hints, not
  as a place to name admin or status endpoints — attackers read it first.
- **Never serve `.git/` (or other dotfiles):** block them at the web server. An
  exposed repo leaks source, history, and often credentials; deploy build output,
  not the working tree.
- **Keep backups out of the web root:** `*.bak`, `*~`, `.old`, and editor swap
  files are classic finds. Store backups off the served path and deny those
  extensions at the server.
- **Review source comments before deploy:** `TODO`/`FIXME` comments routinely
  disclose forgotten files and internal hostnames.
