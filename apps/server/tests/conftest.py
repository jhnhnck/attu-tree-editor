"""shared fixtures for the server test suite."""

import hashlib
import hmac
import json
import secrets
import time
from collections.abc import AsyncGenerator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from attu_tree.main import app
from attu_tree.ratelimit import auth_start_limiter, tree_limiter
from attu_tree.settings import settings


TEST_HMAC_SECRET = secrets.token_hex(32)


@pytest.fixture(autouse=True)
def configure_test_settings(tmp_path, monkeypatch):
    """use an in-memory sqlite db and known secrets for every test."""
    monkeypatch.setattr(settings.server, 'database_url', f'sqlite+aiosqlite:///{tmp_path}/test.db')
    monkeypatch.setattr(settings.server, 'cors_origins', ['http://localhost:5173'])
    monkeypatch.setattr(settings.secrets, 'discord_bot_hmac_secret', TEST_HMAC_SECRET)
    monkeypatch.setattr(settings.secrets, 'session_secret', 'test-session-secret')
    monkeypatch.setattr(settings, 'session_cookie_path', '/')


@pytest.fixture(autouse=True)
def bypass_rate_limiters(monkeypatch):
    """disable rate limiting for the entire test suite.

    the default key_fn returns None for requests with no client ip; we
    monkeypatch both limiters' key_fn to always return None so every test
    request is let through unconditionally. tests that verify the limiter
    itself set up their own RateLimiter instances or manipulate _buckets
    directly without going through the live singletons.
    """
    monkeypatch.setattr(auth_start_limiter, '_key_fn', lambda _req: None)
    monkeypatch.setattr(tree_limiter, '_key_fn', lambda _req: None)


@pytest.fixture()
async def client() -> AsyncGenerator[AsyncClient]:
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url='http://test') as c:
            yield c


def hmac_headers(body: bytes, secret: str = TEST_HMAC_SECRET) -> dict[str, str]:
    """sign a request body the way the bot would."""
    ts = str(int(time.time()))
    payload = f'{ts}.'.encode() + body
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return {'x-attu-timestamp': ts, 'x-attu-signature': f'sha256={sig}'}


async def link_user(
    client: AsyncClient,
    discord_id: str,
    username: str = 'u',
    roles: list[str] | None = None,
) -> str:
    """run the full link flow and return the user's session cookie.

    `roles` is the bot-supplied discord-side role list; defaults to empty
    (which the server resolves to plain 'user'). pass ['admin'] to make the
    user an admin.
    """
    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({
        'code': code,
        'discord_id': discord_id,
        'discord_username': username,
        'roles': roles or [],
    }).encode()
    await client.post(
        '/api/bot/auth/link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    return cookie


async def authed(
    client: AsyncClient,
    discord_id: str,
    username: str = 'u',
    roles: list[str] | None = None,
) -> str:
    """link a user and set the session cookie on the client."""
    cookie = await link_user(client, discord_id, username, roles=roles)
    client.cookies.set('attu_session', cookie)
    return cookie
