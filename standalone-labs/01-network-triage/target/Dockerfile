FROM python:3.12-alpine

RUN addgroup -S lab && adduser -S -G lab -u 10001 lab
WORKDIR /opt/target
COPY --chown=lab:lab server.py ./server.py
USER lab
EXPOSE 7070 8080 9090
CMD ["python", "/opt/target/server.py"]
