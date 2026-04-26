# combined multi-stage build: spa first, then python server, then runtime
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
ARG VITE_BASE=/trees/
RUN VITE_BASE=${VITE_BASE} pnpm -F web build

# ---------------------------------------------------------------------------
# stage 2: build the python venv
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS py-builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY apps/server/pyproject.toml apps/server/uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev || uv sync --no-install-project --no-dev

COPY apps/server/attu_tree ./attu_tree
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

# ---------------------------------------------------------------------------
# stage 3: runtime
# ---------------------------------------------------------------------------
FROM python:3.13-slim-bookworm AS runtime

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --shell /usr/sbin/nologin --create-home app

WORKDIR /app
COPY --from=py-builder --chown=app:app /app/.venv /app/.venv
COPY --from=py-builder --chown=app:app /app/attu_tree /app/attu_tree
COPY --from=web-builder --chown=app:app /workspace/apps/web/dist /app/static

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "attu_tree.main:app", "--host", "0.0.0.0", "--port", "8000"]
