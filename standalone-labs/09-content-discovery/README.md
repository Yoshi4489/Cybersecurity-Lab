# Lab 09 — Northstar Archive: Close the Breach

Level: Intermediate | Mode: capstone | Time: 60–75 minutes

## Scenario

Northstar's archive migration is complete, but a customer export may have escaped.
Your lead gives you one starting URL: `http://web-archive:8080/`. Reconstruct
what the deployment exposed and identify the successful export in its evidence.
This case contains everything needed; earlier labs do not need to be running.

```text
public page → crawler policy → deployment status → repository config → encoded backup → export log → report
```

## What you need to know

Recommended first: Labs 03, 05, 06, 07, and 08.

- Reuse `curl` to read HTTP responses and `grep`/`sed` to select evidence.
- `tee FILE` saves a copy while showing the same output; `cut -d ' ' -f1` extracts a hash from sha256sum output.
- `robots.txt` gives crawler instructions. It is public and does not control access.
  A disallowed path is a lead to test, not proof that the path is accessible.
- A published `.git/config` can disclose deployment configuration and internal URLs.
  Treat discovered URLs as evidence; follow only the named local lab target.
- A `.bak` file is an old backup. It may expose data the live application hides.
- Reuse `base64 -d` and `jq` from Lab 08 to decode a JSON handover.
- Reuse `sha256sum` from Lab 05 to compare an acquired log with its reference hash.
- In this case the log columns are actor, timestamp, method, path, and HTTP status.
  `awk` selects rows by columns. A `200` response for an `/exports/` path is a
  successful export; a `403` is a denied request. The busiest actor alone does not
  establish a breach.

## Start the lab

**Host terminal**, from the project directory:

```sh
node scripts/standalone-labctl.mjs start 09-content-discovery
node scripts/standalone-labctl.mjs shell 09-content-discovery
```

Investigation commands run in the **toolbox**. Submit flags in a second
**host terminal**. Read the [setup guide](../GETTING-STARTED.md) if needed.
Scope: `web-archive` at `172.31.9.20:8080`, inside `172.31.9.0/24`.
Keep a short evidence log of path, finding, token, and why it justifies the next step.

## Objectives

### Flag 1 — Find the deployment exposure (`robots`)

Use public clues to locate the archive's status page. Record its case, deployment
finding, token, and objective flag.

### Flag 2 — Trace the repository leak (`gitleak`)

Follow the status handover to the exposed repository configuration. Identify the
backup location and encoding. Record the repository token and flag.

### Flag 3 — Recover the migration configuration (`backup`)

Retrieve and decode the disclosed backup. Recover the next artifact's location,
reference hash, case, token, and flag.

### Flag 4 — Close the breach (`final`)

Verify the artifact's integrity and determine which actor successfully downloaded
which export. Submit the three earlier tokens and your case, actor, event, and
log hash. State a remediation for the deployment exposure.

## Hints

### Flag 1 — robots

<details>
<summary>Hint 1 — where to look</summary>

Read the initial page and follow its public links.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Crawler policy may name an internal status path.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Read `/robots.txt`, then request `/server-status`.

</details>

### Flag 2 — gitleak

<details>
<summary>Hint 1 — where to look</summary>

The status response says a working tree was copied during deployment.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Git keeps configuration in its hidden directory.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Request `/.git/config` and read the deployment section.

</details>

### Flag 3 — backup

<details>
<summary>Hint 1 — where to look</summary>

Use the backup path and encoding recorded in the previous stage.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Decode the response before parsing it as JSON.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `curl -fsS http://web-archive:8080/config.php.bak | base64 -d | jq .`.

</details>

### Flag 4 — final

<details>
<summary>Hint 1 — where to look</summary>

Follow the artifact path in the decoded backup. Compare its SHA-256 before analysis.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Select a successful `/exports/` request; ignore the denied decoy export.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The actor is `migration-bot`, the event is `EXPORT-904`, and the case is
`NS-09`. The report fields are listed in the decoded backup.

</details>

## Solution

### 1. Follow the public clues (`robots`)

**Toolbox:**

```sh
curl -fsS http://web-archive:8080/
curl -fsS http://web-archive:8080/robots.txt
curl -fsS http://web-archive:8080/server-status
```

Record `robots_token=index-quartz-09` and the displayed objective flag.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 09-content-discovery robots 'RLAB{...}'
```

### 2. Read repository metadata (`gitleak`)

**Toolbox:**

```sh
curl -fsS http://web-archive:8080/.git/config
```

Record `git_token=repo-ember-33`. The deployment section discloses
`/config.php.bak` and `base64-json`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 09-content-discovery gitleak 'RLAB{...}'
```

### 3. Decode the leaked backup (`backup`)

**Toolbox:**

```sh
curl -fsS http://web-archive:8080/config.php.bak | base64 -d | tee /tmp/ns09-config.json | jq .
```

Record `backup_token=stale-onyx-58` and its objective flag. The configuration names
`/evidence/access.log`, its SHA-256, and the required report fields.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 09-content-discovery backup 'RLAB{...}'
```

### 4. Verify and correlate the export (`final`)

**Toolbox:**

```sh
curl -fsS http://web-archive:8080/evidence/access.log -o /tmp/ns09-access.log
jq -r .sha256 /tmp/ns09-config.json
sha256sum /tmp/ns09-access.log
```

Compare the hashes. Stop and reacquire the artifact if they differ. Inspect the
successful export, including its actor and event path:

```sh
awk '$5 == 200 && $4 ~ /^\/exports\// {print $1, $4}' /tmp/ns09-access.log
log_hash=$(sha256sum /tmp/ns09-access.log | cut -d ' ' -f1)
curl -fsS -X POST \
  --data-urlencode 'robots=index-quartz-09' \
  --data-urlencode 'git=repo-ember-33' \
  --data-urlencode 'backup=stale-onyx-58' \
  --data-urlencode 'case=NS-09' \
  --data-urlencode 'actor=migration-bot' \
  --data-urlencode 'event=EXPORT-904' \
  --data-urlencode "log_sha256=$log_hash" \
  http://web-archive:8080/final
```

The report is rejected if the denied event, wrong actor, or modified log hash is
supplied. Record `final_flag`.

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 09-content-discovery final 'RLAB{...}'
```

## What this taught you

Public metadata can expose a deployment mistake that leads to sensitive evidence.
The decisive finding comes from correlating the decoded configuration with a
successful export, not from merely discovering a path. Deploy only built
artifacts, deny dotfiles and backups at the web server, authorize each export,
and retain migration audit logs. This completes the nine-lab core investigation
path (Labs 01–09). With Lab 00 orientation and the optional Lab 10 elective,
RECON//LAB has eleven labs in all.

## Where to go next

You have finished the core investigation path. To keep building skills, revisit
any lab's full walkthrough to review the reasoning, try the optional Lab 10
elective, and explore beginner rooms on TryHackMe, Hack The Box, or Root-Me.
Everything in RECON//LAB is a synthetic local exercise; always confirm you are
explicitly authorized before testing any real system.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 09-content-discovery
node scripts/standalone-labctl.mjs stop 09-content-discovery
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 09-content-discovery
```
