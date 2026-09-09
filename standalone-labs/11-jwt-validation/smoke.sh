#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base = 'http://jwt-review:8080'
def request(path, method='GET', body=None, token=None, case_id=None):
    headers = {'Content-Type': 'application/json'}
    if token is not None: headers['Authorization'] = 'Bearer ' + token
    if case_id is not None: headers['X-Case-ID'] = case_id
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=5) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)

status, case = request('/case', 'POST', {})
assert status == 201
expected = {
    'valid':'accepted', 'alg_none':'algorithm', 'bad_signature':'signature',
    'expired':'expiry', 'wrong_issuer':'issuer', 'wrong_audience':'audience',
    'old_key':'key-retired', 'wrong_role':'authorization', 'tampered_role':'signature'
}
results = {}
for name, token in case['fixtures'].items():
    status, reply = request('/fixed', token=token, case_id=case['case_id'])
    results[name] = reply['reason']
    assert status == (200 if name == 'valid' else 403 if name == 'wrong_role' else 401)
assert results == expected
status, wrong = request('/matrix', 'POST', {'case_id':case['case_id'], 'results':{'valid':'accepted'}})
assert status == 422 and wrong['reason'] == 'matrix-mismatch'
status, matrix = request('/matrix', 'POST', {'case_id':case['case_id'], 'results':results})
assert status == 200 and matrix['objective_flag'] == os.environ['FLAG_L11_MATRIX']
controls = {
    'verify_signature':True, 'allowlist_algorithm':True,
    'validate_issuer_audience_expiry':True, 'enforce_role_server_side':True,
    'reject_retired_keys':True
}
status, blocked = request('/remediation', 'POST', {'case_id':case['case_id'], 'matrix_token':'wrong', 'controls':controls})
assert status == 409 and blocked['reason'] == 'complete-matrix-first'
status, final = request('/remediation', 'POST', {'case_id':case['case_id'], 'matrix_token':matrix['matrix_token'], 'controls':controls})
assert status == 200 and final['objective_flag'] == os.environ['FLAG_L11_REMEDIATION']
print('11 smoke: JWT validation matrix and remediation controls passed.')
PY
