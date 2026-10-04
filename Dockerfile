# syntax=docker/dockerfile:1

# ---------- build the static UI ----------
FROM node:22-alpine AS build
WORKDIR /app

# Optional npm mirror for users behind a slow network:
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime: sidecar + static files ----------
FROM node:22-alpine
WORKDIR /app

ENV PORT=6186 \
    HOST=0.0.0.0 \
    PUBLIC_DIR=/app/public \
    DATA_DIR=/data

COPY --from=build /app/dist ./public
COPY server/server.mjs ./server.mjs

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 6186

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:6186/__neko/api/health >/dev/null || exit 1

CMD ["node", "server.mjs"]