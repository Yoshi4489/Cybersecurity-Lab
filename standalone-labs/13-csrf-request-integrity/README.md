# Lab 13 — A Preference, Not Permission

## Where commands run

### HOST

Your own machine in the project directory. Run lifecycle and verification commands here. The `shell` command opens TOOLBOX.

### TOOLBOX

The isolated Linux shell. Run `curl`, `jq`, and investigation commands here; `integrity-review` resolves only inside this lab network.

### PORTAL

The browser application at `http://127.0.0.1:5173/`. Start the lab, read tasks, save the five-part evidence report, and submit flags here.

**Level:** Intermediate · **Mode:** Guided · **Time:** 60 minutes

**Difficulty band:** intermediate-foundations

## Scenario

ApertureOps protects a harmless theme preference with a session cookie but cannot show that requests express the user's intent. You are authorized to compare vulnerable and fixed endpoints using direct synthetic HTTP requests. There is no real browser victim, deceptive page, payment, message, or external target.

## What you need to know

Browsers can attach session cookies automatically, so authentication alone does not establish intent for a state change. The fixed endpoint requires an unpredictable CSRF token bound to that session and an exact trusted `Origin`. Origin validation is defense in depth, not a substitute for the token. The exercise changes only `slate`, `amber`, or `blue` in memory.

## Start the lab

**HOST — start and enter the lab**

```sh
node scripts/standalone-labctl.mjs start 13-csrf-request-integrity
node scripts/standalone-labctl.mjs shell 13-csrf-request-integrity
```

## Objectives

### Flag 1 — Measure the gap (`integrity-gap`)

Create a synthetic session, make a cross-site-style request with an untrusted Origin and no token to `/vulnerable/preference`, then show that the fixed endpoint rejects a missing token and a wrong Origin.

### Flag 2 — Prove request integrity (`request-integrity`)

Show that another session's token fails, then send the matching session token and trusted Origin and verify the harmless preference changes. This negative and positive evidence distinguishes a working control from an endpoint that rejects everything.

## Hints

### Flag 1 — integrity-gap

<details>
<summary>Hint 1 — where to look</summary>

The case response has `Set-Cookie`, `csrf_token`, and `trusted_origin`; save both headers and body.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Send `Origin: http://untrusted.invalid` and the session cookie to each endpoint, first without `X-CSRF-Token`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

The finding records statuses 200, 403, and 403 for vulnerable cross-site, fixed missing-token, and fixed wrong-Origin requests.

</details>

### Flag 2 — request-integrity

<details>
<summary>Hint 1 — where to look</summary>

Create a second case to obtain a token that is valid in isolation but bound to a different session.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Keep the first session cookie while trying the second token; expect `csrf-token`. Then retry with the first token and exact trusted Origin.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Submit four true controls: `require_session_cookie`, `require_csrf_token`, `bind_token_to_session`, and `validate_origin`.

</details>

## Solution

**TOOLBOX — create a session and record its cookie, token, and Origin**

```sh
curl -sS -D /tmp/headers -X POST -H 'Content-Type: application/json' -d '{}' http://integrity-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
token=$(jq -r .csrf_token /tmp/case.json)
trusted=$(jq -r .trusted_origin /tmp/case.json)
session=$(tr -d '\r' < /tmp/headers | sed -n 's/^Set-Cookie: session=\([^;]*\).*/\1/p')
```

**TOOLBOX — compare vulnerable and fixed requests**

```sh
curl -sS -o /dev/null -w 'vulnerable=%{http_code}\n' -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -H 'Origin: http://untrusted.invalid' -d "{\"case_id\":\"$case_id\",\"theme\":\"amber\"}" http://integrity-review:8080/vulnerable/preference
curl -sS -o /dev/null -w 'no_token=%{http_code}\n' -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -H "Origin: $trusted" -d "{\"case_id\":\"$case_id\",\"theme\":\"blue\"}" http://integrity-review:8080/fixed/preference
curl -sS -o /dev/null -w 'wrong_origin=%{http_code}\n' -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -H "X-CSRF-Token: $token" -H 'Origin: http://untrusted.invalid' -d "{\"case_id\":\"$case_id\",\"theme\":\"blue\"}" http://integrity-review:8080/fixed/preference
finding=$(curl -sS -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -d "{\"case_id\":\"$case_id\",\"vulnerable_cross_site_status\":200,\"fixed_without_token_status\":403,\"fixed_wrong_origin_status\":403}" http://integrity-review:8080/finding)
printf '%s\n' "$finding"
finding_token=$(printf '%s' "$finding" | jq -r .finding_token)
```

**TOOLBOX — prove token binding, preserve valid use, and submit controls**

```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://integrity-review:8080/case > /tmp/other.json
other_token=$(jq -r .csrf_token /tmp/other.json)
curl -sS -o /dev/null -w 'other_token=%{http_code}\n' -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -H "X-CSRF-Token: $other_token" -H "Origin: $trusted" -d "{\"case_id\":\"$case_id\",\"theme\":\"blue\"}" http://integrity-review:8080/fixed/preference
curl -sS -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" -H "X-CSRF-Token: $token" -H "Origin: $trusted" -d "{\"case_id\":\"$case_id\",\"theme\":\"blue\"}" http://integrity-review:8080/fixed/preference
curl -sS -H "Cookie: session=$session" http://integrity-review:8080/preference
jq -cn --arg case_id "$case_id" --arg finding_token "$finding_token" '{case_id:$case_id,finding_token:$finding_token,controls:{require_session_cookie:true,require_csrf_token:true,bind_token_to_session:true,validate_origin:true}}' | curl -sS -X POST -H 'Content-Type: application/json' -H "Cookie: session=$session" --data-binary @- http://integrity-review:8080/remediation
```

**HOST — verify each displayed flag**

```sh
node scripts/standalone-labctl.mjs verify 13-csrf-request-integrity integrity-gap 'RLAB{...}'
node scripts/standalone-labctl.mjs verify 13-csrf-request-integrity request-integrity 'RLAB{...}'
```

## What this taught you

A session proves who is authenticated, not why a state-changing request was sent. Bind an unpredictable token to the session, validate the exact Origin, reject mismatches, and retain a tested legitimate path. SameSite cookies can add defense in depth but are not the sole integrity control.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 13-csrf-request-integrity
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 13-csrf-request-integrity
```
