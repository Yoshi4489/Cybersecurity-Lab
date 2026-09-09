#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor
base = 'http://session-review:8080'
def request(path, method='GET', body=None, cookie=None):
    headers = {'Content-Type':'application/json'}
    if cookie: headers['Cookie'] = 'session=' + cookie
    data = None if body is None else json.dumps(body).encode()
    try:
        with build_opener().open(Request(base+path, data=data, headers=headers, method=method), timeout=5) as r:
            return r.status, dict(r.headers), json.load(r)
    except HTTPError as e: return e.code, dict(e.headers), json.load(e)
s,c_h,c = request('/case','POST',{}); assert s == 201
s,h,_ = request('/vulnerable/login','POST',{'case_id':c['case_id']},c['fixation_session']); assert s == 200 and c['fixation_session'] in h['Set-Cookie'] and 'HttpOnly' not in h['Set-Cookie']
s,_,_ = request('/vulnerable/session',cookie=c['fixation_session']); assert s == 200
s,_,finding = request('/finding','POST',{'case_id':c['case_id'],'accepted_supplied_id':True,'missing_attributes':['Secure','HttpOnly','SameSite']}); assert finding['objective_flag'] == os.environ['FLAG_L12_FIXATION']
s,h,_ = request('/fixed/login','POST',{'case_id':c['case_id']},c['fixation_session']); rotated=h['Set-Cookie'].split(';',1)[0].split('=',1)[1]; assert rotated != c['fixation_session'] and all(x in h['Set-Cookie'] for x in ('Secure','HttpOnly','SameSite=Strict'))
assert request('/fixed/session',cookie=c['fixation_session'])[0] == 401
assert request('/fixed/session',cookie=rotated)[0] == 200
assert request('/fixed/logout','POST',{'case_id':c['case_id']},rotated)[0] == 200
assert request('/fixed/session',cookie=rotated)[0] == 401
controls={'secure':True,'http_only':True,'same_site':'Strict','rotate_on_login':True,'invalidate_on_logout':True}
s,_,final=request('/remediation','POST',{'case_id':c['case_id'],'finding_token':finding['finding_token'],'controls':controls}); assert s == 200 and final['objective_flag'] == os.environ['FLAG_L12_LIFECYCLE']
print('12 smoke: fixation, cookie attributes, rotation, and invalidation passed.')
PY
