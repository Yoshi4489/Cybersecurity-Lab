FROM python:3.12-alpine

RUN addgroup -S lab && adduser -S -G lab -u 10003 lab
WORKDIR /opt/dns
COPY --chown=lab:lab dns_server.py ./dns_server.py
USER lab
EXPOSE 5353/udp 5353/tcp
CMD ["python", "/opt/dns/dns_server.py"]
