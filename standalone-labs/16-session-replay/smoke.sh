#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

base = 'http://session-review:8080'
def request(path, method='GET', body=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    data = None if body is None else json.dumps(body).encode()
    try:
        with urlopen(Request(base + path, data=data, headers=headers, method=method), timeout=5) as r:
            return r.status, json.load(r)
    except HTTPError as e:
        return e.code, json.load(e)

status, case = request('/case', 'POST', {})
assert status == 201 and case['clock'] == {'mode':'explicit-fixed','now':1700000000}
cid = case['case_id']
logout = case['sessions']['logout']['access_token']
assert request(f'/resource?case_id={cid}&mode=hardened&scenario=logout', token=logout)[0] == 200
request('/event', 'POST', {'case_id':cid,'scenario':'logout','action':'logout'})
assert request(f'/resource?case_id={cid}&mode=vulnerable&scenario=logout', token=logout)[0] == 200
assert request(f'/resource?case_id={cid}&mode=hardened&scenario=logout', token=logout) == (401, {'reason':'session-revoked'})
password = case['sessions']['password']['access_token']
request('/event', 'POST', {'case_id':cid,'scenario':'password','action':'password-change'})
assert request(f'/resource?case_id={cid}&mode=vulnerable&scenario=password', token=password)[0] == 200
assert request(f'/resource?case_id={cid}&mode=hardened&scenario=password', token=password) == (401, {'reason':'credential-version-stale'})
weak = case['sessions']['rotation']['weak_refresh_token']
assert request('/refresh?mode=vulnerable','POST',{'case_id':cid,'refresh_token':weak})[0] == 200
assert request('/refresh?mode=vulnerable','POST',{'case_id':cid,'refresh_token':weak})[0] == 200
strong = case['sessions']['rotation']['refresh_token']
status, rotated = request('/refresh?mode=hardened','POST',{'case_id':cid,'refresh_token':strong})
assert status == 200
assert request('/refresh?mode=hardened','POST',{'case_id':cid,'refresh_token':strong}) == (401, {'reason':'refresh-replayed-family-revoked'})
assert request('/refresh?mode=hardened','POST',{'case_id':cid,'refresh_token':rotated['refresh_token']}) == (401, {'reason':'refresh-family-revoked'})
observations = {'logout_vulnerable':'accepted','logout_hardened':'session-revoked','password_vulnerable':'accepted','password_hardened':'credential-version-stale','refresh_vulnerable_reuse':'accepted','refresh_hardened_reuse':'refresh-replayed-family-revoked'}
status, timeline = request('/timeline','POST',{'case_id':cid,'observations':observations})
assert status == 200 and timeline['objective_flag'] == os.environ['FLAG_L16_TIMELINE']
controls = {'revoke_session_on_logout':True,'invalidate_sessions_on_password_change':True,'rotate_refresh_once':True,'revoke_family_on_reuse':True}
status, final = request('/remediation','POST',{'case_id':cid,'timeline_token':timeline['timeline_token'],'controls':controls})
assert status == 200 and final['objective_flag'] == os.environ['FLAG_L16_REMEDIATION']
print('16 smoke: deterministic replay timeline and revocation controls passed.')
PY
