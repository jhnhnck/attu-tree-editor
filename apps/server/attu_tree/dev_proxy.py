"""dev-only reverse proxy: /trees → vite :5173, /edit → vite :5174.

only active when the built static dir is absent (dev mode). mount() must be
called before the spa catch-all route so these paths match first.

fixes applied vs naive passthrough:
- adds accept-encoding: identity on upstream requests so vite never returns
  a compressed body; without this, dropping content-encoding from the response
  headers causes the browser to parse gzip bytes as plain text.
- forces cache-control: no-store on every proxied response so browsers don't
  cache stale bundles between edits.
- proxies websocket upgrades so vite hmr can push reload events to the browser.
"""

import asyncio
import contextlib
import logging
from typing import Any

import httpx
import websockets
import websockets.exceptions
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import Response
from starlette.websockets import WebSocketDisconnect


log = logging.getLogger(__name__)

_ROUTES: dict[str, str] = {
    '/trees': 'http://127.0.0.1:5173',
    '/edit': 'http://127.0.0.1:5174',
}

# hop-by-hop headers that must not be forwarded
_HOP_BY_HOP = frozenset({'content-encoding', 'content-length', 'transfer-encoding', 'connection'})
# drop from request before forwarding; we add accept-encoding: identity ourselves
_DROP_REQ = frozenset({'host', 'content-length', 'accept-encoding'})

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
    headers.append(('accept-encoding', 'identity'))
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
    out_headers['cache-control'] = 'no-store'
    return Response(content=resp.content, status_code=resp.status_code, headers=out_headers)


async def _forward_to_upstream(client_ws: WebSocket, upstream: Any) -> None:
    with contextlib.suppress(WebSocketDisconnect, Exception):
        while True:
            msg = await client_ws.receive()
            if msg['type'] == 'websocket.disconnect':
                break
            text = msg.get('text')
            data = msg.get('bytes')
            if text is not None:
                await upstream.send(text)
            elif data is not None:
                await upstream.send(data)


async def _forward_to_client(client_ws: WebSocket, upstream: Any) -> None:
    with contextlib.suppress(Exception):
        async for msg in upstream:
            if isinstance(msg, str):
                await client_ws.send_text(msg)
            else:
                await client_ws.send_bytes(msg)


async def _ws_proxy(client_ws: WebSocket, base: str, path: str = '') -> None:
    await client_ws.accept()
    ws_url = base.replace('http://', 'ws://') + (f'/{path}' if path else '')
    try:
        async with websockets.connect(ws_url) as upstream:
            tasks = [
                asyncio.create_task(_forward_to_upstream(client_ws, upstream)),
                asyncio.create_task(_forward_to_client(client_ws, upstream)),
            ]
            _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
    except (OSError, websockets.exceptions.WebSocketException):
        log.warning('dev proxy: vite ws not ready at %s', ws_url)
    finally:
        with contextlib.suppress(Exception):
            await client_ws.close()


def mount(app: FastAPI) -> None:
    """register /trees and /edit proxy routes. call before the spa catch-all."""
    _methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']

    for prefix, base in _ROUTES.items():
        b = base

        async def _root(request: Request, _b: str = b) -> Response:
            return await _proxy(request, _b)

        async def _path(request: Request, path: str, _b: str = b) -> Response:
            return await _proxy(request, _b)

        async def _ws_root(ws: WebSocket, _b: str = b) -> None:
            await _ws_proxy(ws, _b)

        async def _ws_path(ws: WebSocket, path: str, _b: str = b) -> None:
            await _ws_proxy(ws, _b, path)

        app.add_api_route(prefix, _root, methods=_methods, include_in_schema=False, response_model=None)
        app.add_api_route(f'{prefix}/{{path:path}}', _path, methods=_methods, include_in_schema=False, response_model=None)
        app.add_api_websocket_route(prefix, _ws_root)
        app.add_api_websocket_route(f'{prefix}/{{path:path}}', _ws_path)
