# combined build: spa first, then python runtime
# single image / single port; fastapi mounts the spa at /

# ---------------------------------------------------------------------------
# stage 1: build the web spa
# ---------------------------------------------------------------------------
FROM node:22-slim AS web-builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

COPY apps/web/ apps/web/
COPY packages/api-client/ packages/api-client/
# spa is always served under /trees/; the deployment topology is fixed,
# so this is baked into the image rather than passed as a build arg
RUN VITE_BASE=/trees/ pnpm -F web build

# ---------------------------------------------------------------------------
# stage 2: runtime — uv image is the base; deps installed in place
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm AS runtime

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --shell /usr/sbin/nologin --create-home app

WORKDIR /app

COPY apps/server/pyproject.toml apps/server/uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev || uv sync --no-install-project --no-dev

COPY apps/server/attu_tree ./attu_tree
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

COPY --from=web-builder /workspace/apps/web/dist /app/static

# bind-mount target for trees-config.toml + sqlite db; the host directory is
# mounted onto /app/data at runtime and must be writable by the non-root user
RUN mkdir -p /app/data && chown -R app:app /app

ENV PATH=/app/.venv/bin:$PATH
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "attu_tree.main:app", "--host", "0.0.0.0", "--port", "8000"]
