import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lab = new URL('../standalone-labs/07-web-breach-chain/', import.meta.url);
const read = (name) => readFileSync(new URL(name, lab), 'utf8');
const jwtBlock = () => read('README.md').split('### 4. Privilege escalation')[1].match(/```sh\n([\s\S]*?)```/)[1];

test('Lab07 README JWT header executes with GNU tr and base64', () => {
  const line = jwtBlock().split('\n').find((line) => line.startsWith('h='));
  const command = `${line}\nprintf '%s' "$h"`;
  const docker = process.env.LAB07_DOCKER_TESTS === '1';
  const result = spawnSync(docker ? 'docker' : 'bash', docker
    ? ['run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', 'reconlab-instance-07-web-breach-chain-toolbox:terminal-v1', 'sh', '-eu', '-c', command]
    : ['-eu', '-c', command], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(Buffer.from(result.stdout, 'base64url')), { alg: 'none', typ: 'JWT' });
});

test('Lab07 bearer examples contain shell variables, not redaction artifacts', () => {
  for (const file of ['README.md', 'smoke.sh']) {
    assert.ok(!read(file).includes('Bearer ' + '*'.repeat(3)), file);
    assert.ok(read(file).includes('Bearer $forged'), file);
  }
});


test('Lab07 documented JWT preserves sub and sid with JSON-safe encoding', { skip: process.env.LAB07_DOCKER_TESTS !== '1' }, () => {
  for (const sub of ['analyst', 'analyst "quoted" ☃']) {
    const claims = { sub, role: 'analyst', sid: 'session-"quoted"-\\-☃' };
    const stolen = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url'), 'synthetic'].join('.');
    const script = jwtBlock().split('\n').filter((line) => !line.startsWith('stolen=') && !line.startsWith('curl ')).join('\n') + '\nprintf "%s" "$forged"';
    const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-e', `stolen=${stolen}`, 'reconlab-instance-07-web-breach-chain-toolbox:terminal-v1', 'sh', '-eu', '-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const parts = result.stdout.split('.');
    assert.equal(parts.length, 3);
    assert.equal(parts[2], '');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    assert.equal(payload.sub, claims.sub);
    assert.equal(payload.sid, claims.sid);
    assert.equal(payload.role, 'admin');
  }
});


// Opt-in integration uses a disposable, networkless container, not learner runs.
const liveHarness = String.raw`
import os, subprocess, time, urllib.request, urllib.error
os.environ["NO_PROXY"] = "*"
keys = ["RECON_SWEEP", "SURFACE_MAP", "WEB_FOOTHOLD", "PRIV_ESC", "ROOT_PROOF"]
for key in keys:
    os.environ["FLAG_L07_" + key] = "RLAB{test-only-" + key + "}"
children = [subprocess.Popen(["python3", "/lab/" + name + "/server.py"]) for name in ["edge-gateway", "ops-internal"]]
try:
    for port in [8080, 8081]:
        for attempt in range(100):
            try:
                urllib.request.urlopen("http://127.0.0.1:%s/health" % port, timeout=1).close()
                break
            except OSError:
                if any(p.poll() is not None for p in children):
                    raise RuntimeError("target exited before readiness")
                time.sleep(.05)
        else:
            raise RuntimeError("target readiness timeout")
    subprocess.run(["sh", "-eu", "/lab/smoke.sh"], check=True)
finally:
    for child in children:
        child.terminate()
    for child in children:
        child.wait(timeout=10)
`;

test('Lab07 real target smoke works on an allocated address without learner state', { skip: process.env.LAB07_DOCKER_TESTS !== '1' }, () => {
  const result = spawnSync('docker', ['run', '--rm', '-i', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--add-host', 'edge-gateway:127.0.0.1', '--add-host', 'ops-internal:127.0.0.1', '--mount', `type=bind,source=${fileURLToPath(lab)},target=/lab,readonly`, 'reconlab-instance-07-web-breach-chain-toolbox:terminal-v1', 'python3', '-'], { input: liveHarness, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /07 smoke: positive chain/);
});
