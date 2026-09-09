import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('../standalone-labs/14-object-authorization/target/server.py', import.meta.url));
async function withServer(run) {
  assert.ok(existsSync(server), 'Lab14 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L14_EXPOSURE: 'RLAB{bola-test}', FLAG_L14_REMEDIATION: 'RLAB{ownership-test}'}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timeout: ${stderr}`)), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Target exited ${code}: ${stderr}`)); });
      child.stdout.once('data', chunk => { clearTimeout(timer); resolve(JSON.parse(String(chunk)).port); });
    });
    const request = async (path, {method = 'GET', body, token} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {method, headers: {'Content-Type': 'application/json', ...(token ? {'X-Lab-Token': token} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
      return {status: response.status, ...await response.json()};
    };
    await run(request);
  } finally { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
}

test('Lab14 real HTTP distinguishes vulnerable object IDs from fixed read and write ownership checks', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {method: 'POST', body: {}});
  assert.equal(c.status, 201);
  assert.deepEqual(Object.keys(c.users).sort(), ['mina', 'noah']);
  assert.notEqual(c.tickets.mina, c.tickets.noah);
  const mina = c.users.mina.token;
  const noahTicket = c.tickets.noah;
  assert.equal((await request(`/vulnerable/tickets/${noahTicket}`, {token: mina})).status, 200);
  const vulnerableWrite = await request(`/vulnerable/tickets/${noahTicket}`, {method: 'PATCH', token: mina, body: {status: 'closed'}});
  assert.equal(vulnerableWrite.status, 200);
  assert.equal(vulnerableWrite.ticket.status, 'closed');
  assert.equal((await request(`/fixed/tickets/${noahTicket}`)).status, 401);
  assert.equal((await request(`/fixed/tickets/${noahTicket}`, {token: mina})).status, 403);
  assert.equal((await request(`/fixed/tickets/${noahTicket}`, {method: 'PATCH', token: mina, body: {status: 'open'}})).status, 403);
  assert.equal((await request(`/fixed/tickets/${noahTicket}`, {token: c.users.noah.token})).status, 200);
  const ownerWrite = await request(`/fixed/tickets/${noahTicket}`, {method: 'PATCH', token: c.users.noah.token, body: {status: 'open'}});
  assert.equal(ownerWrite.status, 200);
  assert.equal(ownerWrite.ticket.status, 'open');
  assert.equal((await request('/fixed/tickets/TKT-9999', {token: mina})).status, 404);
  const observations = {vulnerable_cross_owner_read: 200, vulnerable_cross_owner_write: 200, fixed_cross_owner_read: 403, fixed_cross_owner_write: 403, fixed_owner_read: 200, fixed_owner_write: 200};
  assert.equal((await request('/reports/exposure', {method: 'POST', body: {case_id: c.case_id, observations: {vulnerable_cross_owner_read: 200}}})).status, 422);
  const exposure = await request('/reports/exposure', {method: 'POST', body: {case_id: c.case_id, observations}});
  assert.equal(exposure.status, 200);
  assert.equal(exposure.objective_flag, 'RLAB{bola-test}');
  assert.deepEqual(Object.keys(exposure.evidence_report), ['finding', 'evidence', 'impact', 'confidence', 'remediation']);
  const controls = {filter_by_owner: true, authorize_each_read: true, authorize_each_write: true, deny_cross_owner: true};
  assert.equal((await request('/reports/remediation', {method: 'POST', body: {case_id: c.case_id, exposure_token: 'wrong', controls}})).status, 409);
  const fixed = await request('/reports/remediation', {method: 'POST', body: {case_id: c.case_id, exposure_token: exposure.exposure_token, controls}});
  assert.equal(fixed.status, 200);
  assert.equal(fixed.objective_flag, 'RLAB{ownership-test}');
  assert.match(fixed.evidence_report.remediation, /server-side/i);
}));
