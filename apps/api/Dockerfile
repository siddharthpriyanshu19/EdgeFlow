# EdgeFlow API — Multi-stage Dockerfile
# Stage 1: base
# Stage 2: development (with hot reload)
# Stage 3: builder (compile TypeScript)
# Stage 4: production (minimal runtime image)

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ─── Stage 2: Development ─────────────────────────────────────────────────────
FROM base AS development
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/

RUN npm install

COPY . .

WORKDIR /app/apps/api

# Run migrations then start development server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]

# ─── Stage 3: Builder ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/
COPY packages/validation/package.json ./packages/validation/

RUN npm ci

COPY . .

# Build packages in dependency order
RUN npm run build --workspace=packages/logger
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=packages/validation
RUN npm run build --workspace=apps/api

# Generate Prisma client
RUN npm run db:generate

# ─── Stage 4: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 edgeflow

# Copy built artifacts
COPY --from=builder --chown=edgeflow:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=edgeflow:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=edgeflow:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=edgeflow:nodejs /app/package.json ./package.json

USER edgeflow

EXPOSE 3001 9090

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node apps/api/dist/server.js"]
