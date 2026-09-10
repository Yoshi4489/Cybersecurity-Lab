# Lab 16 — Tokens After Goodbye

## Where commands run

### HOST
Your own machine in the project directory. Start, stop, and verify the lab here.

### TOOLBOX
The isolated Linux shell. Run `curl` and `jq` here. `session-review` exists only on the private lab network.

### PORTAL
Use `http://127.0.0.1:5173/` to read task cards, save the final evidence report, and submit flags.

**Level:** Intermediate · **Mode:** Guided · **Time:** 75 minutes
**Difficulty band:** intermediate-capstone

## Scenario

ApertureOps receives reports that copied tokens continue working after account security events. You are authorized to examine only the synthetic `session-review:8080` service and credentials returned by your own `POST /case`. The service uses an explicit fixed clock (`1700000000`) so every learner sees the same sequence. Do not send these techniques or tokens to any external system.

## What you need to know

A signed access token can remain cryptographically valid until expiry while the account state has changed. A hardened service therefore checks server-side session revocation after logout and a credential version after password change. Refresh tokens need different handling: rotate them at every use, permit each token once, and revoke the whole token family if an old token reappears. A successful first request is as important as a rejected replay; otherwise “fixed” might simply mean unavailable.

## Start the lab

**HOST — start the lab and enter its toolbox**
```sh
node scripts/standalone-labctl.mjs start 16-session-replay
node scripts/standalone-labctl.mjs shell 16-session-replay
```

**TOOLBOX — create isolated evidence**
```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://session-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
jq '{clock,sessions}' /tmp/case.json
```

## Objectives

### Flag 1 — Build the replay timeline (`replay-timeline`)

For `logout` and `password`, first confirm the hardened resource accepts its matching access token. Record the state transition with `POST /event`, then replay the same token against both `mode=vulnerable` and `mode=hardened`. For refresh rotation, show that `weak_refresh_token` works twice at the vulnerable endpoint. Then use `refresh_token` once at the hardened endpoint, replay the old token, and test the new successor after family revocation.

### Flag 2 — Prove revocation and rotation (`revocation-proof`)

Submit the exact six observations to `/timeline`, then submit all four remediation controls with its returned `timeline_token`. Save a final Finding / Evidence / Impact / Confidence / Recommended remediation report in PORTAL.

## Hints

### Flag 1 — replay-timeline
<details>
<summary>Hint 1 — preserve each token</summary>

The before and after requests must use the same access token. Copying it into a shell variable makes that visible.

</details>
<details>
<summary>Hint 2 — interpret the difference</summary>

The vulnerable path checks token identity only. The hardened path additionally checks logout revocation or credential version.

</details>
<details>
<summary>Hint 3 — refresh evidence</summary>

Save the first hardened refresh response. Its `refresh_token` is the successor to test after replaying the old token.

</details>

### Flag 2 — revocation-proof
<details>
<summary>Hint 1 — exact observations</summary>

Use the response `reason` values, not HTTP status labels, in the timeline object.

</details>
<details>
<summary>Hint 2 — positive and negative proof</summary>

Cite the successful initial resource and first refresh requests as well as all rejected stale/replayed requests.

</details>
<details>
<summary>Hint 3 — controls</summary>

All four values are JSON booleans: `revoke_session_on_logout`, `invalidate_sessions_on_password_change`, `rotate_refresh_once`, and `revoke_family_on_reuse`.

</details>

## Solution

**TOOLBOX — execute every lifecycle transition and capture each reason**

