# Lab 08 — Cipher Locker: Peel the Encoded Artifact

An encoding and artifact-recovery exercise. A read-only vault hands you a chain
of wrapped evidence — a base64 manifest, a checksum-verified tar bundle whose
payload is base64-encoded twice, and a binary blob with printable strings buried
in it. Peel each layer, then chain the recovered tokens into a final proof.

Every value is synthetic and generated at runtime; the lab network is
internal-only (`172.31.8.0/24`, no host ports published, no outbound). There is
nothing to "crack" here — the point is careful decoding and integrity
verification, not breaking cryptography. Use these techniques only against the
`cipher-vault` service named below.

Target:

- `cipher-vault` (`172.31.8.20`) — a read-only HTTP server on `8080` that serves
  the manifest, the `cache.tar` bundle, and accepts the final proof.

## Before you start

New to these labs? Read the **[setup guide](../GETTING-STARTED.md)** first — it
covers installing Node.js and Docker, the two-terminal workflow, and how flags and
`verify` work.

Start the lab and open the toolbox (run from the project root):

```sh
node scripts/standalone-labctl.mjs start 08-cipher-locker
node scripts/standalone-labctl.mjs shell 08-cipher-locker
```

You are now **inside** the toolbox. Keep a **second terminal** open in the project
folder — that's where you submit each flag with `verify`. Authorized scope is
`172.31.8.0/24` only; no external targets.

## Walkthrough

Record the `objective_flag=RLAB{...}` value at each stage and submit it with
`verify` (from the second terminal). Objectives are gated in order:
`manifest → bundle → carve → final`.

### 1. Decode the base64 manifest (`manifest`)

The manifest wraps its contents in a single base64 layer:

```sh
curl -fsS http://cipher-vault:8080/manifest | jq -r .payload | base64 -d
# manifest_token=cache-cobalt-08 + objective_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 08-cipher-locker manifest 'RLAB{...}'
```

### 2. Verify and peel the tar bundle (`bundle`)

Download the bundle, checksum it (save the hash for the final step), extract it,
then peel the **doubly** base64-encoded payload:

```sh
curl -fsS http://cipher-vault:8080/artifact/cache.tar -o /tmp/cache.tar
sha256sum /tmp/cache.tar                       # save this hex value for step 4
mkdir -p /tmp/cache && tar -xf /tmp/cache.tar -C /tmp/cache
base64 -d /tmp/cache/cipher-08/payload.b64 | base64 -d
# bundle_token=vault-lantern-42 + objective_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 08-cipher-locker bundle 'RLAB{...}'
```

### 3. Carve the binary (`carve`)

The bundle includes `session.bin` — printable evidence hidden between
non-printable bytes. Pull it out with `strings`:

```sh
strings /tmp/cache/cipher-08/session.bin | grep -E 'carve_token|binary_proof'
# carve_token=locker-sable-71 + binary_proof=RLAB{...}
node scripts/standalone-labctl.mjs verify 08-cipher-locker carve 'RLAB{...}'
```

### 4. Submit the chained proof (`final`)

POST the three recovered tokens plus the tar's checksum. The endpoint returns
`403` until every value matches:

```sh
curl -fsS -X POST \
  --data-urlencode 'manifest=cache-cobalt-08' \
  --data-urlencode 'bundle=vault-lantern-42' \
  --data-urlencode 'carve=locker-sable-71' \
  --data-urlencode 'archive_sha256=<sha256-from-step-2>' \
  http://cipher-vault:8080/final            # final_flag=RLAB{...}
node scripts/standalone-labctl.mjs verify 08-cipher-locker final 'RLAB{...}'
```

## Verify & reset

```sh
node scripts/standalone-labctl.mjs status 08-cipher-locker
node scripts/standalone-labctl.mjs reset  08-cipher-locker
node scripts/standalone-labctl.mjs stop   08-cipher-locker
```

`smoke` (`node scripts/standalone-labctl.mjs smoke 08-cipher-locker`) transiently
injects the expected flags to self-check the whole chain; it is a maintainer/CI
command, not part of the solution path.

## Detection / remediation

- **Encoding is not encryption:** base64 (even layered) only obscures data. Never
  rely on it to protect secrets in transit or at rest — use real encryption with
  managed keys.
- **Verify integrity by signature, not presence:** a matching checksum proves the
  bytes are intact, not authentic. Sign artifacts and verify the signature before
  trusting a bundle.
- **Strip secrets from build artifacts:** tokens embedded in binaries or bundles
  are recoverable with `strings`/`grep`. Keep credentials out of shipped files and
  scan artifacts for leaked secrets before release.
