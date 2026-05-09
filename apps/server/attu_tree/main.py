"""FamilyTreeEditor - fastapi entrypoint.

licensed under the MIT license; see LICENSE.md for full text.
"""

import functools
import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from attu_tree import __version__
from attu_tree.db import close_db, init_db
from attu_tree.routers.admin import router as admin_router
from attu_tree.routers.auth import router as auth_router
from attu_tree.routers.bot import router as bot_router
from attu_tree.routers.trees import router as trees_router
from attu_tree.settings import settings


log = logging.getLogger(__name__)

_STATIC_DIR = Path(__file__).parent.parent / 'static'
_INDEX_PATH = _STATIC_DIR / 'index.html'


@functools.cache
def _templated_index() -> str:
    """index.html with window.__TREES_CONFIG__ injected; computed once per
    process. settings are loaded at startup and never mutate, so caching is
    free; tests that override settings call `_templated_index.cache_clear()`."""
    raw = _INDEX_PATH.read_text(encoding='utf-8')
    config = {
        'wikiBaseUrl': settings.wiki.base_url,
        'environment': settings.app.environment,
    }
    injection = f'<script>window.__TREES_CONFIG__ = {json.dumps(config)};</script>'
    if '</head>' in raw:
        return raw.replace('</head>', f'    {injection}\n</head>', 1)
    return injection + raw


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    await init_db()
    yield
    await close_db()


class HealthResponse(BaseModel):
    status: str
    version: str


app = FastAPI(
    title='attu tree',
    version=__version__,
    description='backend for the family tree editor',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.server.cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router)
app.include_router(trees_router)
app.include_router(bot_router)
app.include_router(admin_router)


@app.get('/health')
async def health() -> HealthResponse:
    return HealthResponse(status='ok', version=__version__)


# spa serving: hashed assets straight off disk; everything else (including / and
# any client-side route) returns the templated index so window.__TREES_CONFIG__
# is injected before the spa boots
@app.get('/{full_path:path}', include_in_schema=False, response_model=None)
async def spa(full_path: str) -> HTMLResponse | FileResponse:
    if not _STATIC_DIR.exists():
        # dev mode: server runs without a built spa; let api callers see 404
        raise HTTPException(status_code=404)
    if full_path:
        candidate = _STATIC_DIR / full_path
        # guard against `..` traversal escaping the static dir
        try:
            candidate.resolve().relative_to(_STATIC_DIR.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404) from exc
        if candidate.is_file():
            return FileResponse(candidate)
    return HTMLResponse(content=_templated_index(), headers={'cache-control': 'no-store'})
