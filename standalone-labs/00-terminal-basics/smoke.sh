#!/bin/sh
set -eu
cd /practice
test "$(pwd)" = /practice
ls handover.txt events.log >/dev/null
cat handover.txt | grep -F "$FLAG_L00_NOTE" >/dev/null
before=$(sha256sum events.log)
line=$(cat events.log | grep READY)
test "$line" = "09:02 READY practice_flag=$FLAG_L00_PIPE"
test "$(cat events.log | grep READY | wc -l)" -eq 1
test "$(cat events.log | wc -l)" -eq 4
test "$(sha256sum events.log)" = "$before"
if grep -q MISSING events.log; then exit 1; fi
printf '%s\n' 'Lab 00: navigation, file reading, pipe filtering and unchanged source verified.'
