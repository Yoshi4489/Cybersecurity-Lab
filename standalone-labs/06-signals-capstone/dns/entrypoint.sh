#!/bin/sh
set -eu

: "${LAB06_DNS_FLAG:?run via standalone-labctl}"

dns_flag="$(printf '%s' "$LAB06_DNS_FLAG" | sed 's/[\\&|]/\\&/g')"
sed -e "s|__DNS_FLAG__|$dns_flag|g" \
  /opt/lab/zone.template > /run/named/signals.test.zone
cp /opt/lab/named.conf.template /run/named/named.conf

exec named -g -c /run/named/named.conf
