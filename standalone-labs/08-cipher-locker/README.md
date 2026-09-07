# Lab 08 — ApertureOps: The Recovered Cache

Level: Intermediate | Mode: challenge | Time: 35–45 minutes

## Scenario

After reviewing the ApertureOps support incident, Northstar's response lead gives you a recovered export cache. A legacy exporter wrapped the handover in base64 and stored another payload inside a tar archive. The team needs to know what leaked and whether your analyzed bytes match the acquired evidence. This lab includes its own copy of the case; no running Lab 07 or old flag is needed.

```text
encoded manifest → verified archive → decoded payload → printable session evidence → incident report
```

## What you need to know

Recommended first: Labs 05 and 07.

- **Base64** represents bytes as text. It requires no key and offers no confidentiality. Base64url uses a slightly different alphabet, as seen in Lab 07.
- `curl` downloads HTTP responses; `jq -r .field` extracts a JSON string without quotes; `base64 -d` decodes one layer.
- `sha256sum` computes an integrity fingerprint. Compare it to the manifest's reference before extraction. A matching hash proves the download matches the supplied reference, not that the publisher is authentic.
- `tar -tf` lists an archive; `tar -xf ... -C DIR` extracts into a directory made with `mkdir -p`.
- `strings` extracts printable text from binary bytes; `grep` selects relevant lines. Neither executes the artifact.
- `|` passes one command's output into the next. Explain what each stage produces before using a pipeline.

## Start the lab

Read the [setup guide](../GETTING-STARTED.md) first.

**Host terminal**, in the project directory:

```sh
node scripts/standalone-labctl.mjs start 08-cipher-locker
node scripts/standalone-labctl.mjs shell 08-cipher-locker
```

The second command enters the Linux toolbox. Investigation commands run there;
verification runs in a second **host terminal**. Scope: `cipher-vault` (172.31.8.20, port 8080), subnet 172.31.8.0/24.
All data is synthetic and each lab has its own isolated network.
Record tokens for the case and submit only the corresponding RLAB flag to verify.

## Objectives

### Flag 1 — Read the incident handover (`manifest`)

Retrieve the manifest and decode its payload. Record the first flag and the next artifact path.

### Flag 2 — Verify and decode the export (`bundle`)

Compare the downloaded archive's SHA-256 with the manifest reference. List and extract it, then follow the exporter note to decode the wrapped payload.

### Flag 3 — Inspect session evidence (`carve`)

Inspect the named binary artifact without executing it. Record its printable proof and token.

### Flag 4 — Close the cache review (`final`)

Submit the three recovered tokens and the hash of the archive you analyzed.

## Hints

Open only the hint block you need. Read one hint at a time.

### Flag 1 — manifest

<details>
<summary>Hint 1 — where to look</summary>

The root page identifies the manifest endpoint.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The response is JSON; decode the payload field rather than the whole response.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Use `curl -fsS http://cipher-vault:8080/manifest | jq -r .payload | base64 -d`.

</details>

### Flag 2 — bundle

<details>
<summary>Hint 1 — where to look</summary>

The manifest names the archive and its reference SHA-256.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Read the archive README: the exporter applied base64 twice.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

After verifying and extracting, use `base64 -d /tmp/cache/cipher-08/payload.b64 | base64 -d`.

</details>

### Flag 3 — carve

<details>
<summary>Hint 1 — where to look</summary>

The decoded payload names session.bin.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use strings to extract readable sequences, then search for evidence labels.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `strings /tmp/cache/cipher-08/session.bin | grep -E 'carve_token|binary_proof'`.

</details>

### Flag 4 — final

<details>
<summary>Hint 1 — where to look</summary>

Use your recorded evidence, including the original tar hash.

</details>

<details>
<summary>Hint 2 — what to try</summary>

The form fields are manifest, bundle, carve, archive_sha256.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

POST those fields to `http://cipher-vault:8080/final`.

</details>

## Solution

Record the `objective_flag=RLAB{...}` value at each stage and submit it with
`verify` (from the second terminal). Objectives are gated in order:
`manifest → bundle → carve → final`.

### 1. Decode the base64 manifest (`manifest`)

The manifest wraps its contents in a single base64 layer:

**Toolbox:**

```sh
curl -fsS http://cipher-vault:8080/manifest | jq -r .payload | base64 -d
# manifest_token=cache-cobalt-08 + objective_flag=RLAB{...}
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 08-cipher-locker manifest 'RLAB{...}'
```

### 2. Verify and peel the tar bundle (`bundle`)

Download the bundle, checksum it (save the hash for the final step), extract it,
then peel the **doubly** base64-encoded payload:

**Toolbox:**

```sh
curl -fsS http://cipher-vault:8080/artifact/cache.tar -o /tmp/cache.tar
curl -fsS http://cipher-vault:8080/manifest | jq -r .archive_sha256
sha256sum /tmp/cache.tar                       # save this hex value for step 4
# Compare the two hash values above; stop if they differ.
tar -tf /tmp/cache.tar
mkdir -p /tmp/cache && tar -xf /tmp/cache.tar -C /tmp/cache
base64 -d /tmp/cache/cipher-08/payload.b64 | base64 -d
# bundle_token=vault-lantern-42 + objective_flag=RLAB{...}
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 08-cipher-locker bundle 'RLAB{...}'
```

### 3. Carve the binary (`carve`)

The bundle includes `session.bin` — printable evidence hidden between
non-printable bytes. Pull it out with `strings`:

**Toolbox:**

```sh
strings /tmp/cache/cipher-08/session.bin | grep -E 'carve_token|binary_proof'
# carve_token=locker-sable-71 + binary_proof=RLAB{...}
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 08-cipher-locker carve 'RLAB{...}'
```

### 4. Submit the chained proof (`final`)

POST the three recovered tokens plus the tar's checksum. The endpoint returns
`403` until every value matches:

**Toolbox:**

```sh
curl -fsS -X POST \
  --data-urlencode 'manifest=cache-cobalt-08' \
  --data-urlencode 'bundle=vault-lantern-42' \
  --data-urlencode 'carve=locker-sable-71' \
  --data-urlencode 'archive_sha256=<sha256-from-step-2>' \
  http://cipher-vault:8080/final            # final_flag=RLAB{...}
```

**Host terminal — submit this stage's displayed flag:**

```sh
node scripts/standalone-labctl.mjs verify 08-cipher-locker final 'RLAB{...}'
```

## What this taught you

Layered encoding does not protect credentials. Hash downloads against a reference before analysis, keep secrets out of distributable artifacts, and inspect unknown files without execution. Lab 09 combines this artifact workflow with public web discovery and log correlation.

## Stop or reset

**Host terminal — finish this session without clearing submitted progress:**

```sh
node scripts/standalone-labctl.mjs status 08-cipher-locker
node scripts/standalone-labctl.mjs stop 08-cipher-locker
```

To continue later, use the start and shell commands above. Your flags and
submitted progress stay the same. Files downloaded into the toolbox's /tmp do
not survive stop; download them again when you resume.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 08-cipher-locker
```
