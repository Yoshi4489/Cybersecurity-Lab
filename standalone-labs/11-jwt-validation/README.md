# Lab 11 — Claims Under Oath

## Where commands run

### HOST

Your own machine in the project directory. Run lifecycle and verification commands here. The `shell` command opens TOOLBOX.

### TOOLBOX

The isolated Linux shell. Run `curl`, `jq`, and the investigation commands here; `jwt-review` resolves only inside this lab network.

### PORTAL

The browser application at `http://127.0.0.1:5173/`. Start the lab, read task cards, save the formative evidence report, and submit flags here.

**Level:** Intermediate · **Mode:** Guided · **Time:** 75 minutes

**Difficulty band:** intermediate-foundations

## Scenario

ApertureOps replaced the unsigned-token behavior from Lab 07. A reviewer now claims the replacement is secure because it “checks the signature.” You are authorized to test that statement against synthetic tokens. Build a validation matrix, separate authentication failures from authorization failures, and prove the complete trust policy without contacting any external service.

## What you need to know

A JWT has Base64url-encoded header and payload segments plus a signature. Decoding shows claims but proves neither their origin nor integrity. A fixed validator must allowlist its algorithm, select only an active trusted key, verify the signature over the original encoded segments, validate issuer, audience and expiry, and enforce the required subject/role on the server. Rejecting every token is not a successful fix: the valid fixture must still work.

`POST /case` returns a unique case ID, the expected policy, and named token fixtures. Send the case ID as `X-Case-ID` and each token as an `Authorization: Bearer ...` header to `GET /fixed`. The response's `reason` field is evidence.

## Start the lab

**HOST — start and enter the lab**

```sh
node scripts/standalone-labctl.mjs start 11-jwt-validation
node scripts/standalone-labctl.mjs shell 11-jwt-validation
```

Keep a second HOST terminal for flag verification. All remaining investigation commands run in TOOLBOX.

## Objectives

### Flag 1 — Build the validation matrix (`validation-matrix`)

Create a case, test every named fixture at `/fixed`, and record each reason. Submit the complete name-to-reason object to `/matrix`. Only `valid` should succeed. A wrong-role token is authenticated but unauthorized; that distinction matters.

### Flag 2 — Prove remediation (`remediation-proof`)

Use the matrix token to submit the five required controls to `/remediation`. Write the formative Finding / Evidence source / Impact / Confidence / Recommended remediation report in PORTAL. Your validation must preserve legitimate access while rejecting every invalid fixture for the expected reason.

## Hints

### Flag 1 — validation-matrix

<details>
<summary>Hint 1 — where to look</summary>

Create a case before testing tokens; the reply names every fixture and the expected issuer, audience, active key and role.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Save the case JSON, then use `jq -r '.fixtures.valid'` and send it with the case ID to `/fixed`. Repeat for every fixture.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Use `curl -sS -H "X-Case-ID: $case_id" -H "Authorization: Bearer $token" http://jwt-review:8080/fixed` and build a JSON `results` object matching the returned reasons.

</details>

### Flag 2 — remediation-proof

<details>
<summary>Hint 1 — where to look</summary>

The failure names map directly to controls: algorithm, key, signature, standard claims, and authorization.

</details>

<details>
<summary>Hint 2 — what to try</summary>

All five control values are JSON booleans, not strings. Include the matrix token returned by the previous report.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Submit `verify_signature`, `allowlist_algorithm`, `validate_issuer_audience_expiry`, `enforce_role_server_side`, and `reject_retired_keys` as `true`.

</details>

## Solution

**TOOLBOX — create a case and test one fixture**

```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://jwt-review:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
token=$(jq -r .fixtures.valid /tmp/case.json)
curl -sS -H "X-Case-ID: $case_id" -H "Authorization: Bearer $token" http://jwt-review:8080/fixed
```

Repeat the request for all fixture names. The complete result is:

```json
{"valid":"accepted","alg_none":"algorithm","bad_signature":"signature","expired":"expiry","wrong_issuer":"issuer","wrong_audience":"audience","old_key":"key-retired","wrong_role":"authorization","tampered_role":"signature"}
```

**TOOLBOX — submit the matrix and remediation controls**

```sh
results='{"valid":"accepted","alg_none":"algorithm","bad_signature":"signature","expired":"expiry","wrong_issuer":"issuer","wrong_audience":"audience","old_key":"key-retired","wrong_role":"authorization","tampered_role":"signature"}'
matrix=$(jq -cn --arg case_id "$case_id" --argjson results "$results" '{case_id:$case_id,results:$results}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://jwt-review:8080/matrix)
printf '%s\n' "$matrix"
matrix_token=$(printf '%s' "$matrix" | jq -r .matrix_token)
jq -cn --arg case_id "$case_id" --arg matrix_token "$matrix_token" '{case_id:$case_id,matrix_token:$matrix_token,controls:{verify_signature:true,allowlist_algorithm:true,validate_issuer_audience_expiry:true,enforce_role_server_side:true,reject_retired_keys:true}}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://jwt-review:8080/remediation
```

**HOST — verify each displayed flag**

```sh
node scripts/standalone-labctl.mjs verify 11-jwt-validation validation-matrix 'RLAB{...}'
```

```sh
node scripts/standalone-labctl.mjs verify 11-jwt-validation remediation-proof 'RLAB{...}'
```

## What this taught you

Signature verification is necessary but incomplete. Authentication policy also constrains algorithms, active keys, issuer, audience and expiry. Authorization is a separate server-side decision. A remediation proof contains both negative cases and a successful valid case.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 11-jwt-validation
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 11-jwt-validation
```
