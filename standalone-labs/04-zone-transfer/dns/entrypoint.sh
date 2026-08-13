#!/bin/sh
set -eu

: "${LAB04_AUTHORITY_FLAG:?run via standalone-labctl}"
: "${LAB04_AXFR_FLAG:?run via standalone-labctl}"

escape_sed() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

authority_flag="$(escape_sed "$LAB04_AUTHORITY_FLAG")"
axfr_flag="$(escape_sed "$LAB04_AXFR_FLAG")"

sed \
  -e "s|__AUTHORITY_FLAG__|$authority_flag|g" \
  -e "s|__AXFR_FLAG__|$axfr_flag|g" \
  /opt/lab/zone.template > /run/named/range.test.zone
cp /opt/lab/named.conf.template /run/named/named.conf

exec named -g -c /run/named/named.conf
