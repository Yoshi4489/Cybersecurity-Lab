FROM python:3.12-alpine@sha256:b64631e04e4920160c50fbe8d8df828f7f35f06f425cb44aa09bca53e708a35a

RUN addgroup -S lab && adduser -S -G lab -u 10003 lab
WORKDIR /opt/dns
COPY --chown=lab:lab dns_server.py ./dns_server.py
USER lab
EXPOSE 5353/udp 5353/tcp
CMD ["python", "/opt/dns/dns_server.py"]
