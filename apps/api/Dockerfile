# OmniBot API image. Build from the repo root:  docker build -f apps/api/Dockerfile -t omnibot-api .
# Stage "build" also runs database migrations (docker compose service "migrate").

FROM node:24-bookworm-slim AS build
WORKDIR /repo
ENV CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @omnibot/api... \
 && pnpm --filter @omnibot/api build \
 && pnpm --filter @omnibot/api deploy --legacy --prod /out \
 && cp -r apps/api/dist /out/dist

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
