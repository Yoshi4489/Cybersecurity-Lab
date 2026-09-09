#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = 'http://role-api:8080'
def request(path, method='GET', body=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['X-Lab-Token'] = token
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=5) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)

status, case = request('/case', 'POST', {})
assert status == 201
assert request('/vulnerable/reports/quarterly', 'DELETE', token=case['roles']['viewer']['token'])[0] == 200
assert request('/vulnerable/admin/reports/quarterly/archive', 'POST', {}, case['roles']['viewer']['token'])[0] == 200
assert request('/fixed/reports/quarterly')[0] == 401
assert request('/fixed/reports/quarterly', 'PATCH', {}, case['roles']['admin']['token'])[0] == 403
assert request('/fixed/unlisted/quarterly', token=case['roles']['admin']['token'])[0] == 403
operations = [('get_primary','GET','/fixed/reports/quarterly',None),('put_primary','PUT','/fixed/reports/quarterly',{}),('delete_primary','DELETE','/fixed/reports/quarterly',None),('post_admin_path','POST','/fixed/admin/reports/quarterly/archive',{}),('post_ops_alias','POST','/fixed/ops/reports/quarterly/archive',{})]
allowed = {'viewer':[200,403,403,403,403],'editor':[200,200,403,403,403],'admin':[200,200,200,200,200]}
results = {}
for role, identity in case['roles'].items():
    for index, (name, method, path, body) in enumerate(operations):
        status, _ = request(path, method, body, identity['token'])
        assert status == allowed[role][index]
        results[role + ':' + name] = status
assert request('/reports/matrix', 'POST', {'case_id':case['case_id'],'results':{'viewer:get_primary':200}})[0] == 422
status, matrix = request('/reports/matrix', 'POST', {'case_id':case['case_id'],'results':results})
assert status == 200 and matrix['objective_flag'] == os.environ['FLAG_L15_MATRIX'] and 'evidence_report' in matrix
controls = {'central_policy':True,'enforce_server_side':True,'cover_alternate_paths':True,'deny_by_default':True,'test_positive_and_negative':True}
status, fixed = request('/reports/remediation', 'POST', {'case_id':case['case_id'],'matrix_token':matrix['matrix_token'],'controls':controls})
assert status == 200 and fixed['objective_flag'] == os.environ['FLAG_L15_REMEDIATION'] and 'evidence_report' in fixed
print('15 smoke: role-method-path matrix and deny-by-default remediation passed.')
PY
