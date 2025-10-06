FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    BALANCE_BOT_DATA_DIR=/app/data

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/apps/backend/package.json apps/backend/
COPY --from=builder /app/apps/frontend/package.json apps/frontend/
RUN npm ci --omit=dev

COPY --from=builder /app/apps/backend/src apps/backend/src
COPY --from=builder /app/apps/frontend/dist apps/frontend/dist
COPY --from=builder /app/logo.svg ./logo.svg
COPY --from=builder /app/eslint.config.js ./eslint.config.js

RUN apk add --no-cache tzdata \
  && addgroup -S app && adduser -S app -G app \
  && mkdir -p /app/data && chown -R app:app /app

USER app
EXPOSE 4000
CMD ["npm", "run", "start", "--workspace=@balance-bot/backend"]
