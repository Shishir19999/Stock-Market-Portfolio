# Backend image (Node 24 LTS). Build context: the repository root (the API shares code from ./shared).
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY Backend/package*.json ./
RUN npm ci --omit=dev
COPY shared /shared
COPY Backend/ .
USER node
EXPOSE 8080
# HOST defaults to 0.0.0.0 in server.js so the published port works
CMD ["node", "server.js"]
