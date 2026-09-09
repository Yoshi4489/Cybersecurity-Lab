# Lab 10 — The Mislabelled Secret

## Where commands run

### HOST

Your Windows/macOS/Linux machine, in the project directory. Run `npm`,
`node scripts/standalone-labctl.mjs`, Docker lifecycle commands and flag
verification here. The `shell` command opens TOOLBOX; keep a second HOST
terminal for verification. `reset` is destructive, not routine cleanup.

### TOOLBOX

The isolated Linux investigation shell, opened by the controller or the portal's
embedded terminal. Run reconnaissance and evidence commands here, not in
PowerShell. Lab service hostnames resolve only inside the selected lab network.
Use `lab-scope` and the portal's current instructions for allocated target addresses.

### PORTAL

The browser application at `http://127.0.0.1:5173/`: sign in, select the lab,
start/resume, read tasks and hints, answer checks and submit flags. The embedded
terminal is TOOLBOX even though it appears in PORTAL. Controller health at
`http://127.0.0.1:3030/health` is an API, not a lesson or a target.

**Level:** Intermediate · **Mode:** Guided · **Time:** 50 minutes

**Difficulty band:** intermediate-crypto-foundations

## Scenario

Northstar Shipping's training coordinator inherited a message archive labelled
"encrypted secrets." A handover is missing, and nobody documented which tools
created the archive. You are authorized to recover this fictional training
message and correct the misleading labels before the next class starts.

Begin at `http://message-vault:8080/brief`. Each exhibit names its format;
decoding it reveals an objective flag and the exact next path. Keep following
that evidence until you recover the final message. Do not guess unrelated routes.

The chain is Base64 → hex → ROT13 → MD5 candidate matching → toy XOR decryption.
These are different operations, not five names for encryption. All passwords,
hashes, messages and flags are synthetic. Only `message-vault` and this lab's
`172.31.10.0/24` network are in scope; no real accounts or online cracking sites
are needed.

## What you need to know

- **Encoding** changes a representation. Base64 represents bytes using printable
  characters; hex represents each byte using two hexadecimal digits. Neither
  needs a secret key. Recognizable characters alone do not prove a format, so
  use the exhibit's `format` field as evidence.
- **ROT13** substitutes letters by rotating them 13 places. Applying it twice
  restores the original. It is a fixed, trivial substitution, not secure secrecy.
- **Hashing** maps input bytes to a digest. MD5 returns 128 bits, usually shown
  as 32 hex characters. You cannot "decode MD5" to get the original text. Here
  you hash five supplied guesses and compare them with the recorded digest.
- MD5 is deliberately unsuitable for password storage. This exercise succeeds
  because the synthetic password is in a tiny dictionary, not because every
  MD5 value can be reversed. Collision attacks are a different problem.
- **Encryption** uses a key to transform plaintext into ciphertext. This lab
  demonstrates repeating-key XOR: each message byte is XORed with a key byte,
  cycling through the key. XORing again with the same key recovers the message.
  This is an insecure teaching cipher, not modern authenticated encryption.
- `curl -fsS` reads an HTTP response. `jq -r .payload` selects a JSON string
  without its surrounding quotes. `base64 -d` decodes Base64.
- `tr 'A-Za-z' 'N-ZA-Mn-za-m'` applies ROT13. `md5sum` hashes standard input;
  use `printf '%s' 'text'` to avoid adding a newline. A newline changes the hash.
- `tee /tmp/name` shows output and saves it. `sed -n 's/^next=//p' FILE`
  extracts the recorded next path. Quoted `$(...)` inserts that output into a
  command. `/tmp` files belong to this toolbox and disappear when it is stopped.
- Python's `bytes.fromhex()` decodes hex. A `python3 - <<'PY'` block runs the
  lines up to `PY` as Python; paste the whole block, including its closing line.

## Start the lab

Open the portal at `http://127.0.0.1:5173/labs`, select **The Mislabelled Secret**,
and click Start / resume. Read and submit flags directly in that page. From a
host terminal in the project directory, enter the toolbox:

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs shell 10-message-recovery
```

Alternatively, start it first using this host command:

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs start 10-message-recovery
```

Run all investigation commands in the Linux toolbox, not in PowerShell. Python3
and the decoding tools are included. You do not need to open a local lesson file.
The [setup guide](../GETTING-STARTED.md) explains the initial portal installation.

## Objectives

### Flag 1 — Decode the handover (`base64`)

Fetch `/brief`, read its declared format, and decode only its `payload` string.
Submit the decoded `objective_flag`. Save the `next` path, including its token.
Explain why this did not need a password.

