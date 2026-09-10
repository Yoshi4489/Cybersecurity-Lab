# Lab 17 — One Request, Five Boundaries

## Where commands run

### HOST
Run lifecycle and flag-verification commands from the project directory.

### TOOLBOX
Use the isolated shell for `curl`, `jq`, and correlation notes. `authz-review` is reachable only inside this lab.

### PORTAL
Use `http://127.0.0.1:5173/` for task cards, the final evidence report, and flag submission.

**Level:** Intermediate · **Mode:** Capstone · **Time:** 100 minutes
**Difficulty band:** intermediate-capstone

## Scenario

ApertureOps detected account-record access that may connect to an old analyst session. Reviewers exported five local sources, but one event may be unrelated. You are authorized to correlate only the synthetic evidence returned by your own case and probe only `authz-review:8080`. The target is an evidence-driven defensive validation service, not a generic exploit environment. Nothing requires or permits contacting an external host.

## What you need to know

- JWT validation: a readable claim is not trusted until integrity and policy checks pass.
- Cookie and CSRF boundaries: session binding and cross-site request protection answer different questions.
- BOLA and role authorization: ownership checks and operation-level privileges are independent.
- Replay defense: a valid credential does not make a duplicate sensitive request valid.
- Evidence correlation: shared identifiers support a chain; conflicting identifiers can support exclusion.

## Start the lab

**HOST — start the lab and enter its toolbox**
```sh
node scripts/standalone-labctl.mjs start 17-authorization-capstone
node scripts/standalone-labctl.mjs shell 17-authorization-capstone
```

**TOOLBOX — collect the synthetic evidence bundle**
```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
jq .evidence_sources /tmp/case.json
for source in $(jq -r '.evidence_sources[]' /tmp/case.json); do
  curl -sS "http://authz-review:8080/evidence/$source?case_id=$case_id" > "/tmp/$source"
  jq . "/tmp/$source"
done
```

## Objectives

### Flag 1 — Correlate the incident (`incident-correlation`)

Join the gateway, auth audit, app audit, and browser trace using request IDs, actor, JWT `jti`, session ID, role, object ID, and CSRF state. Evaluate the scanner record rather than discarding it by name: explain why its identifiers and context do not join the chain. Submit the eight-field correlation to `/correlate`.

### Flag 2 — Validate layered controls (`layered-control-proof`)

Use the case credentials to run these controlled probes:

1. a tampered JWT is denied;
2. the analyst's own account is accepted (positive control);
3. another account object is denied;
4. an admin export is denied by role;
5. a state-changing request without CSRF is denied;
6. a mismatched cookie is denied despite a valid JWT;
7. the first transfer request ID succeeds and its duplicate is rejected.

Submit the seven response reasons and six controls to `/controls` with the correlation token. Then write the final evidence report in PORTAL.

## Hints

### Flag 1 — incident-correlation
<details>
<summary>Hint 1 — begin with request IDs</summary>

Start at `req-401`, then look for its session, actor, JWT `jti`, and object in other sources.

</details>
<details>
<summary>Hint 2 — distinguish attempted and observed impact</summary>

The other-account event was allowed by the legacy path. The admin export has a different, denied decision; do not claim it succeeded.

</details>
<details>
<summary>Hint 3 — evaluate the decoy</summary>

Compare `noise-900` by actor, session, path, and stated purpose. Several mismatches make exclusion defensible.

</details>

### Flag 2 — layered-control-proof
<details>
<summary>Hint 1 — keep three credentials separate</summary>

The JWT proves token claims, the cookie binds the browser session, and the CSRF header proves the state-changing request carries the per-session token.

</details>
<details>
<summary>Hint 2 — authorization has two levels</summary>

Object ownership decides which account the analyst may read. Role decides whether the analyst may run an admin operation.

</details>
<details>
<summary>Hint 3 — replay needs a stable identifier</summary>

Send the same non-empty `X-Request-ID` twice to `/hardened/transfer`; the first is the positive control for the second.

</details>

## Solution

**TOOLBOX — derive and submit the correlation from saved sources**

```sh
incident_request=$(jq -r '.events[] | select(.decision=="legacy-owner-check-missing") | .request_id' /tmp/app-audit.json)
actor=$(jq -r --arg request "$incident_request" '.events[] | select(.request_id==$request) | .actor' /tmp/auth-audit.json)
session_id=$(jq -r --arg request "$incident_request" '.events[] | select(.request_id==$request) | .session_id' /tmp/auth-audit.json)
jwt_jti=$(jq -r --arg request "$incident_request" '.events[] | select(.request_id==$request) | .jti' /tmp/auth-audit.json)
bola_object=$(jq -r --arg request "$incident_request" '.events[] | select(.request_id==$request) | .requested_object' /tmp/app-audit.json)
role=$(jq -r --arg request "$incident_request" '.events[] | select(.request_id==$request) | .role' /tmp/auth-audit.json)
csrf_request=$(jq -r '.events[] | select(.csrf==null) | .request_id' /tmp/browser-trace.json)
replay_request=$(jq -r '.events[] | select(has("duplicate_of")) | .request_id' /tmp/gateway.log)
excluded_decoy=$(jq -r '.events[] | select(.actor=="health-scanner") | .request_id' /tmp/scanner-decoy.log)
correlation=$(jq -cn \
  --arg actor "$actor" --arg session_id "$session_id" --arg jwt_jti "$jwt_jti" \
  --arg bola_object "$bola_object" --arg role "$role" --arg csrf_request "$csrf_request" \
  --arg replay_request "$replay_request" --arg excluded_decoy "$excluded_decoy" \
  '{actor:$actor,session_id:$session_id,jwt_jti:$jwt_jti,bola_object:$bola_object,role:$role,csrf_request:$csrf_request,replay_request:$replay_request,excluded_decoy:$excluded_decoy}')
printf '%s\n' "$correlation" | jq .
correlated=$(jq -cn --arg case_id "$case_id" --argjson correlation "$correlation" '{case_id:$case_id,correlation:$correlation}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://authz-review:8080/correlate)
printf '%s\n' "$correlated" | jq .
correlation_token=$(printf '%s' "$correlated" | jq -r .correlation_token)
```

