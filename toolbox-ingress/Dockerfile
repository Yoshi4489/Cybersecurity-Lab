FROM node:22.13.1-alpine3.21@sha256:e2b39f7b64281324929257d0f8004fb6cb4bf0fdfb9aa8cedb235a766aec31da
WORKDIR /app
COPY --chown=10001:10001 server.mjs ./
USER 10001:10001
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
