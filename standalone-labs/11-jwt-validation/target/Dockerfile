FROM python:3.12-alpine@sha256:b64631e04e4920160c50fbe8d8df828f7f35f06f425cb44aa09bca53e708a35a
RUN addgroup -S lab && adduser -S -G lab -u 10001 lab
WORKDIR /opt/target
COPY --chown=lab:lab server.py ./server.py
USER lab
EXPOSE 8080
CMD ["python", "/opt/target/server.py"]