### Flag 2 — Recover text from bytes (`hex`)

Follow that next path. Its payload is hex, not another Base64 string. Decode the
hex pairs into bytes and then read them as UTF-8 text. Submit this exhibit's
`objective_flag` and save the newly revealed next path.

### Flag 3 — Undo the substitution (`rot13`)

Follow the hex exhibit's next path and apply ROT13 to the returned payload.
Submit the restored flag. The next path leads to a dictionary record. Explain
why reversing a fixed alphabet substitution provides no strong confidentiality.

### Flag 4 — Match the hash (`md5`)

Download the dictionary record. Hash each of its five candidates without a
newline and find the one matching `digest`. Send that password and the record's
`case_token` as JSON to `/unlock`. Submit the response's `objective_flag`.
Keep the response: it contains ciphertext for the final task, not plaintext.

### Flag 5 — Read the encrypted message (`message`)

Hex-decode `ciphertext_hex`, then XOR the bytes with the repeating UTF-8 bytes
of the recovered password. Compare the SHA-256 of the recovered bytes with
`plaintext_sha256`. Read and submit the decrypted `objective_flag`. Explain
which step removed encoding and which used a key to remove encryption.

## Hints

Use hints in order. Every flag has three independent reveals.

### Flag 1 — base64

<details>
<summary>Hint 1 — where to look</summary>

Read `/brief` with curl. Its `format` field says how the payload was represented.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use `jq -r .payload` so the decoder receives the string, not the entire JSON object.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `curl -fsS http://message-vault:8080/brief | jq -r .payload | base64 -d`.

</details>

### Flag 2 — hex

<details>
<summary>Hint 1 — where to look</summary>

The Base64-decoded handover contains `next=/hex?token=...`. Keep that exact token.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Hexadecimal uses two digits per byte. Python can convert the payload using `bytes.fromhex()`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Save the response as `/tmp/hex.json`, then run `python3 -c 'import json; print(bytes.fromhex(json.load(open("/tmp/hex.json"))["payload"]).decode())'`.

</details>

### Flag 3 — rot13

<details>
<summary>Hint 1 — where to look</summary>

Follow the next path in the hex-decoded text. Its response explicitly identifies ROT13.

</details>

<details>
<summary>Hint 2 — what to try</summary>

ROT13 shifts letters only. Digits, punctuation and line breaks remain unchanged.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Pipe the payload through `tr 'A-Za-z' 'N-ZA-Mn-za-m'`. The restored flag starts with `RLAB`, not `EYNO`.

</details>

### Flag 4 — md5

<details>
<summary>Hint 1 — where to look</summary>

The dictionary record supplies the algorithm, target digest, five candidate words and submission path.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Hash candidate bytes and compare; do not decode the digest. `echo` usually adds a newline, so use `printf '%s'` or Python's `.encode()`.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Try `printf '%s' 'paper-lantern' | md5sum` and compare with `digest`. Send the matching word in the JSON `password` field, together with the record's `case_token`, to `/unlock`.

</details>

### Flag 5 — message

<details>
<summary>Hint 1 — where to look</summary>

The unlock response describes its cipher and gives `ciphertext_hex`. The password you just recovered is the key.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Convert hex to bytes first. XOR byte number `i` with `key[i % len(key)]`; `%` wraps the key index back to zero.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Build `bytes(value ^ key[i % len(key)] for i, value in enumerate(ciphertext))`. Compare its SHA-256 with the recorded reference, then decode the bytes as text.

</details>

## Solution

This walkthrough is fully readable in the portal. The blocks labelled Toolbox
run in the shell opened above. Each host verification command is optional if
you submit the displayed flag through the matching portal form instead.

### 1. Decode Base64 (`base64`)

**Toolbox:**

**TOOLBOX — investigation**

```sh
curl -fsS http://message-vault:8080/brief | jq -r .payload | base64 -d | tee /tmp/base64.txt
```

Expected: readable lines containing `case=NS-M10`, `objective_flag=RLAB{...}`
and a token-bearing next path. Base64 decoding required no secret.

**Host terminal — submit the displayed flag, not the placeholder:**

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs verify 10-message-recovery base64 'RLAB{...}'
```

### 2. Decode hex (`hex`)

**Toolbox:**

**TOOLBOX — investigation**

```sh
curl -fsS "http://message-vault:8080$(sed -n 's/^next=//p' /tmp/base64.txt)" -o /tmp/hex.json
python3 -c 'import json; print(bytes.fromhex(json.load(open("/tmp/hex.json"))["payload"]).decode(), end="")' | tee /tmp/hex.txt
```

Expected: another readable handover with a different flag and a `/rot13` path.
Two hex digits became one byte; the resulting bytes formed readable text.

**Host terminal:**

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs verify 10-message-recovery hex 'RLAB{...}'
```

