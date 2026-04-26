"""FamilyTreeEditor - fastapi entrypoint.

licensed under the MIT license; see LICENSE.md for full text.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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
    allow_origins=settings.cors_origins,
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


# serve the spa from the static/ directory if it exists (production build)
if _STATIC_DIR.exists():
    app.mount('/', StaticFiles(directory=str(_STATIC_DIR), html=True), name='spa')
