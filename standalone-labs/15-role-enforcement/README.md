# Lab 15 — Every Door, Every Role

## Where commands run

### HOST

Your own machine in the project directory. Run lifecycle and verification commands here. The `shell` command opens TOOLBOX.

### TOOLBOX

The isolated Linux shell. Run `curl` and `jq` here; `role-api` resolves only inside this lab's internal network.

### PORTAL

The browser application at `http://127.0.0.1:5173/`. Save the Finding / Evidence source / Impact / Confidence / Recommended remediation report and submit flags here.

**Level:** Intermediate · **Mode:** Guided · **Time:** 80 minutes

**Difficulty band:** intermediate-capstone

## Scenario

ApertureOps hides edit, delete, and archive buttons according to a user's role. Hiding controls is useful interface design, but it is not server authorization. You are authorized to test fictional viewer, editor, and admin identities against a synthetic quarterly report. Build a matrix across methods and alternate archive paths, then prove a centralized deny-by-default fix. No external target is in scope.

## What you need to know

Role-based access control maps a trusted server-side role to allowed operations. The same resource can require different decisions for `GET`, `PUT`, and `DELETE`. Alternate URLs that trigger the same action must enforce the same decision. A deny-by-default policy allows only listed combinations: new or forgotten methods and paths fail closed. Positive cases are essential because a service that denies everyone is unavailable, not securely remediated.

`POST /case` returns viewer, editor, and admin tokens plus intended policy. Send a token as `X-Lab-Token`. The vulnerable routes simulate client-menu-only protection. Fixed routes consult the server matrix. Flags appear only in validated evidence reports.

## Start the lab

**HOST — start and enter the lab**

```sh
node scripts/standalone-labctl.mjs start 15-role-enforcement
node scripts/standalone-labctl.mjs shell 15-role-enforcement
```

Keep a second HOST terminal for flag verification. All investigation requests run in TOOLBOX.

## Objectives

### Flag 1 — Build the authorization matrix (`authorization-matrix`)

Show that a viewer can directly call vulnerable delete and archive routes. Then test each of three roles against fixed GET, PUT, DELETE, admin archive, and ops archive routes. Submit the complete fifteen-entry status matrix to `/reports/matrix` and save its evidence report.

### Flag 2 — Prove deny-by-default remediation (`deny-default-proof`)

Confirm unauthenticated requests return 401 and an unlisted fixed method or path returns 403 even for admin. Submit the five remediation controls with the matrix token. Save the returned remediation report and flag.

## Hints

### Flag 1 — authorization-matrix

<details>
<summary>Hint 1 — where to look</summary>

The case policy shows intended status by role and operation. Test it rather than assuming the UI represents enforcement.

</details>

<details>
<summary>Hint 2 — what to try</summary>

For each token, request primary GET, PUT, DELETE and POST to both `/fixed/admin/.../archive` and `/fixed/ops/.../archive`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Matrix keys use `role:operation`, such as `viewer:get_primary` and `admin:post_ops_alias`. Values are numeric HTTP statuses.

</details>

### Flag 2 — deny-default-proof

<details>
<summary>Hint 1 — where to look</summary>

A central allow policy must cover both archive route spellings and have an explicit result when no rule exists.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Try admin `PATCH /fixed/reports/quarterly` and admin `GET /fixed/unlisted/quarterly`; neither appears in the allow matrix.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Set `central_policy`, `enforce_server_side`, `cover_alternate_paths`, `deny_by_default`, and `test_positive_and_negative` to `true`.

</details>

## Solution

**TOOLBOX — create a case and prove the vulnerable routes**

```sh
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' http://role-api:8080/case > /tmp/case.json
case_id=$(jq -r .case_id /tmp/case.json)
viewer=$(jq -r .roles.viewer.token /tmp/case.json)
curl -sS -X DELETE -H "X-Lab-Token: $viewer" http://role-api:8080/vulnerable/reports/quarterly
curl -sS -X POST -H 'Content-Type: application/json' -H "X-Lab-Token: $viewer" -d '{}' http://role-api:8080/vulnerable/admin/reports/quarterly/archive
```

**TOOLBOX — execute the complete role, method, and path matrix**

```sh
status() { curl -sS -o /tmp/role-response.json -w '%{http_code}' -X "$1" -H "X-Lab-Token: $2" -H 'Content-Type: application/json' -d '{}' "$3"; }
results='{}'
for role in viewer editor admin; do
  token=$(jq -r --arg role "$role" '.roles[$role].token' /tmp/case.json)
  while IFS='|' read -r name method route; do
    code=$(status "$method" "$token" "http://role-api:8080$route")
    key="$role:$name"
    printf '%-28s %s\n' "$key" "$code"
    results=$(printf '%s' "$results" | jq -c --arg key "$key" --argjson code "$code" '. + {($key):$code}')
  done <<'OPERATIONS'
get_primary|GET|/fixed/reports/quarterly
put_primary|PUT|/fixed/reports/quarterly
delete_primary|DELETE|/fixed/reports/quarterly
post_admin_path|POST|/fixed/admin/reports/quarterly/archive
post_ops_alias|POST|/fixed/ops/reports/quarterly/archive
OPERATIONS
done

admin=$(jq -r .roles.admin.token /tmp/case.json)
unauthenticated=$(curl -sS -o /tmp/role-response.json -w '%{http_code}' http://role-api:8080/fixed/reports/quarterly)
unlisted=$(status GET "$admin" http://role-api:8080/fixed/unlisted/quarterly)
printf 'unauthenticated=%s unlisted=%s\n' "$unauthenticated" "$unlisted"
test "$unauthenticated" = 401
test "$unlisted" = 403
printf '%s\n' "$results" | jq .
```

**TOOLBOX — submit the derived matrix and remediation controls**

```sh
matrix=$(jq -cn --arg case_id "$case_id" --argjson results "$results" '{case_id:$case_id,results:$results}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://role-api:8080/reports/matrix)
printf '%s\n' "$matrix" | jq .
matrix_token=$(printf '%s' "$matrix" | jq -r .matrix_token)
jq -cn --arg case_id "$case_id" --arg matrix_token "$matrix_token" '{case_id:$case_id,matrix_token:$matrix_token,controls:{central_policy:true,enforce_server_side:true,cover_alternate_paths:true,deny_by_default:true,test_positive_and_negative:true}}' | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- http://role-api:8080/reports/remediation | jq .
```

**HOST — verify each displayed flag**

```sh
node scripts/standalone-labctl.mjs verify 15-role-enforcement authorization-matrix 'RLAB{...}'
```

**HOST — submit the deny-by-default proof flag**

```sh
node scripts/standalone-labctl.mjs verify 15-role-enforcement deny-default-proof 'RLAB{...}'
```

## What this taught you

Interface visibility is not authorization. Enforcement belongs at the server trust boundary and must consider identity, role, operation, resource, and every path to the action. A complete matrix documents intended access, negative tests catch privilege expansion, and positive tests preserve legitimate use. Default denial protects routes that policy authors forgot to list.

## Stop or reset

Stop removes containers; submitted progress stay the same and flags stay the same.

**HOST — routine stop**

```sh
node scripts/standalone-labctl.mjs stop 15-role-enforcement
```

Reset deletes this lab's progress and creates new flags.

**HOST — destructive reset**

```sh
node scripts/standalone-labctl.mjs reset 15-role-enforcement
```
