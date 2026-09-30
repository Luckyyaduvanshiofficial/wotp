# ============================================
# Stage 1: Install dependencies
# ============================================

ARG NODE_VERSION=22-slim

FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

# Install bun to use bun.lock for dependency resolution
RUN npm install -g bun

# Copy package-related files to leverage Docker cache
COPY package.json bun.lock* ./

# Install dependencies with frozen lockfile for reproducible builds
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --no-save --frozen-lockfile

# ============================================
# Stage 2: Build the Next.js application
# ============================================

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time env vars — override these with --build-arg or in compose.yml.
#
# `NEXT_PUBLIC_*` values are inlined into the bundle at build time, so they must
# be supplied HERE and cannot be changed by restarting the container. They are
# also compiled into the browser payload, so they are public by construction:
# never pass a secret as one of these.
#
# These must be URLs the *browser* can reach. In Docker Compose that is usually
# the host-mapped address (http://localhost:8090), NOT the service name —
# `api`/`pocketbase` resolve only between containers, so a bundle built with
# them would look fine and fail in every real browser.
ARG NEXT_PUBLIC_PB_URL
ARG NEXT_PUBLIC_PB_COLLECTIONS_PREFIX=waotp_
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GITHUB_REPO

# Error reporting is OFF by default, so a stock container reports nothing
# anywhere. `next.config.ts` only wraps the build with Sentry when this is
# unset, so leaving it `true` here is what makes the no-telemetry guarantee hold
# in Docker. Set it to an empty value AND supply your own DSN to opt in — and it
# then reports to your Sentry project, never to the authors'.
ARG NEXT_PUBLIC_SENTRY_DISABLED=true
ENV NEXT_PUBLIC_SENTRY_DISABLED=$NEXT_PUBLIC_SENTRY_DISABLED

ENV NEXT_PUBLIC_PB_URL=$NEXT_PUBLIC_PB_URL
ENV NEXT_PUBLIC_PB_COLLECTIONS_PREFIX=$NEXT_PUBLIC_PB_COLLECTIONS_PREFIX
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_GITHUB_REPO=$NEXT_PUBLIC_GITHUB_REPO

ENV BUILD_STANDALONE=true

RUN npm run build

# ============================================
# Stage 3: Production runner
# ============================================

FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Copy public assets
COPY --from=builder --chown=node:node /app/public ./public

# Create .next dir with correct permissions for prerender cache
RUN mkdir .next && chown node:node .next

# Copy standalone output and static files
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "server.js"]
