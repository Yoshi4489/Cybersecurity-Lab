FROM python:3.12-alpine@sha256:b64631e04e4920160c50fbe8d8df828f7f35f06f425cb44aa09bca53e708a35a

RUN addgroup -S lab && adduser -S -G lab -u 10004 lab
WORKDIR /opt/web
COPY --chown=lab:lab server.py ./server.py
USER lab
EXPOSE 8088
CMD ["python", "/opt/web/server.py"]
