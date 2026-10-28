# Gamut Repair server: API + the screens, served to every PC on the factory network.
FROM node:22-bookworm-slim
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
# Time zone data, so "today" on the dashboards follows the factory clock (TZ).
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN npm ci --workspace=@gamut/core --workspace=@gamut/server --workspace=@gamut/web --include-workspace-root --no-audit --no-fund

COPY packages/core packages/core
COPY apps/server apps/server
COPY apps/web apps/web
RUN npm run build -w @gamut/web

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
WORKDIR /app/apps/server
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
