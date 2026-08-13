FROM python:3.12-alpine

RUN addgroup -S lab && adduser -S -G lab -u 10004 lab
WORKDIR /opt/web
COPY --chown=lab:lab server.py ./server.py
USER lab
EXPOSE 8088
CMD ["python", "/opt/web/server.py"]