### 3. Reverse ROT13 (`rot13`)

**Toolbox:**

**TOOLBOX — investigation**

```sh
curl -fsS "http://message-vault:8080$(sed -n 's/^next=//p' /tmp/hex.txt)" | jq -r .payload | tr 'A-Za-z' 'N-ZA-Mn-za-m' | tee /tmp/rot13.txt
```

Expected: the third flag and a `/dictionary` path. Applying the same substitution
again would scramble the letters back. There is no secret key in ROT13.

**Host terminal:**

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs verify 10-message-recovery rot13 'RLAB{...}'
```

### 4. Recover the synthetic password (`md5`)

**Toolbox:**

**TOOLBOX — investigation**

```sh
curl -fsS "http://message-vault:8080$(sed -n 's/^next=//p' /tmp/rot13.txt)" -o /tmp/dictionary.json
python3 - <<'PY'
import hashlib, json
record = json.load(open('/tmp/dictionary.json'))
matches = []
for word in record['candidates']:
    digest = hashlib.md5(word.encode(), usedforsecurity=False).hexdigest()
    print(word, digest)
    if digest == record['digest']:
        matches.append(word)
assert len(matches) == 1, 'Expected one match in the supplied training list'
print('Matching synthetic password:', matches[0])
with open('/tmp/unlock.json', 'w') as output:
    json.dump({'password': matches[0], 'case_token': record['case_token']}, output)
PY
curl -fsS http://message-vault:8080/unlock -H 'Content-Type: application/json' --data-binary @/tmp/unlock.json | tee /tmp/unlocked.json
```

Expected: `paper-lantern` is the matching candidate. The response contains the
fourth `objective_flag` and `ciphertext_hex`. No MD5 decryption occurred: you
tested five hypotheses locally. To see the newline pitfall, compare these hashes:

**Toolbox:**

**TOOLBOX — investigation**

```sh
printf '%s' 'paper-lantern' | md5sum
printf '%s\n' 'paper-lantern' | md5sum
```

**Host terminal:**

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs verify 10-message-recovery md5 'RLAB{...}'
```

### 5. Decrypt the toy cipher (`message`)

**Toolbox:**

**TOOLBOX — investigation**

```sh
python3 - <<'PY'
import hashlib, json
record = json.load(open('/tmp/unlocked.json'))
key = json.load(open('/tmp/unlock.json'))['password'].encode()
ciphertext = bytes.fromhex(record['ciphertext_hex'])
plaintext = bytes(value ^ key[i % len(key)] for i, value in enumerate(ciphertext))
assert hashlib.sha256(plaintext).hexdigest() == record['plaintext_sha256'], 'Wrong recovered bytes'
print(plaintext.decode(), end='')
PY
```

Expected: `case=NS-M10`, the message "Encoding is not secrecy. Close the training
handover.", and the fifth flag. Hex decoding removed the printable wrapper;
XOR with the recovered key removed the toy encryption. The SHA-256 reference
checks correct recovery here; a hash supplied alongside ciphertext is not proof
of authenticity against an attacker who could replace both.

**Host terminal:**

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs verify 10-message-recovery message 'RLAB{...}'
```

## What this taught you

Classify a transformation before choosing a tool. Base64 and hex are reversible
representations; ROT13 is a fixed substitution; an MD5 dictionary attack compares
guesses; encryption involves a key. A ciphertext stored as hex can involve both
encoding and encryption. Real applications need reviewed cryptographic libraries,
authenticated encryption and purpose-built password hashing, not this toy cipher
or MD5. Never upload real secrets or password hashes to a decoding website.

This is an optional foundations branch after Lab 01. Return to Lab 08 to apply
the encoding-versus-integrity distinction to a larger evidence archive.

## Stop or reset

Use Stop lab in the portal, or these **host terminal** commands:

**HOST — lifecycle and verification**

```sh
node scripts/standalone-labctl.mjs status 10-message-recovery
node scripts/standalone-labctl.mjs stop 10-message-recovery
```

On resume, flags and submitted progress stay the same. Toolbox /tmp files do not
survive stop; repeat the acquisition steps to recreate them.

**Optional clean retry — deletes this lab's progress and creates new flags:**

**HOST — destructive reset (clears this lab’s progress)**

```sh
node scripts/standalone-labctl.mjs reset 10-message-recovery
```