**TOOLBOX — execute all seven positive and negative probes**

```sh
access=$(jq -r .credentials.access_token /tmp/case.json)
session=$(jq -r .credentials.session_cookie /tmp/case.json)
decoy_session=$(jq -r .credentials.decoy_cookie /tmp/case.json)
csrf=$(jq -r .credentials.csrf_token /tmp/case.json)
tampered="${access}x"

jwt=$(curl -sS -H "Authorization: Bearer $tampered" -H "Cookie: session=$session" http://authz-review:8080/hardened/accounts/acct-1001 | jq -r .reason)
owner_access=$(curl -sS -H "Authorization: Bearer $access" -H "Cookie: session=$session" http://authz-review:8080/hardened/accounts/acct-1001 | jq -r .reason)
bola=$(curl -sS -H "Authorization: Bearer $access" -H "Cookie: session=$session" http://authz-review:8080/hardened/accounts/acct-9002 | jq -r .reason)
role_result=$(curl -sS -X POST -H "Authorization: Bearer $access" -H "Cookie: session=$session" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/hardened/admin/export | jq -r .reason)
csrf_result=$(curl -sS -X POST -H "Authorization: Bearer $access" -H "Cookie: session=$session" -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/hardened/profile | jq -r .reason)
mismatched_cookie=$(curl -sS -H "Authorization: Bearer $access" -H "Cookie: session=$decoy_session" http://authz-review:8080/hardened/accounts/acct-1001 | jq -r .reason)
first_transfer=$(curl -sS -X POST -H "Authorization: Bearer $access" -H "Cookie: session=$session" -H "X-CSRF-Token: $csrf" -H 'X-Request-ID: proof-17' -H 'Content-Type: application/json' -d '{"amount":5}' http://authz-review:8080/hardened/transfer | jq -r .reason)
duplicate=$(curl -sS -X POST -H "Authorization: Bearer $access" -H "Cookie: session=$session" -H "X-CSRF-Token: $csrf" -H 'X-Request-ID: proof-17' -H 'Content-Type: application/json' -d '{"amount":5}' http://authz-review:8080/hardened/transfer | jq -r .reason)
printf 'jwt=%s owner=%s bola=%s role=%s csrf=%s mismatched-cookie=%s first=%s duplicate=%s\n' "$jwt" "$owner_access" "$bola" "$role_result" "$csrf_result" "$mismatched_cookie" "$first_transfer" "$duplicate"
```

**TOOLBOX — derive and submit the control proof**

```sh
results=$(jq -cn --arg jwt "$jwt" --arg owner "$owner_access" --arg bola "$bola" --arg role "$role_result" --arg csrf "$csrf_result" --arg cookie "$mismatched_cookie" --arg replay "$duplicate" '{jwt:$jwt,owner_access:$owner,bola:$bola,role:$role,csrf:$csrf,cookie_binding:$cookie,replay:$replay}')
controls=$(jq -cn '{verify_jwt:true,bind_cookie_session:true,enforce_csrf:true,authorize_object_owner:true,enforce_role_server_side:true,reject_duplicate_request_id:true}')
printf '%s\n' "$results" | jq .
jq -cn --arg case_id "$case_id" --arg correlation_token "$correlation_token" --argjson results "$results" --argjson controls "$controls" '{case_id:$case_id,correlation_token:$correlation_token,results:$results,controls:$controls}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://authz-review:8080/controls
```

**HOST — verify displayed flags**
```sh
node scripts/standalone-labctl.mjs verify 17-authorization-capstone incident-correlation 'RLAB{...}'
node scripts/standalone-labctl.mjs verify 17-authorization-capstone layered-control-proof 'RLAB{...}'
```

## Final evidence prompts

- **Finding:** What single incident chain is supported, and which boundary failures were observed versus only attempted?
- **Evidence:** Which identifiers join at least three sources? Which independent fields exclude `noise-900`?
- **Impact:** What account data was exposed, and why must the denied admin action remain potential rather than confirmed impact?
- **Confidence:** How strong is the correlation, and what ambiguity remains?
- **Recommended remediation:** How should JWT verification, cookie binding, CSRF, object ownership, roles, and replay IDs be enforced and retested?

## What this taught you

Authentication does not replace authorization, and no single authorization check covers every boundary. A defensible conclusion joins several independent sources, preserves competing evidence long enough to evaluate it, scopes impact to what the records show, and validates remediation with both allowed and denied traffic.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 17-authorization-capstone
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 17-authorization-capstone
```
