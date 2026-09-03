FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc

RUN apk add --no-cache bind \
    && addgroup -S -g 10001 lab \
    && adduser -S -D -H -u 10001 -G lab lab

COPY named.conf.template /opt/lab/named.conf.template
COPY zone.template /opt/lab/zone.template
COPY entrypoint.sh /opt/lab/entrypoint.sh

RUN chmod 0555 /opt/lab/entrypoint.sh \
    && chmod 0444 /opt/lab/named.conf.template /opt/lab/zone.template

USER 10001:10001
EXPOSE 53/tcp 53/udp
ENTRYPOINT ["/opt/lab/entrypoint.sh"]
