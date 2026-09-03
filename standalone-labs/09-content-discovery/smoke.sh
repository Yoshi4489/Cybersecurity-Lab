#!/bin/sh
set -eu

: "${FLAG_L09_ROBOTS:?smoke runner must inject expected flags}"
: "${FLAG_L09_GITLEAK:?smoke runner must inject expected flags}"
: "${FLAG_L09_BACKUP:?smoke runner must inject expected flags}"
: "${FLAG_L09_FINAL:?smoke runner must inject expected flags}"

base="http://web-archive:8080"

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "smoke assertion failed: expected [$2] got [$1]" >&2
    exit 1
  fi
}

attempt=0
until curl -fsS "$base/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "web archive did not become ready" >&2; exit 1; }
  sleep 1
done

# 1) robots.txt breadcrumb -> /server-status
curl -fsS "$base/robots.txt" | grep -q '^Disallow: /server-status$'
status="$(curl -fsS "$base/server-status")"
assert_eq "$(printf '%s' "$status" | sed -n 's/^robots_token=//p')" "index-quartz-09"
assert_eq "$(printf '%s' "$status" | sed -n 's/^objective_flag=//p')" "$FLAG_L09_ROBOTS"

# 2) exposed .git/config (discovered from robots Disallow /.git/)
git_config="$(curl -fsS "$base/.git/config")"
assert_eq "$(printf '%s' "$git_config" | sed -n 's/.*git_token = //p')" "repo-ember-33"
assert_eq "$(printf '%s' "$git_config" | sed -n 's/.*objective_flag = //p')" "$FLAG_L09_GITLEAK"

# 3) leftover backup file (hinted by the index HTML comment)
curl -fsS "$base/" | grep -q 'config.php.bak'
backup="$(curl -fsS "$base/config.php.bak")"
assert_eq "$(printf '%s' "$backup" | sed -n 's/.*backup_token=//p')" "stale-onyx-58"
assert_eq "$(printf '%s' "$backup" | sed -n 's/.*objective_flag=//p')" "$FLAG_L09_BACKUP"

# 4) chain the three tokens
final="$(curl -fsS -X POST \
  --data-urlencode 'robots=index-quartz-09' \
  --data-urlencode 'git=repo-ember-33' \
  --data-urlencode 'backup=stale-onyx-58' \
  "$base/final" | sed -n 's/^final_flag=//p')"
assert_eq "$final" "$FLAG_L09_FINAL"

echo "09-content-discovery smoke: PASS"
