# PharmaDesk Express + TypeScript Backend (Google Cloud Run - asia-south1)
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package manifests and lockfile
COPY package.json bun.lock ./
COPY server/tsconfig.json ./server/tsconfig.json

# Install dependencies cleanly using Bun
RUN bun install --frozen-lockfile

# Copy backend source
COPY server ./server

# Bundle Express API with esbuild for Node/Bun production execution
RUN bun run build:backend

# Install production-only dependencies cleanly
FROM oven/bun:1-alpine AS prod-deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/server ./dist/server

RUN chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/server.js"]
