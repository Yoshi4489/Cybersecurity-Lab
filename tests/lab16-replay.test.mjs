import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('../standalone-labs/16-session-replay/target/server.py', import.meta.url));

async function withServer(run) {
  assert.ok(existsSync(server), 'Lab16 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {
    env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', LAB_FAKE_NOW: '1700000000', FLAG_L16_TIMELINE: 'RLAB{timeline-test}', FLAG_L16_REMEDIATION: 'RLAB{revocation-test}'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timeout: ${stderr}`)), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Target exited ${code}: ${stderr}`)); });
      child.stdout.once('data', chunk => { clearTimeout(timer); resolve(JSON.parse(String(chunk)).port); });
    });
    const request = async (path, {method = 'GET', body, token} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      return {status: response.status, ...await response.json()};
    };
    await run(request);
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
}

test('Lab16 real HTTP demonstrates replay timelines and proves revocation controls', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {method: 'POST', body: {}});
  assert.equal(c.status, 201);
  assert.equal(c.clock.now, 1700000000);
  assert.equal((await request(`/resource?case_id=${c.case_id}&mode=hardened&scenario=logout`, {token: c.sessions.logout.access_token})).status, 200);
  assert.equal((await request(`/resource?case_id=${c.case_id}&mode=hardened&scenario=logout`)).reason, 'missing-token');

  await request('/event', {method: 'POST', body: {case_id: c.case_id, scenario: 'logout', action: 'logout'}});
  const logoutWeak = await request(`/resource?case_id=${c.case_id}&mode=vulnerable&scenario=logout`, {token: c.sessions.logout.access_token});
  const logoutFixed = await request(`/resource?case_id=${c.case_id}&mode=hardened&scenario=logout`, {token: c.sessions.logout.access_token});
  assert.equal(logoutWeak.status, 200);
  assert.deepEqual({status: logoutFixed.status, reason: logoutFixed.reason}, {status: 401, reason: 'session-revoked'});

  await request('/event', {method: 'POST', body: {case_id: c.case_id, scenario: 'password', action: 'password-change'}});
  const passwordWeak = await request(`/resource?case_id=${c.case_id}&mode=vulnerable&scenario=password`, {token: c.sessions.password.access_token});
  const passwordFixed = await request(`/resource?case_id=${c.case_id}&mode=hardened&scenario=password`, {token: c.sessions.password.access_token});
  assert.equal(passwordWeak.status, 200);
  assert.deepEqual({status: passwordFixed.status, reason: passwordFixed.reason}, {status: 401, reason: 'credential-version-stale'});

  const weakRefresh1 = await request('/refresh?mode=vulnerable', {method: 'POST', body: {case_id: c.case_id, refresh_token: c.sessions.rotation.weak_refresh_token}});
  const weakRefresh2 = await request('/refresh?mode=vulnerable', {method: 'POST', body: {case_id: c.case_id, refresh_token: c.sessions.rotation.weak_refresh_token}});
  assert.equal(weakRefresh1.status, 200);
  assert.equal(weakRefresh2.status, 200);
  const rotated = await request('/refresh?mode=hardened', {method: 'POST', body: {case_id: c.case_id, refresh_token: c.sessions.rotation.refresh_token}});
  assert.equal(rotated.status, 200);
  const reused = await request('/refresh?mode=hardened', {method: 'POST', body: {case_id: c.case_id, refresh_token: c.sessions.rotation.refresh_token}});
  assert.deepEqual({status: reused.status, reason: reused.reason}, {status: 401, reason: 'refresh-replayed-family-revoked'});
  assert.equal((await request('/refresh?mode=hardened', {method: 'POST', body: {case_id: c.case_id, refresh_token: rotated.refresh_token}})).reason, 'refresh-family-revoked');

  const observations = {
    logout_vulnerable: 'accepted', logout_hardened: 'session-revoked',
    password_vulnerable: 'accepted', password_hardened: 'credential-version-stale',
    refresh_vulnerable_reuse: 'accepted', refresh_hardened_reuse: 'refresh-replayed-family-revoked',
  };
  assert.equal((await request('/timeline', {method: 'POST', body: {case_id: c.case_id, observations: {...observations, logout_hardened: 'accepted'}}})).status, 422);
  const timeline = await request('/timeline', {method: 'POST', body: {case_id: c.case_id, observations}});
  assert.equal(timeline.objective_flag, 'RLAB{timeline-test}');
  const controls = {revoke_session_on_logout: true, invalidate_sessions_on_password_change: true, rotate_refresh_once: true, revoke_family_on_reuse: true};
  assert.equal((await request('/remediation', {method: 'POST', body: {case_id: c.case_id, timeline_token: 'wrong', controls}})).status, 409);
  const final = await request('/remediation', {method: 'POST', body: {case_id: c.case_id, timeline_token: timeline.timeline_token, controls}});
  assert.equal(final.objective_flag, 'RLAB{revocation-test}');
}));
