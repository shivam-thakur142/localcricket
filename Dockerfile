# ==============================================================================
# STAGE 1: Client Builder (Compiles Vite React SPA)
# ==============================================================================
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Install client dependencies cleanly
COPY client/package*.json ./
RUN npm ci

# Copy client source code and build static production bundle
COPY client/ ./
RUN npm run build

# ==============================================================================
# STAGE 2: Server Dependencies Builder (Production Only)
# ==============================================================================
FROM node:20-alpine AS server-builder
WORKDIR /app/server

# Install production-only backend dependencies
COPY server/package*.json ./
RUN npm ci --omit=dev

# ==============================================================================
# STAGE 3: Minimal Production Runner
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install wget for lightweight container healthchecks
RUN apk add --no-cache wget

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Run container as unprivileged non-root user (UID 1000)
USER node

# Copy production dependencies from server-builder
COPY --chown=node:node --from=server-builder /app/server/node_modules /app/server/node_modules
COPY --chown=node:node server/package.json /app/server/

# Copy compiled frontend assets from client-builder
COPY --chown=node:node --from=client-builder /app/client/dist /app/client/dist

# Copy backend application source code and migrations
COPY --chown=node:node server/src /app/server/src
COPY --chown=node:node server/migrations /app/server/migrations
COPY --chown=node:node shared /app/shared

# Container Healthcheck (Liveness probe against /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

EXPOSE 5000

WORKDIR /app/server
CMD ["node", "src/server.js"]
