# Built inside the image so it is reproducible from the repo alone: the only
# inputs are the committed dataset and the source.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY data ./data
COPY public ./public

# A build that violates a byte budget or emits a broken link fails here rather
# than shipping.
RUN node scripts/build.mjs && node scripts/verify-dist.mjs

COPY server.js ./server.js

ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.js"]
