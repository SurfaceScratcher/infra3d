# infra3d app: imports compose stacks, checks every endpoint and serves the 3D view.
#   docker build -t infra3d .
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/infra3d/package.json packages/infra3d/
COPY packages/import-compose/package.json packages/import-compose/
COPY apps/app/package.json apps/app/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w infra3d -w infra3d-import-compose \
 && npm run build -w @infra3d/app \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# Workspace packages are symlinked from node_modules, so they keep their place in the tree
COPY --from=build /src/package.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/infra3d/package.json ./packages/infra3d/
COPY --from=build /src/packages/infra3d/dist ./packages/infra3d/dist
COPY --from=build /src/packages/import-compose/package.json ./packages/import-compose/
COPY --from=build /src/packages/import-compose/dist ./packages/import-compose/dist
COPY --from=build /src/apps/app/package.json ./apps/app/
COPY --from=build /src/apps/app/server/dist ./apps/app/server/dist
COPY --from=build /src/apps/app/web/dist ./apps/app/web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["node", "apps/app/server/dist/index.js"]
