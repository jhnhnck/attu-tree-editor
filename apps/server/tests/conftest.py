"""shared fixtures for the server test suite."""

import hashlib
import hmac
import secrets
import time
from collections.abc import AsyncGenerator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from attu_tree.main import app
from attu_tree.settings import settings


TEST_HMAC_SECRET = secrets.token_hex(32)


@pytest.fixture(autouse=True)
def configure_test_settings(tmp_path, monkeypatch):
    """use an in-memory sqlite db and known secrets for every test."""
    monkeypatch.setattr(settings, 'database_url', f'sqlite+aiosqlite:///{tmp_path}/test.db')
    monkeypatch.setattr(settings, 'discord_bot_hmac_secret', TEST_HMAC_SECRET)
    monkeypatch.setattr(settings, 'session_secret', 'test-session-secret')
    monkeypatch.setattr(settings, 'session_cookie_path', '/')
    monkeypatch.setattr(settings, 'initial_admin_discord_id', '')
    monkeypatch.setattr(settings, 'cors_origins', ['http://localhost:5173'])


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
