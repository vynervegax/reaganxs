FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN rm -rf dist && pnpm exec tsc

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
