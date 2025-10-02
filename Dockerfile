FROM node:22-alpine

# Optionally embed the git commit at build time: --build-arg GIT_SHA=$(git rev-parse --short=12 HEAD)
ARG GIT_SHA
ENV GIT_COMMIT=${GIT_SHA}

WORKDIR /app

# Install deps to a container-only node_modules (kept off your host via anonymous volume)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm i; fi

# Ensure timezone data is available so TZ env works on Alpine
RUN apk add --no-cache tzdata

# Copy source (will be overridden by bind mount at runtime, but helps first build)
COPY src ./src

# Non-root user for safety
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/data && chown -R app:app /app
USER app

ENV NODE_ENV=production
CMD ["npm", "start"]