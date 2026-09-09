#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = 'http://ticket-api:8080'
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
mina, noah = case['users']['mina']['token'], case['users']['noah']['token']
ticket = case['tickets']['noah']
assert request('/vulnerable/tickets/' + ticket, token=mina)[0] == 200
assert request('/vulnerable/tickets/' + ticket, 'PATCH', {'status':'closed'}, mina)[0] == 200
assert request('/fixed/tickets/' + ticket)[0] == 401
assert request('/fixed/tickets/' + ticket, token=mina)[0] == 403
assert request('/fixed/tickets/' + ticket, 'PATCH', {'status':'open'}, mina)[0] == 403
assert request('/fixed/tickets/' + ticket, token=noah)[0] == 200
assert request('/fixed/tickets/' + ticket, 'PATCH', {'status':'open'}, noah)[0] == 200
observations = {'vulnerable_cross_owner_read':200,'vulnerable_cross_owner_write':200,'fixed_cross_owner_read':403,'fixed_cross_owner_write':403,'fixed_owner_read':200,'fixed_owner_write':200}
assert request('/reports/exposure', 'POST', {'case_id':case['case_id'],'observations':{'vulnerable_cross_owner_read':200}})[0] == 422
status, exposure = request('/reports/exposure', 'POST', {'case_id':case['case_id'],'observations':observations})
assert status == 200 and exposure['objective_flag'] == os.environ['FLAG_L14_EXPOSURE'] and 'evidence_report' in exposure
controls = {'filter_by_owner':True,'authorize_each_read':True,'authorize_each_write':True,'deny_cross_owner':True}
assert request('/reports/remediation', 'POST', {'case_id':case['case_id'],'exposure_token':'wrong','controls':controls})[0] == 409
status, fixed = request('/reports/remediation', 'POST', {'case_id':case['case_id'],'exposure_token':exposure['exposure_token'],'controls':controls})
assert status == 200 and fixed['objective_flag'] == os.environ['FLAG_L14_REMEDIATION'] and 'evidence_report' in fixed
print('14 smoke: BOLA read/write evidence and ownership remediation passed.')
PY
