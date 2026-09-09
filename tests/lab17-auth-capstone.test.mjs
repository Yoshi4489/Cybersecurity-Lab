import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('../standalone-labs/17-authorization-capstone/target/server.py', import.meta.url));

async function withServer(run) {
  assert.ok(existsSync(server), 'Lab17 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {
    env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L17_CORRELATION: 'RLAB{correlation-test}', FLAG_L17_HARDENING: 'RLAB{hardening-test}'},
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
    const request = async (path, {method = 'GET', body, token, cookie, csrf, requestId} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(cookie ? {Cookie: `session=${cookie}`} : {}), ...(csrf ? {'X-CSRF-Token': csrf} : {}), ...(requestId ? {'X-Request-ID': requestId} : {})},
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

test('Lab17 correlates multiple evidence sources and validates layered authorization controls over HTTP', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {method: 'POST', body: {}});
  assert.equal(c.status, 201);
  assert.deepEqual(c.evidence_sources.sort(), ['app-audit.json', 'auth-audit.json', 'browser-trace.json', 'gateway.log', 'scanner-decoy.log']);
  const evidence = {};
  for (const source of c.evidence_sources) {
    const reply = await request(`/evidence/${source}?case_id=${c.case_id}`);
    assert.equal(reply.status, 200, source);
    evidence[source] = reply.events;
  }
  assert.match(JSON.stringify(evidence['gateway.log']), /req-401/);
  assert.match(JSON.stringify(evidence['scanner-decoy.log']), /noise-900/);

  const correlation = {
    actor: 'analyst-17', session_id: 'sid-17', jwt_jti: 'jwt-17',
    bola_object: 'acct-9002', role: 'analyst', csrf_request: 'req-403',
    replay_request: 'req-402', excluded_decoy: 'noise-900',
  };
  assert.equal((await request('/correlate', {method: 'POST', body: {case_id: c.case_id, correlation: {...correlation, excluded_decoy: 'req-401'}}})).status, 422);
  const correlated = await request('/correlate', {method: 'POST', body: {case_id: c.case_id, correlation}});
  assert.equal(correlated.objective_flag, 'RLAB{correlation-test}');

  const auth = {token: c.credentials.access_token, cookie: c.credentials.session_cookie, csrf: c.credentials.csrf_token};
  const tamperedToken = `${auth.token.slice(0, -1)}${auth.token.at(-1) === 'A' ? 'B' : 'A'}`;
  const jwt = await request('/hardened/accounts/acct-1001', {token: tamperedToken, cookie: auth.cookie});
  assert.deepEqual({status: jwt.status, reason: jwt.reason}, {status: 401, reason: 'jwt-invalid'});
  assert.deepEqual(await request('/hardened/accounts/acct-1001', auth), {status: 200, reason: 'accepted', account: 'acct-1001'});
  const bola = await request('/hardened/accounts/acct-9002', auth);
  assert.deepEqual({status: bola.status, reason: bola.reason}, {status: 403, reason: 'object-owner-mismatch'});
  const role = await request('/hardened/admin/export', {method: 'POST', body: {}, ...auth});
  assert.deepEqual({status: role.status, reason: role.reason}, {status: 403, reason: 'role-denied'});
  const csrf = await request('/hardened/profile', {method: 'POST', body: {display_name: 'Analyst'}, token: auth.token, cookie: auth.cookie});
  assert.deepEqual({status: csrf.status, reason: csrf.reason}, {status: 403, reason: 'csrf-invalid'});
  const binding = await request('/hardened/accounts/acct-1001', {token: auth.token, cookie: c.credentials.decoy_cookie});
  assert.deepEqual({status: binding.status, reason: binding.reason}, {status: 401, reason: 'session-binding-mismatch'});
  assert.equal((await request('/hardened/transfer', {method: 'POST', body: {amount: 5}, requestId: 'proof-17', ...auth})).status, 200);
  const replay = await request('/hardened/transfer', {method: 'POST', body: {amount: 5}, requestId: 'proof-17', ...auth});
  assert.deepEqual({status: replay.status, reason: replay.reason}, {status: 409, reason: 'replay-detected'});

  const results = {jwt: 'jwt-invalid', owner_access: 'accepted', bola: 'object-owner-mismatch', role: 'role-denied', csrf: 'csrf-invalid', cookie_binding: 'session-binding-mismatch', replay: 'replay-detected'};
  const controls = {verify_jwt: true, bind_cookie_session: true, enforce_csrf: true, authorize_object_owner: true, enforce_role_server_side: true, reject_duplicate_request_id: true};
  assert.equal((await request('/controls', {method: 'POST', body: {case_id: c.case_id, correlation_token: correlated.correlation_token, results: {...results, bola: 'accepted'}, controls}})).status, 422);
  const final = await request('/controls', {method: 'POST', body: {case_id: c.case_id, correlation_token: correlated.correlation_token, results, controls}});
  assert.equal(final.objective_flag, 'RLAB{hardening-test}');
}));