```sh
logout_token=$(jq -r .sessions.logout.access_token /tmp/case.json)
password_token=$(jq -r .sessions.password.access_token /tmp/case.json)
weak_refresh_token=$(jq -r .sessions.rotation.weak_refresh_token /tmp/case.json)
refresh_token=$(jq -r .sessions.rotation.refresh_token /tmp/case.json)
resource_reason() {
  curl -sS -H "Authorization: Bearer $1" "http://session-review:8080/resource?case_id=$case_id&mode=$2&scenario=$3" | jq -r .reason
}
record_event() {
  jq -cn --arg case_id "$case_id" --arg scenario "$1" --arg action "$2" '{case_id:$case_id,scenario:$scenario,action:$action}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/event | jq -r .reason
}

before_logout=$(resource_reason "$logout_token" hardened logout)
record_event logout logout
logout_vulnerable=$(resource_reason "$logout_token" vulnerable logout)
logout_hardened=$(resource_reason "$logout_token" hardened logout)

before_password=$(resource_reason "$password_token" hardened password)
record_event password password-change
password_vulnerable=$(resource_reason "$password_token" vulnerable password)
password_hardened=$(resource_reason "$password_token" hardened password)

weak_first=$(jq -cn --arg case_id "$case_id" --arg token "$weak_refresh_token" '{case_id:$case_id,refresh_token:$token}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://session-review:8080/refresh?mode=vulnerable' | jq -r .reason)
refresh_vulnerable_reuse=$(jq -cn --arg case_id "$case_id" --arg token "$weak_refresh_token" '{case_id:$case_id,refresh_token:$token}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://session-review:8080/refresh?mode=vulnerable' | jq -r .reason)
strong_first=$(jq -cn --arg case_id "$case_id" --arg token "$refresh_token" '{case_id:$case_id,refresh_token:$token}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://session-review:8080/refresh?mode=hardened')
successor=$(printf '%s' "$strong_first" | jq -r .refresh_token)
refresh_hardened_reuse=$(jq -cn --arg case_id "$case_id" --arg token "$refresh_token" '{case_id:$case_id,refresh_token:$token}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://session-review:8080/refresh?mode=hardened' | jq -r .reason)
successor_after_reuse=$(jq -cn --arg case_id "$case_id" --arg token "$successor" '{case_id:$case_id,refresh_token:$token}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- 'http://session-review:8080/refresh?mode=hardened' | jq -r .reason)

printf 'before logout=%s; after vulnerable=%s hardened=%s\n' "$before_logout" "$logout_vulnerable" "$logout_hardened"
printf 'before password-change=%s; after vulnerable=%s hardened=%s\n' "$before_password" "$password_vulnerable" "$password_hardened"
printf 'weak first=%s reuse=%s; strong reuse=%s successor=%s\n' "$weak_first" "$refresh_vulnerable_reuse" "$refresh_hardened_reuse" "$successor_after_reuse"
```

**TOOLBOX — derive the timeline submission from captured responses**

```sh
observations=$(jq -cn \
  --arg a "$logout_vulnerable" --arg b "$logout_hardened" \
  --arg c "$password_vulnerable" --arg d "$password_hardened" \
  --arg e "$refresh_vulnerable_reuse" --arg f "$refresh_hardened_reuse" \
  '{logout_vulnerable:$a,logout_hardened:$b,password_vulnerable:$c,password_hardened:$d,refresh_vulnerable_reuse:$e,refresh_hardened_reuse:$f}')
printf '%s\n' "$observations" | jq .
timeline=$(jq -cn --arg case_id "$case_id" --argjson observations "$observations" '{case_id:$case_id,observations:$observations}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/timeline)
printf '%s\n' "$timeline" | jq .
timeline_token=$(printf '%s' "$timeline" | jq -r .timeline_token)
jq -cn --arg case_id "$case_id" --arg timeline_token "$timeline_token" '{case_id:$case_id,timeline_token:$timeline_token,controls:{revoke_session_on_logout:true,invalidate_sessions_on_password_change:true,rotate_refresh_once:true,revoke_family_on_reuse:true}}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/remediation
```

**HOST — verify displayed flags**
```sh
node scripts/standalone-labctl.mjs verify 16-session-replay replay-timeline 'RLAB{...}'
node scripts/standalone-labctl.mjs verify 16-session-replay revocation-proof 'RLAB{...}'
```

## Final evidence prompts

- **Finding:** Which transitions left a reusable token on the vulnerable path?
- **Evidence:** Which fixed-clock HTTP responses prove before-state access, after-state rejection, and refresh reuse detection?
- **Impact:** What application data or actions could a copied session retain?
- **Confidence:** How do the controlled positive and negative requests support your rating?
- **Recommended remediation:** Which revocation, credential-version, rotation, and family controls are required?

## What this taught you

Expiry limits token lifetime but does not implement logout. Password changes need an account-wide session invalidation signal. Refresh rotation becomes detection only when reuse revokes the related family and requires reauthentication.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 16-session-replay
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 16-session-replay
```
