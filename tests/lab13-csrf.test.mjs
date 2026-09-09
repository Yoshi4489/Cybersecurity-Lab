import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lab = resolve(root, 'standalone-labs/13-csrf-request-integrity');
const server = resolve(lab, 'target/server.py');

async function withServer(run) {
  assert.ok(existsSync(server), 'Lab13 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {
    env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L13_GAP: 'RLAB{gap-test}', FLAG_L13_INTEGRITY: 'RLAB{integrity-test}'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolvePort, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timeout: ${stderr}`)), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Target exited ${code}: ${stderr}`)); });
      child.stdout.once('data', chunk => { clearTimeout(timer); resolvePort(JSON.parse(String(chunk)).port); });
    });
    const request = async (path, {body, cookie, token, origin} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(cookie ? {Cookie: cookie} : {}), ...(token ? {'X-CSRF-Token': token} : {}), ...(origin ? {Origin: origin} : {})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      return {status: response.status, setCookie: response.headers.get('set-cookie'), ...await response.json()};
    };
    await run(request);
  } finally {
    const exited = new Promise(resolveExit => child.once('exit', resolveExit));
    child.kill();
    await exited;
  }
}

const sessionCookie = header => header.match(/^session=([^;]+)/)?.[1];

test('Lab13 rejects requests unless session-bound CSRF token and trusted Origin both validate', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {body: {}});
  const session = sessionCookie(c.setCookie);
  assert.equal(c.status, 201);
  assert.match(c.setCookie, /HttpOnly/i);

  const vulnerable = await request('/vulnerable/preference', {body: {case_id: c.case_id, theme: 'amber'}, cookie: `session=${session}`, origin: 'http://untrusted.invalid'});
  assert.equal(vulnerable.status, 200);
  assert.equal((await request('/preference', {cookie: `session=${session}`})).theme, 'amber');

  const noToken = await request('/fixed/preference', {body: {case_id: c.case_id, theme: 'blue'}, cookie: `session=${session}`, origin: c.trusted_origin});
  assert.equal(noToken.status, 403);
  assert.equal(noToken.reason, 'csrf-token');
  const wrongOrigin = await request('/fixed/preference', {body: {case_id: c.case_id, theme: 'blue'}, cookie: `session=${session}`, token: c.csrf_token, origin: 'http://untrusted.invalid'});
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.reason, 'origin');
  const other = await request('/case', {body: {}});
  const wrongBinding = await request('/fixed/preference', {body: {case_id: c.case_id, theme: 'blue'}, cookie: `session=${session}`, token: other.csrf_token, origin: c.trusted_origin});
  assert.equal(wrongBinding.status, 403);
  assert.equal(wrongBinding.reason, 'csrf-token');
  const accepted = await request('/fixed/preference', {body: {case_id: c.case_id, theme: 'blue'}, cookie: `session=${session}`, token: c.csrf_token, origin: c.trusted_origin});
  assert.equal(accepted.status, 200);
  assert.equal((await request('/preference', {cookie: `session=${session}`})).theme, 'blue');

  const finding = await request('/finding', {body: {case_id: c.case_id, vulnerable_cross_site_status: 200, fixed_without_token_status: 403, fixed_wrong_origin_status: 403}, cookie: `session=${session}`});
  assert.equal(finding.objective_flag, 'RLAB{gap-test}');
  const controls = {require_session_cookie: true, require_csrf_token: true, bind_token_to_session: true, validate_origin: true};
  assert.equal((await request('/remediation', {body: {case_id: c.case_id, finding_token: 'wrong', controls}, cookie: `session=${session}`})).status, 409);
  assert.equal((await request('/remediation', {body: {case_id: c.case_id, finding_token: finding.finding_token, controls}, cookie: `session=${session}`})).objective_flag, 'RLAB{integrity-test}');
}));

test('Lab13 curriculum and container contract are self-contained and evidence-led', () => {
  const manifest = JSON.parse(readFileSync(resolve(lab, 'lab.json'), 'utf8'));
  const tasks = JSON.parse(readFileSync(resolve(lab, 'tasks.json'), 'utf8'));
  const compose = readFileSync(resolve(lab, 'docker-compose.yml'), 'utf8');
  const dockerfile = readFileSync(resolve(lab, 'target/Dockerfile'), 'utf8');
  const readme = readFileSync(resolve(lab, 'README.md'), 'utf8');
  for (const file of ['lab.json', 'tasks.json', 'README.md', 'docker-compose.yml', 'smoke.sh', 'target/Dockerfile', 'target/server.py']) assert.ok(existsSync(resolve(lab, file)), file);
  assert.equal(manifest.subnet, '172.31.13.0/24');
  assert.equal(manifest.objectives.length, 2);
  assert.equal(Object.keys(tasks).length, 2);
  assert.match(compose, /internal:\s*true/);
  assert.match(compose, /172\.31\.13\.0\/24/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /cap_drop:\s*\["ALL"\]/);
  assert.match(dockerfile, /^FROM python:[^\s]+@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /^USER lab$/m);
  assert.equal((readme.match(/<summary>Hint [123]/g) || []).length, 6);
  assert.match(readme, /no real browser victim/i);
  assert.match(readme, /## Solution/);
  assert.match(readme, /negative and positive/i);
  for (const prompt of ['findingPrompt', 'evidencePrompt', 'impactPrompt', 'confidencePrompt', 'remediationPrompt']) assert.equal(typeof tasks['request-integrity'][prompt], 'string');
});
