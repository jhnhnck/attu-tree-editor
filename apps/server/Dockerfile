# standalone server dockerfile (dev / backend-only iteration)
# for the full production image (spa + server) use the top-level Dockerfile.

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev || uv sync --no-install-project --no-dev

COPY attu_tree ./attu_tree
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev


FROM python:3.13-slim-bookworm AS runtime

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --shell /usr/sbin/nologin --create-home app

WORKDIR /app
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/attu_tree /app/attu_tree

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "attu_tree.main:app", "--host", "0.0.0.0", "--port", "8000"]
