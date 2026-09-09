# Lab 16 — Tokens After Goodbye

## Where commands run

### HOST
Your own machine in the project directory. Start, stop, and verify the lab here.

### TOOLBOX
The isolated Linux shell. Run `curl` and `jq` here. `session-review` exists only on the private lab network.

### PORTAL
Use `http://127.0.0.1:5173/` to read task cards, save the final evidence report, and submit flags.

**Level:** Intermediate · **Mode:** Guided · **Time:** 75 minutes  
**Difficulty band:** intermediate-foundations

## Scenario

ApertureOps receives reports that copied tokens continue working after account security events. You are authorized to examine only the synthetic `session-review:8080` service and credentials returned by your own `POST /case`. The service uses an explicit fixed clock (`1700000000`) so every learner sees the same sequence. Do not send these techniques or tokens to any external system.

## What you need to know

A signed access token can remain cryptographically valid until expiry while the account state has changed. A hardened service therefore checks server-side session revocation after logout and a credential version after password change. Refresh tokens need different handling: rotate them at every use, permit each token once, and revoke the whole token family if an old token reappears. A successful first request is as important as a rejected replay; otherwise “fixed” might simply mean unavailable.

## Start the lab

**HOST**
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

### replay-timeline
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

### revocation-proof
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

**TOOLBOX — logout comparison**
```sh
logout_token=$(jq -r .sessions.logout.access_token /tmp/case.json)
curl -sS -H "Authorization: Bearer $logout_token" "http://session-review:8080/resource?case_id=$case_id&mode=hardened&scenario=logout"
jq -cn --arg case_id "$case_id" '{case_id:$case_id,scenario:"logout",action:"logout"}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/event
curl -sS -H "Authorization: Bearer $logout_token" "http://session-review:8080/resource?case_id=$case_id&mode=vulnerable&scenario=logout"
curl -sS -H "Authorization: Bearer $logout_token" "http://session-review:8080/resource?case_id=$case_id&mode=hardened&scenario=logout"
```

Repeat with `.sessions.password.access_token`, scenario `password`, and action `password-change`. Exercise `/refresh?mode=vulnerable` twice with `weak_refresh_token`. Exercise `/refresh?mode=hardened` first and again with the original `refresh_token`, then once with the successor.

**TOOLBOX — submit evidence and controls**
```sh
observations='{"logout_vulnerable":"accepted","logout_hardened":"session-revoked","password_vulnerable":"accepted","password_hardened":"credential-version-stale","refresh_vulnerable_reuse":"accepted","refresh_hardened_reuse":"refresh-replayed-family-revoked"}'
timeline=$(jq -cn --arg case_id "$case_id" --argjson observations "$observations" '{case_id:$case_id,observations:$observations}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://session-review:8080/timeline)
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
