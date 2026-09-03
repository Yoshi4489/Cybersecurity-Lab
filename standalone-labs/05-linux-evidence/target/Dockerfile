FROM python:3.12-alpine@sha256:b64631e04e4920160c50fbe8d8df828f7f35f06f425cb44aa09bca53e708a35a

RUN addgroup -S -g 10001 lab \
    && adduser -S -D -H -u 10001 -G lab lab

COPY server.py /opt/lab/server.py
RUN chmod 0444 /opt/lab/server.py

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python", "/opt/lab/server.py"]
