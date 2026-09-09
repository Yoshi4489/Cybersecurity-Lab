import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const server = fileURLToPath(new URL('../standalone-labs/11-jwt-validation/target/server.py', import.meta.url));
async function withServer(run) {
  assert.ok(existsSync(server), 'Lab11 runnable Python target must exist');
  const child = spawn(process.env.PYTHON || 'python', ['-u', server], {
    env: {...process.env, LAB_HOST: '127.0.0.1', LAB_PORT: '0', FLAG_L11_MATRIX: 'RLAB{matrix-test}', FLAG_L11_REMEDIATION: 'RLAB{remediation-test}'},
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
    const request = async (path, {body, token, caseId} = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {}), ...(caseId ? {'X-Case-ID': caseId} : {})},
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

test('Lab11 real HTTP enforces the complete validation matrix and remediation gate', () => withServer(async request => {
  assert.equal((await request('/health')).status, 200);
  const c = await request('/case', {body: {}});
  assert.equal(c.status, 201);
  const expected = {
    valid: 'accepted', alg_none: 'algorithm', bad_signature: 'signature', expired: 'expiry',
    wrong_issuer: 'issuer', wrong_audience: 'audience', old_key: 'key-retired',
    wrong_role: 'authorization', tampered_role: 'signature',
  };
  const results = {};
  for (const [name, token] of Object.entries(c.fixtures)) {
    const reply = await request('/fixed', {token, caseId: c.case_id});
    results[name] = reply.reason;
    assert.equal(reply.status, name === 'valid' ? 200 : name === 'wrong_role' ? 403 : 401, name);
  }
  assert.deepEqual(results, expected);
  assert.equal((await request('/matrix', {body: {case_id: c.case_id, results: {valid: 'accepted'}}})).status, 422);
  const matrix = await request('/matrix', {body: {case_id: c.case_id, results}});
  assert.equal(matrix.objective_flag, 'RLAB{matrix-test}');
  const controls = {
    verify_signature: true, allowlist_algorithm: true, validate_issuer_audience_expiry: true,
    enforce_role_server_side: true, reject_retired_keys: true,
  };
  assert.equal((await request('/remediation', {body: {case_id: c.case_id, matrix_token: 'wrong', controls}})).status, 409);
  const final = await request('/remediation', {body: {case_id: c.case_id, matrix_token: matrix.matrix_token, controls}});
  assert.equal(final.objective_flag, 'RLAB{remediation-test}');
}));
