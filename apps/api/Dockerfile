# Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t sparks-api .
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/

# Skip postinstall (build:shared) — sources are not copied yet
RUN npm ci --ignore-scripts --workspace=@sparks/shared --workspace=@sparks/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @sparks/shared && npm run build -w @sparks/api \
  && mkdir -p apps/api/dist/db/migrations \
  && cp -R apps/api/src/db/migrations/. apps/api/dist/db/migrations/

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/

RUN npm ci --omit=dev --ignore-scripts --workspace=@sparks/shared --workspace=@sparks/api --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
