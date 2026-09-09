import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('../standalone-labs/15-role-enforcement/target/server.py', import.meta.url));
async function withServer(run) {
  assert.ok(existsSync(server), 'Lab15 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L15_MATRIX: 'RLAB{roles-test}', FLAG_L15_REMEDIATION: 'RLAB{deny-default-test}'}, stdio: ['ignore', 'pipe', 'pipe']});
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

test('Lab15 real HTTP verifies the role-method matrix, alternate path controls, and deny-by-default remediation', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {method: 'POST', body: {}});
  assert.equal(c.status, 201);
  assert.deepEqual(Object.keys(c.roles), ['viewer', 'editor', 'admin']);
  assert.equal((await request('/vulnerable/reports/quarterly', {method: 'DELETE', token: c.roles.viewer.token})).status, 200);
  assert.equal((await request('/vulnerable/admin/reports/quarterly/archive', {method: 'POST', token: c.roles.viewer.token, body: {}})).status, 200);
  assert.equal((await request('/fixed/reports/quarterly')).status, 401);
  assert.equal((await request('/fixed/reports/quarterly', {method: 'PATCH', token: c.roles.admin.token, body: {}})).status, 403);
  assert.equal((await request('/fixed/unlisted/quarterly', {token: c.roles.admin.token})).status, 403);
  const operations = [['get_primary', 'GET', '/fixed/reports/quarterly'], ['put_primary', 'PUT', '/fixed/reports/quarterly', {title: 'Quarterly review'}], ['delete_primary', 'DELETE', '/fixed/reports/quarterly'], ['post_admin_path', 'POST', '/fixed/admin/reports/quarterly/archive', {}], ['post_ops_alias', 'POST', '/fixed/ops/reports/quarterly/archive', {}]];
  const allowed = {viewer: {get_primary: 200, put_primary: 403, delete_primary: 403, post_admin_path: 403, post_ops_alias: 403}, editor: {get_primary: 200, put_primary: 200, delete_primary: 403, post_admin_path: 403, post_ops_alias: 403}, admin: {get_primary: 200, put_primary: 200, delete_primary: 200, post_admin_path: 200, post_ops_alias: 200}};
  const results = {};
  for (const [role, identity] of Object.entries(c.roles)) {
    for (const [name, method, path, body] of operations) {
      const reply = await request(path, {method, token: identity.token, ...(body === undefined ? {} : {body})});
      results[`${role}:${name}`] = reply.status;
      assert.equal(reply.status, allowed[role][name], `${role}:${name}`);
    }
  }
  assert.equal((await request('/reports/matrix', {method: 'POST', body: {case_id: c.case_id, results: {'viewer:get_primary': 200}}})).status, 422);
  const matrix = await request('/reports/matrix', {method: 'POST', body: {case_id: c.case_id, results}});
  assert.equal(matrix.status, 200);
  assert.equal(matrix.objective_flag, 'RLAB{roles-test}');
  assert.deepEqual(Object.keys(matrix.evidence_report), ['finding', 'evidence', 'impact', 'confidence', 'remediation']);
  const controls = {central_policy: true, enforce_server_side: true, cover_alternate_paths: true, deny_by_default: true, test_positive_and_negative: true};
  assert.equal((await request('/reports/remediation', {method: 'POST', body: {case_id: c.case_id, matrix_token: matrix.matrix_token, controls: {...controls, deny_by_default: false}}})).status, 422);
  const fixed = await request('/reports/remediation', {method: 'POST', body: {case_id: c.case_id, matrix_token: matrix.matrix_token, controls}});
  assert.equal(fixed.status, 200);
  assert.equal(fixed.objective_flag, 'RLAB{deny-default-test}');
  assert.match(fixed.evidence_report.finding, /deny-by-default/i);
}));
