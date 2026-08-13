FROM python:3.12-alpine

RUN addgroup -S lab && adduser -S -G lab -u 10002 lab
WORKDIR /opt/target
COPY --chown=lab:lab server.py ./server.py
USER lab
EXPOSE 2222 8000 8443 31337
CMD ["python", "/opt/target/server.py"]
