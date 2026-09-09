import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lab = resolve(root, 'standalone-labs/12-cookie-session-security');
const server = resolve(lab, 'target/server.py');

async function withServer(run) {
  assert.ok(existsSync(server), 'Lab12 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {
    env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L12_FIXATION: 'RLAB{fixation-test}', FLAG_L12_LIFECYCLE: 'RLAB{lifecycle-test}'},
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
    const request = async (path, {body, cookie} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(cookie ? {Cookie: cookie} : {})},
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

const cookieValue = header => header.match(/^session=([^;]+)/)?.[1];

test('Lab12 demonstrates fixation then validates rotation and logout invalidation over real HTTP', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {body: {}});
  assert.equal(c.status, 201);

  const vulnerable = await request('/vulnerable/login', {body: {case_id: c.case_id}, cookie: `session=${c.fixation_session}`});
  assert.equal(vulnerable.status, 200);
  assert.equal(cookieValue(vulnerable.setCookie), c.fixation_session);
  assert.doesNotMatch(vulnerable.setCookie, /;\s*(?:Secure|HttpOnly|SameSite=)/i);
  assert.equal((await request('/vulnerable/session', {cookie: `session=${c.fixation_session}`})).status, 200);
  const finding = await request('/finding', {body: {case_id: c.case_id, accepted_supplied_id: true, missing_attributes: ['Secure', 'HttpOnly', 'SameSite']}});
  assert.equal(finding.objective_flag, 'RLAB{fixation-test}');

  const fixed = await request('/fixed/login', {body: {case_id: c.case_id}, cookie: `session=${c.fixation_session}`});
  const rotated = cookieValue(fixed.setCookie);
  assert.equal(fixed.status, 200);
  assert.notEqual(rotated, c.fixation_session);
  assert.match(fixed.setCookie, /;\s*Secure/i);
  assert.match(fixed.setCookie, /;\s*HttpOnly/i);
  assert.match(fixed.setCookie, /;\s*SameSite=Strict/i);
  assert.equal((await request('/fixed/session', {cookie: `session=${c.fixation_session}`})).status, 401);
  assert.equal((await request('/fixed/session', {cookie: `session=${rotated}`})).status, 200);

  const logout = await request('/fixed/logout', {body: {case_id: c.case_id}, cookie: `session=${rotated}`});
  assert.equal(logout.status, 200);
  assert.match(logout.setCookie, /Max-Age=0/i);
  assert.equal((await request('/fixed/session', {cookie: `session=${rotated}`})).status, 401);
  assert.equal((await request('/remediation', {body: {case_id: c.case_id, finding_token: finding.finding_token, controls: {secure: true, http_only: true, same_site: 'Strict', rotate_on_login: true, invalidate_on_logout: true}}})).objective_flag, 'RLAB{lifecycle-test}');
}));

test('Lab12 curriculum and container contract are self-contained and evidence-led', () => {
  const manifest = JSON.parse(readFileSync(resolve(lab, 'lab.json'), 'utf8'));
  const tasks = JSON.parse(readFileSync(resolve(lab, 'tasks.json'), 'utf8'));
  const compose = readFileSync(resolve(lab, 'docker-compose.yml'), 'utf8');
  const dockerfile = readFileSync(resolve(lab, 'target/Dockerfile'), 'utf8');
  const readme = readFileSync(resolve(lab, 'README.md'), 'utf8');
  for (const file of ['lab.json', 'tasks.json', 'README.md', 'docker-compose.yml', 'smoke.sh', 'target/Dockerfile', 'target/server.py']) assert.ok(existsSync(resolve(lab, file)), file);
  assert.equal(manifest.subnet, '172.31.12.0/24');
  assert.equal(manifest.objectives.length, 2);
  assert.equal(Object.keys(tasks).length, 2);
  assert.match(compose, /internal:\s*true/);
  assert.match(compose, /172\.31\.12\.0\/24/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /cap_drop:\s*\["ALL"\]/);
  assert.match(dockerfile, /^FROM python:[^\s]+@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /^USER lab$/m);
  assert.equal((readme.match(/<summary>Hint [123]/g) || []).length, 6);
  for (const prompt of ['findingPrompt', 'evidencePrompt', 'impactPrompt', 'confidencePrompt', 'remediationPrompt']) assert.equal(typeof tasks['session-lifecycle'][prompt], 'string');
  assert.match(readme, /## Solution/);
  assert.match(readme, /negative and positive/i);
});
