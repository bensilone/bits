# Build from monorepo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com \
#     -t sparks-web .
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/

RUN npm ci --workspace=@sparks/shared --workspace=@sparks/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build -w @sparks/shared && npm run build -w @sparks/web

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
