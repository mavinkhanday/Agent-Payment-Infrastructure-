# Multi-stage build for Node.js backend and React frontend
# Stage 1: Base dependencies layer (cached)
FROM node:18-alpine AS base
RUN apk add --no-cache postgresql-client curl
WORKDIR /app

# Stage 2: Backend dependencies
FROM base AS backend-deps
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 3: Backend development dependencies (for building if needed)
FROM base AS backend-dev-deps
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Stage 4: Build SDK
FROM base AS sdk-builder
WORKDIR /app/sdk
COPY sdk/package*.json ./
RUN npm ci
COPY sdk/tsconfig.json ./
COPY sdk/src/ ./src/
RUN npm run build && npm prune --production

# Stage 5: Build frontend
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/vite.config.ts ./
COPY dashboard/tailwind.config.js ./
COPY dashboard/postcss.config.js ./
COPY dashboard/tsconfig*.json ./
COPY dashboard/index.html ./
COPY dashboard/src/ ./src/
RUN npm run build

# Stage 6: Final production image
FROM base AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy backend production dependencies
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=backend-deps /app/backend/package*.json ./

# Copy backend source code
COPY src/ ./src/

# Copy built frontend to public directory
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy built SDK
COPY --from=sdk-builder /app/sdk/dist ./sdk/dist
COPY --from=sdk-builder /app/sdk/node_modules ./sdk/node_modules
COPY --from=sdk-builder /app/sdk/package*.json ./sdk/

# Create necessary directories with proper permissions
RUN mkdir -p logs tmp && \
    chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => { process.exit(1) })"

EXPOSE 3000

CMD ["node", "src/server.js"]