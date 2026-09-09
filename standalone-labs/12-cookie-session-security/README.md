# Lab 12 — The Session That Stayed

## Where commands run

### HOST

Your own machine in the project directory. Run lifecycle and verification commands here. The `shell` command opens TOOLBOX.

### TOOLBOX

The isolated Linux shell. Run `curl`, `jq`, and investigation commands here; `session-review` resolves only inside this lab network.

### PORTAL

The browser application at `http://127.0.0.1:5173/`. Start the lab, read tasks, save the five-part evidence report, and submit flags here.

**Level:** Intermediate · **Mode:** Guided · **Time:** 60 minutes

**Difficulty band:** intermediate-foundations

## Scenario

ApertureOps' fictional account service accepts a session identifier chosen before login. You are authorized to compare that deliberately vulnerable path with a repaired path. All identities and sessions are synthetic and remain on the internal lab network.

## What you need to know

A session cookie carries an identifier; the authoritative login state remains on the server. `Secure` limits transmission to HTTPS, `HttpOnly` prevents browser JavaScript from reading the cookie, and `SameSite` limits cross-site attachment. These attributes reduce exposure but do not repair fixation. The server must issue a fresh unpredictable identifier when authentication changes privilege, invalidate the old identifier, and delete server-side state on logout. A browser clearing cookie alone is insufficient.

## Start the lab

**HOST — start and enter the lab**

```sh
node scripts/standalone-labctl.mjs start 12-cookie-session-security
node scripts/standalone-labctl.mjs shell 12-cookie-session-security
```

## Objectives

### Flag 1 — Confirm fixation (`fixation-evidence`)

Create a case, send its supplied identifier to the vulnerable login, and compare the `Set-Cookie` result. Record the missing attributes and prove that the unchanged value reaches an authenticated synthetic session.

### Flag 2 — Prove the repaired lifecycle (`session-lifecycle`)

Log in through the fixed path. Prove the identifier rotates, the new cookie has all three attributes, the old ID fails, and the new ID succeeds. Then log out and prove the formerly valid ID fails. This negative and positive validation avoids mistaking “reject everything” for a repair.

## Hints

### Flag 1 — fixation-evidence

<details>
<summary>Hint 1 — where to look</summary>

Inspect both the case's `fixation_session` and the vulnerable response's `Set-Cookie` header.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use `curl -i` and explicitly send `Cookie: session=...`; headers appear before the JSON body.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The finding expects `accepted_supplied_id: true` and the ordered list `Secure`, `HttpOnly`, `SameSite`.

</details>

### Flag 2 — session-lifecycle

<details>
<summary>Hint 1 — where to look</summary>

The fixed `Set-Cookie` header should contain a new value plus `Secure`, `HttpOnly`, and `SameSite=Strict`.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Probe `/fixed/session` once with the supplied ID and once with the rotated ID, then repeat the rotated probe after logout.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The remediation controls are `secure`, `http_only`, `same_site`, `rotate_on_login`, and `invalidate_on_logout`.

</details>

## Solution

**TOOLBOX — create a case and demonstrate fixation**

```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://session-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
fixed_id=$(jq -r .fixation_session /tmp/case.json)
curl -si -X POST -H 'Content-Type: application/json' -H "Cookie: session=$fixed_id" -d "{\"case_id\":\"$case_id\"}" http://session-review:8080/vulnerable/login
curl -sS -H "Cookie: session=$fixed_id" http://session-review:8080/vulnerable/session
finding=$(curl -sS -X POST -H 'Content-Type: application/json' -d "{\"case_id\":\"$case_id\",\"accepted_supplied_id\":true,\"missing_attributes\":[\"Secure\",\"HttpOnly\",\"SameSite\"]}" http://session-review:8080/finding)
printf '%s\n' "$finding"
finding_token=$(printf '%s' "$finding" | jq -r .finding_token)
```

**TOOLBOX — rotate, test both directions, logout, and submit exact controls**

```sh
headers=$(curl -si -X POST -H 'Content-Type: application/json' -H "Cookie: session=$fixed_id" -d "{\"case_id\":\"$case_id\"}" http://session-review:8080/fixed/login)
printf '%s\n' "$headers"
rotated=$(printf '%s\n' "$headers" | tr -d '\r' | sed -n 's/^Set-Cookie: session=\([^;]*\).*/\1/p')
curl -sS -o /dev/null -w 'old=%{http_code}\n' -H "Cookie: session=$fixed_id" http://session-review:8080/fixed/session
curl -sS -o /dev/null -w 'new=%{http_code}\n' -H "Cookie: session=$rotated" http://session-review:8080/fixed/session
curl -sS -X POST -H 'Content-Type: application/json' -H "Cookie: session=$rotated" -d "{\"case_id\":\"$case_id\"}" http://session-review:8080/fixed/logout
curl -sS -o /dev/null -w 'after_logout=%{http_code}\n' -H "Cookie: session=$rotated" http://session-review:8080/fixed/session
jq -cn --arg case_id "$case_id" --arg finding_token "$finding_token" '{case_id:$case_id,finding_token:$finding_token,controls:{secure:true,http_only:true,same_site:"Strict",rotate_on_login:true,invalidate_on_logout:true}}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/remediation
```

**HOST — verify each displayed flag**

```sh
node scripts/standalone-labctl.mjs verify 12-cookie-session-security fixation-evidence 'RLAB{...}'
node scripts/standalone-labctl.mjs verify 12-cookie-session-security session-lifecycle 'RLAB{...}'
```

## What this taught you

Cookie attributes reduce different browser-side risks; none replaces server-side lifecycle controls. Rotate at login, reject the old ID, preserve a valid authenticated path, invalidate state at logout, and test both success and failure.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 12-cookie-session-security
```

**HOST — destructive reset**

Reset deletes this lab's progress and creates new flags.

```sh
node scripts/standalone-labctl.mjs reset 12-cookie-session-security
```
