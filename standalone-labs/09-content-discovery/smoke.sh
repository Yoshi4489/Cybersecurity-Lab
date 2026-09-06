#!/bin/sh
set -eu
base=http://web-archive:8080
work=$(mktemp -d)
status=$(curl -fsS "$base/server-status")
robots=$(printf '%s\n' "$status" | sed -n 's/^robots_token=//p')
test "$(printf '%s\n' "$status" | sed -n 's/^objective_flag=//p')" = "$FLAG_L09_ROBOTS"
curl -fsS "$base/robots.txt" | grep -q '/server-status'
git_config=$(curl -fsS "$base/.git/config")
git_token=$(printf '%s\n' "$git_config" | sed -n 's/^git_token = //p')
test "$(printf '%s\n' "$git_config" | sed -n 's/^objective_flag = //p')" = "$FLAG_L09_GITLEAK"
backup_path=$(printf '%s\n' "$git_config" | sed -n 's/^backup = //p')
curl -fsS "$base$backup_path" | base64 -d > "$work/config.json"
test "$(jq -r .objective_flag "$work/config.json")" = "$FLAG_L09_BACKUP"
backup=$(jq -r .backup_token "$work/config.json")
artifact=$(jq -r .artifact "$work/config.json")
curl -fsS "$base$artifact" -o "$work/access.log"
log_hash=$(sha256sum "$work/access.log" | cut -d ' ' -f1)
test "$log_hash" = "$(jq -r .sha256 "$work/config.json")"
actor=$(awk '$5 == 200 && $4 ~ /^\/exports\// {print $1}' "$work/access.log")
event=$(awk '$5 == 200 && $4 ~ /^\/exports\// {sub(/^\/exports\//, "", $4); print $4}' "$work/access.log")
case_id=$(jq -r .case "$work/config.json")
report() {
  curl -sS -o "$work/report" -w '%{http_code}' -X POST \
    --data-urlencode "robots=$robots" --data-urlencode "git=$git_token" \
    --data-urlencode "backup=$backup" --data-urlencode "case=$case_id" \
    --data-urlencode "actor=$1" --data-urlencode "event=$2" \
    --data-urlencode "log_sha256=$3" "$base/final"
}
# Wrong actor, denied event, altered hash, and missing evidence are rejected.
test "$(report scanner "$event" "$log_hash")" = "403"
! grep -q 'RLAB{' "$work/report"
test "$(report "$actor" DECOY-901 "$log_hash")" = "403"
test "$(report "$actor" "$event" incorrect-hash)" = "403"
test "$(curl -sS -o "$work/early" -w '%{http_code}' -X POST "$base/final")" = "403"
! grep -q 'RLAB{' "$work/early"
# Public benign pages disclose no stage flags.
curl -fsS "$base/help" > "$work/help"
! grep -q 'RLAB{' "$work/help"
test "$(report "$actor" "$event" "$log_hash")" = "200"
test "$(sed -n 's/^final_flag=//p' "$work/report")" = "$FLAG_L09_FINAL"
echo "09 smoke: discovery, decoding, integrity and export correlation passed"
