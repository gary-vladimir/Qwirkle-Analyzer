FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

# The app has no npm dependencies and needs no build step.
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node dist/ ./dist/

USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
