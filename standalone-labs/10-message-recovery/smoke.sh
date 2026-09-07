#!/bin/sh
set -eu
python3 - <<'PY'
import base64, codecs, hashlib, json, os
from urllib.request import Request, urlopen
from urllib.error import HTTPError

base = 'http://message-vault:8080'
def get(path):
    with urlopen(base + path, timeout=5) as response:
        return json.load(response)
def post(body):
    with urlopen(Request(base + '/unlock', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=5) as response:
        return json.load(response)
def rejected(action, status):
    try:
        action()
        raise AssertionError('Request should have failed')
    except HTTPError as error:
        assert error.code == status
def fields(text):
    return dict(line.split('=', 1) for line in text.splitlines())

rejected(lambda: get('/hex?token=wrong'), 403)
first = fields(base64.b64decode(get('/brief')['payload']).decode())
assert first['objective_flag'] == os.environ['FLAG_L10_BASE64']
second = fields(bytes.fromhex(get(first['next'])['payload']).decode())
assert second['objective_flag'] == os.environ['FLAG_L10_HEX']
third = fields(codecs.decode(get(second['next'])['payload'], 'rot_13'))
assert third['objective_flag'] == os.environ['FLAG_L10_ROT13']
record = get(third['next'])
matches = [word for word in record['candidates'] if hashlib.md5(word.encode(), usedforsecurity=False).hexdigest() == record['digest']]
assert len(matches) == 1
password = matches[0]
assert hashlib.md5((password + '\n').encode(), usedforsecurity=False).hexdigest() != record['digest']
rejected(lambda: post({'password': 'wrong', 'case_token': record['case_token']}), 403)
rejected(lambda: post({'password': password, 'case_token': 'wrong'}), 403)
rejected(lambda: post({'password': [], 'case_token': record['case_token']}), 400)
rejected(lambda: post([]), 400)
result = post({'password': password, 'case_token': record['case_token']})
assert result['objective_flag'] == os.environ['FLAG_L10_MD5']
key = password.encode()
plaintext = bytes(value ^ key[i % len(key)] for i, value in enumerate(bytes.fromhex(result['ciphertext_hex'])))
assert hashlib.sha256(plaintext).hexdigest() == result['plaintext_sha256']
assert fields(plaintext.decode())['objective_flag'] == os.environ['FLAG_L10_MESSAGE']
assert os.environ['FLAG_L10_MESSAGE'] not in json.dumps(result)
print('Five message-recovery stages and negative cases passed.')
PY
