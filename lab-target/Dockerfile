FROM node:22.13.1-alpine3.21
WORKDIR /app
COPY --chown=10001:10001 *.mjs ./
USER 10001:10001
ENV NODE_ENV=production
CMD ["node", "gateway.mjs"]
