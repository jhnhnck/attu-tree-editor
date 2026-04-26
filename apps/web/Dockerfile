# multi-stage build for the web SPA
# produces /app/dist/ copied into the server image's /app/static/

FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
# copy workspace config and all manifests so pnpm install can resolve
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

# copy source and build
COPY apps/web/ apps/web/
COPY packages/api-client/ packages/api-client/
ARG VITE_BASE=/trees/
RUN VITE_BASE=${VITE_BASE} pnpm -F web build
