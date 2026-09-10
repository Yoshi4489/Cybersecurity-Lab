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

**HOST**
```sh
node scripts/standalone-labctl.mjs start 17-authorization-capstone
node scripts/standalone-labctl.mjs shell 17-authorization-capstone
```

**TOOLBOX**
```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
jq .evidence_sources /tmp/case.json
for source in $(jq -r '.evidence_sources[]' /tmp/case.json); do
  curl -sS "http://authz-review:8080/evidence/$source?case_id=$case_id" | jq .
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

The correlation is:
```json
{"actor":"analyst-17","session_id":"sid-17","jwt_jti":"jwt-17","bola_object":"acct-9002","role":"analyst","csrf_request":"req-403","replay_request":"req-402","excluded_decoy":"noise-900"}
```

**TOOLBOX — submit correlation**
```sh
correlation='{"actor":"analyst-17","session_id":"sid-17","jwt_jti":"jwt-17","bola_object":"acct-9002","role":"analyst","csrf_request":"req-403","replay_request":"req-402","excluded_decoy":"noise-900"}'
correlated=$(jq -cn --arg case_id "$case_id" --argjson correlation "$correlation" '{case_id:$case_id,correlation:$correlation}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://authz-review:8080/correlate)
correlation_token=$(printf '%s' "$correlated" | jq -r .correlation_token)
```

**TOOLBOX — prepare credentials and run representative probes**
```sh
access=$(jq -r .credentials.access_token /tmp/case.json)
session=$(jq -r .credentials.session_cookie /tmp/case.json)
csrf=$(jq -r .credentials.csrf_token /tmp/case.json)
auth=(-H "Authorization: Bearer $access" -H "Cookie: session=$session")
curl -sS "${auth[@]}" http://authz-review:8080/hardened/accounts/acct-1001
curl -sS "${auth[@]}" http://authz-review:8080/hardened/accounts/acct-9002
curl -sS -X POST "${auth[@]}" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/hardened/admin/export
curl -sS -X POST "${auth[@]}" -H 'Content-Type: application/json' -d '{}' http://authz-review:8080/hardened/profile
curl -sS -X POST "${auth[@]}" -H "X-CSRF-Token: $csrf" -H 'X-Request-ID: proof-17' -H 'Content-Type: application/json' -d '{"amount":5}' http://authz-review:8080/hardened/transfer
# Repeat the final command unchanged to observe replay-detected.
```

Also request the owner route once with `Cookie: session=sid-noise` to prove binding rejection.

**TOOLBOX — submit the control proof**
```sh
results='{"jwt":"jwt-invalid","owner_access":"accepted","bola":"object-owner-mismatch","role":"role-denied","csrf":"csrf-invalid","cookie_binding":"session-binding-mismatch","replay":"replay-detected"}'
controls='{"verify_jwt":true,"bind_cookie_session":true,"enforce_csrf":true,"authorize_object_owner":true,"enforce_role_server_side":true,"reject_duplicate_request_id":true}'
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
