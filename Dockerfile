# -----------------------------------------------------------------------------
# Integration image.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see the CI workflow
# -----------------------------------------------------------------------------

FROM node:24-alpine

# Link the GHCR package to this repository so the workflow's GITHUB_TOKEN
# is allowed to push it (fixes `permission_denied: write_package`).
LABEL org.opencontainers.image.source="https://github.com/quentinlegay/gladys-tydom"

# dumb-init: handles signals (SIGTERM) correctly for a graceful shutdown.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install the PROD dependencies first (better build cache).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Then the integration code.
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json ./

# The only writable location allowed at runtime.
ENV NODE_ENV=production
VOLUME ["/data"]

# Run as an unprivileged user (already present in the node image).
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
