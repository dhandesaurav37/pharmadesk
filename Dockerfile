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

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Install only production dependencies via Bun or copy node_modules
COPY package.json bun.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/server ./dist/server

EXPOSE 8080

CMD ["node", "dist/server/server.js"]
