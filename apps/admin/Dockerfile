FROM node:24.22.1-alpine AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile
COPY apps/admin/ apps/admin/
COPY packages/ packages/
RUN pnpm --filter @rentaid/admin build

FROM nginx:1.29-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/admin/dist/ /usr/share/nginx/html/admin/
EXPOSE 80
