"""dev-only reverse proxy: /trees → vite :5173, /edit → vite :5174.

only active when the built static dir is absent (dev mode). mount() must be
called before the spa catch-all route so these paths match first.
"""

import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response


log = logging.getLogger(__name__)

_ROUTES: dict[str, str] = {
    '/trees': 'http://127.0.0.1:5173',
    '/edit': 'http://127.0.0.1:5174',
}

# hop-by-hop headers that must not be forwarded
_HOP_BY_HOP = frozenset({'content-encoding', 'content-length', 'transfer-encoding', 'connection'})
_DROP_REQ = frozenset({'host', 'content-length'})

_state: dict[str, httpx.AsyncClient | None] = {'client': None}


def _client() -> httpx.AsyncClient:
    if _state['client'] is None:
        _state['client'] = httpx.AsyncClient(timeout=30.0)
    return _state['client']


async def close() -> None:
    if _state['client'] is not None:
        await _state['client'].aclose()
        _state['client'] = None


async def _proxy(request: Request, base: str) -> Response:
    url = f'{base}{request.url.path}'
    if request.url.query:
        url = f'{url}?{request.url.query}'
    headers = [(k, v) for k, v in request.headers.items() if k.lower() not in _DROP_REQ]
    try:
        resp = await _client().request(
            method=request.method,
            url=url,
            headers=headers,
            content=await request.body(),
        )
    except httpx.ConnectError:
        log.warning('dev proxy: vite not ready at %s', base)
        return Response(content=b'vite dev server not ready', status_code=502)
    out_headers = {k: v for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP}
    return Response(content=resp.content, status_code=resp.status_code, headers=out_headers)


def mount(app: FastAPI) -> None:
    """register /trees and /edit proxy routes. call before the spa catch-all."""
    _methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']

    for prefix, base in _ROUTES.items():
        b = base

        async def _root(request: Request, _b: str = b) -> Response:
            return await _proxy(request, _b)

        async def _path(request: Request, path: str, _b: str = b) -> Response:
            return await _proxy(request, _b)

        app.add_api_route(prefix, _root, methods=_methods, include_in_schema=False, response_model=None)
        app.add_api_route(f'{prefix}/{{path:path}}', _path, methods=_methods, include_in_schema=False, response_model=None)
