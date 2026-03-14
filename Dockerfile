# ── Stage 1: Build React client ───────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build/client

# Install client deps
COPY src/client/package*.json ./
RUN npm ci

# Copy source and build
COPY src/client/ ./
RUN npm run build


# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

# Build tools needed by native deps (better-sqlite3)
RUN apk add --no-cache \
      python3 \
      make \
      g++ \
      sqlite-libs \
      openssh-client

WORKDIR /app

# Install server deps (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY src/server/ ./src/server/

# Copy built client into the location Express serves
COPY --from=client-builder /build/client/dist ./src/client/dist

# Create data directory structure (config + db + ssh keys)
RUN mkdir -p /data/config /data/db /data/ssh && \
    chmod 700 /data/ssh

EXPOSE 3001

ENV NODE_ENV=production

# Run as a non-root user for safety
RUN addgroup -S fleet && adduser -S fleet -G fleet && \
    chown -R fleet:fleet /app /data
USER fleet

CMD ["node", "src/server/index.js"]
