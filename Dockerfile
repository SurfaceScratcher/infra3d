# stratoscope-infra app: imports compose stacks, checks every endpoint and serves the 3D view.
#   docker build -t stratoscope-infra .
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/infra/package.json packages/infra/
COPY packages/compose/package.json packages/compose/
COPY apps/app/package.json apps/app/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w stratoscope-infra -w stratoscope-compose \
 && npm run build -w stratoscope-infra-app \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# Workspace packages are symlinked from node_modules, so they keep their place in the tree
COPY --from=build /src/package.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/packages/infra/package.json ./packages/infra/
COPY --from=build /src/packages/infra/dist ./packages/infra/dist
COPY --from=build /src/packages/compose/package.json ./packages/compose/
COPY --from=build /src/packages/compose/dist ./packages/compose/dist
COPY --from=build /src/apps/app/package.json ./apps/app/
COPY --from=build /src/apps/app/server/dist ./apps/app/server/dist
COPY --from=build /src/apps/app/web/dist ./apps/app/web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["node", "apps/app/server/dist/index.js"]
