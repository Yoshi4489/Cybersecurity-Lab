#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = 'http://authz-review:8080'
def request(path, method='GET', body=None, token=None, cookie=None, csrf=None, request_id=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if cookie: headers['Cookie'] = 'session=' + cookie
    if csrf: headers['X-CSRF-Token'] = csrf
    if request_id: headers['X-Request-ID'] = request_id
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=5) as r:
            return r.status, json.load(r)
    except HTTPError as e:
        return e.code, json.load(e)

status, case = request('/case','POST',{})
assert status == 201 and len(case['evidence_sources']) == 5
cid = case['case_id']
for source in case['evidence_sources']:
    status, evidence = request('/evidence/' + source + '?case_id=' + cid)
    assert status == 200 and evidence['events']
correlation = {'actor':'analyst-17','session_id':'sid-17','jwt_jti':'jwt-17','bola_object':'acct-9002','role':'analyst','csrf_request':'req-403','replay_request':'req-402','excluded_decoy':'noise-900'}
status, correlated = request('/correlate','POST',{'case_id':cid,'correlation':correlation})
assert status == 200 and correlated['objective_flag'] == os.environ['FLAG_L17_CORRELATION']
cred = case['credentials']
kwargs = {'token':cred['access_token'],'cookie':cred['session_cookie'],'csrf':cred['csrf_token']}
tampered = cred['access_token'][:-1] + ('B' if cred['access_token'][-1] == 'A' else 'A')
assert request('/hardened/accounts/acct-1001',token=tampered,cookie=kwargs['cookie']) == (401, {'reason':'jwt-invalid'})
assert request('/hardened/accounts/acct-1001', token=kwargs['token'], cookie=kwargs['cookie']) == (200, {'reason':'accepted','account':'acct-1001'})
assert request('/hardened/accounts/acct-9002', token=kwargs['token'], cookie=kwargs['cookie']) == (403, {'reason':'object-owner-mismatch'})
assert request('/hardened/admin/export','POST',{},**kwargs) == (403, {'reason':'role-denied'})
assert request('/hardened/profile','POST',{},token=kwargs['token'],cookie=kwargs['cookie']) == (403, {'reason':'csrf-invalid'})
assert request('/hardened/accounts/acct-1001',token=kwargs['token'],cookie=cred['decoy_cookie']) == (401, {'reason':'session-binding-mismatch'})
assert request('/hardened/transfer','POST',{'amount':5},request_id='proof-17',**kwargs)[0] == 200
assert request('/hardened/transfer','POST',{'amount':5},request_id='proof-17',**kwargs) == (409, {'reason':'replay-detected'})
results = {'jwt':'jwt-invalid','owner_access':'accepted','bola':'object-owner-mismatch','role':'role-denied','csrf':'csrf-invalid','cookie_binding':'session-binding-mismatch','replay':'replay-detected'}
controls = {'verify_jwt':True,'bind_cookie_session':True,'enforce_csrf':True,'authorize_object_owner':True,'enforce_role_server_side':True,'reject_duplicate_request_id':True}
status, final = request('/controls','POST',{'case_id':cid,'correlation_token':correlated['correlation_token'],'results':results,'controls':controls})
assert status == 200 and final['objective_flag'] == os.environ['FLAG_L17_HARDENING']
print('17 smoke: evidence correlation, decoy exclusion, and layered controls passed.')
PY
