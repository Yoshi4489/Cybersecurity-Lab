#!/bin/sh
set -eu
python3 - <<'PY'
import json, os
from urllib.error import HTTPError
from urllib.request import Request, build_opener
base='http://integrity-review:8080'
def request(path, method='GET', body=None, cookie=None, token=None, origin=None):
    h={'Content-Type':'application/json'}
    if cookie: h['Cookie']='session='+cookie
    if token: h['X-CSRF-Token']=token
    if origin: h['Origin']=origin
    data=None if body is None else json.dumps(body).encode()
    try:
        with build_opener().open(Request(base+path,data=data,headers=h,method=method),timeout=5) as r: return r.status,dict(r.headers),json.load(r)
    except HTTPError as e: return e.code,dict(e.headers),json.load(e)
s,h,c=request('/case','POST',{}); session=h['Set-Cookie'].split(';',1)[0].split('=',1)[1]; assert s==201
assert request('/vulnerable/preference','POST',{'case_id':c['case_id'],'theme':'amber'},session,origin='http://untrusted.invalid')[0]==200
assert request('/fixed/preference','POST',{'case_id':c['case_id'],'theme':'blue'},session,origin=c['trusted_origin'])[0]==403
assert request('/fixed/preference','POST',{'case_id':c['case_id'],'theme':'blue'},session,c['csrf_token'],'http://untrusted.invalid')[0]==403
_,_,other=request('/case','POST',{})
assert request('/fixed/preference','POST',{'case_id':c['case_id'],'theme':'blue'},session,other['csrf_token'],c['trusted_origin'])[0]==403
assert request('/fixed/preference','POST',{'case_id':c['case_id'],'theme':'blue'},session,c['csrf_token'],c['trusted_origin'])[0]==200
s,_,finding=request('/finding','POST',{'case_id':c['case_id'],'vulnerable_cross_site_status':200,'fixed_without_token_status':403,'fixed_wrong_origin_status':403},session); assert s==200 and finding['objective_flag']==os.environ['FLAG_L13_GAP']
controls={'require_session_cookie':True,'require_csrf_token':True,'bind_token_to_session':True,'validate_origin':True}
s,_,final=request('/remediation','POST',{'case_id':c['case_id'],'finding_token':finding['finding_token'],'controls':controls},session); assert s==200 and final['objective_flag']==os.environ['FLAG_L13_INTEGRITY']
print('13 smoke: session-bound token, Origin, negative, and positive cases passed.')
PY
