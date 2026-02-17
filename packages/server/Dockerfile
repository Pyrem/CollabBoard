# Stage 1: Install dependencies and build
FROM node:20-slim AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy all package.json files for dependency resolution
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

# Install all workspace dependencies (including shared + server)
RUN pnpm install --frozen-lockfile

# Copy source code for shared and server
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared first, then server
RUN pnpm --filter @collabboard/shared build && pnpm --filter @collabboard/server build

# Stage 2: Production image
FROM node:20-slim

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist

# Copy shared package.json (needed for module resolution)
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/server/package.json packages/server/package.json

# SQLite data lives on a persistent Fly volume
RUN mkdir -p /data

ENV NODE_ENV=production
ENV HOCUSPOCUS_PORT=1234
ENV EXPRESS_PORT=3001

# Expose both ports
EXPOSE 1234 3001

WORKDIR /app/packages/server

CMD ["node", "dist/index.js"]
