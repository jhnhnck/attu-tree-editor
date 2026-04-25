"""FamilyTreeEditor - fastapi entrypoint for the backend service.

phase 0: only exposes /health for ci wiring; phase 5 adds auth, trees, sync.

licensed under the MIT license; see LICENSE.md for full text.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from attu_tree import __version__


class HealthResponse(BaseModel):
    status: str
    version: str


app = FastAPI(
    title='attu tree',
    version=__version__,
    description='backend for the family tree editor',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
async def health() -> HealthResponse:
    return HealthResponse(status='ok', version=__version__)
