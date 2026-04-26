"""tests for the link-code auth flow and session management."""

import hashlib
import hmac as _hmac
import json
import time

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_HMAC_SECRET, hmac_headers


@pytest.mark.unit
async def test_auth_start_returns_code(client: AsyncClient):
    r = await client.post('/api/auth/start')
    assert r.status_code == 200
    body = r.json()
    assert len(body['code']) == 6
    assert 'expires_at' in body
    # cookie is set
    assert 'attu_session' in r.cookies


@pytest.mark.unit
async def test_auth_check_pending_before_bot(client: AsyncClient):
    r = await client.post('/api/auth/start')
    client.cookies.set('attu_session', r.cookies['attu_session'])
    r2 = await client.get('/api/auth/check')
    assert r2.status_code == 200
    assert r2.json()['status'] == 'pending'


@pytest.mark.unit
async def test_auth_check_no_cookie(client: AsyncClient):
    r = await client.get('/api/auth/check')
    assert r.status_code == 200
    assert r.json()['status'] == 'not_found'


@pytest.mark.unit
async def test_bot_link_happy_path(client: AsyncClient):
    # start a code
    r = await client.post('/api/auth/start')
    code = r.json()['code']
    session_cookie = r.cookies['attu_session']

    # bot redeems
    body = json.dumps({'code': code, 'discord_id': '111', 'discord_username': 'testuser'}).encode()
    r2 = await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})
    assert r2.status_code == 200
    assert r2.json()['display_name'] == 'testuser'

    # web polling now sees ok
    client.cookies.set('attu_session', session_cookie)
    r3 = await client.get('/api/auth/check')
    assert r3.json()['status'] == 'ok'


@pytest.mark.unit
async def test_bot_link_code_not_found(client: AsyncClient):
    body = json.dumps({'code': 'XXXXXX', 'discord_id': '111', 'discord_username': 'x'}).encode()
    r = await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})
    assert r.status_code == 422
    assert r.json()['detail'] == 'code_not_found'


@pytest.mark.unit
async def test_bot_link_code_already_used(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code = r.json()['code']

    payload = {'code': code, 'discord_id': '111', 'discord_username': 'x'}
    body = json.dumps(payload).encode()
    headers = {**hmac_headers(body), 'content-type': 'application/json'}

    await client.post('/api/bot/auth/link', content=body, headers=headers)
    # second attempt
    body2 = json.dumps(payload).encode()
    r2 = await client.post('/api/bot/auth/link', content=body2, headers={**hmac_headers(body2), 'content-type': 'application/json'})
    assert r2.status_code == 422
    assert r2.json()['detail'] == 'code_already_used'


@pytest.mark.unit
async def test_bot_link_hmac_mismatch(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code = r.json()['code']
    body = json.dumps({'code': code, 'discord_id': '111', 'discord_username': 'x'}).encode()
    bad_headers = hmac_headers(body, secret='wrong-secret')
    r2 = await client.post('/api/bot/auth/link', content=body, headers={**bad_headers, 'content-type': 'application/json'})
    assert r2.status_code == 401


@pytest.mark.unit
async def test_bot_link_hmac_replay(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code = r.json()['code']
    body = json.dumps({'code': code, 'discord_id': '111', 'discord_username': 'x'}).encode()
    # stale timestamp (6 minutes ago)
    ts = str(int(time.time()) - 400)
    payload = f'{ts}.'.encode() + body
    sig = _hmac.new(TEST_HMAC_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    bad_headers = {'x-attu-timestamp': ts, 'x-attu-signature': f'sha256={sig}', 'content-type': 'application/json'}
    r2 = await client.post('/api/bot/auth/link', content=body, headers=bad_headers)
    assert r2.status_code == 401


@pytest.mark.unit
async def test_me_returns_user(client: AsyncClient):
    # link first
    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({'code': code, 'discord_id': '999', 'discord_username': 'meeee'}).encode()
    await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})

    client.cookies.set('attu_session', cookie)
    r2 = await client.get('/api/auth/me')
    assert r2.status_code == 200
    me = r2.json()
    assert me['discord_id'] == '999'
    assert me['discord_username'] == 'meeee'


@pytest.mark.unit
async def test_me_unauthenticated(client: AsyncClient):
    r = await client.get('/api/auth/me')
    assert r.status_code == 401


@pytest.mark.unit
async def test_logout_clears_session(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({'code': code, 'discord_id': '777', 'discord_username': 'logoutuser'}).encode()
    await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})

    client.cookies.set('attu_session', cookie)
    await client.post('/api/auth/logout')
    client.cookies.delete('attu_session')

    r2 = await client.get('/api/auth/me')
    assert r2.status_code == 401


@pytest.mark.unit
async def test_bootstrap_admin_promotion(client: AsyncClient, monkeypatch):
    from attu_tree.settings import settings
    monkeypatch.setattr(settings, 'initial_admin_discord_id', '42')

    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({'code': code, 'discord_id': '42', 'discord_username': 'bootstrap'}).encode()
    await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})

    client.cookies.set('attu_session', cookie)
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'


@pytest.mark.unit
async def test_first_user_auto_admin(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({'code': code, 'discord_id': '1', 'discord_username': 'first'}).encode()
    await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})

    client.cookies.set('attu_session', cookie)
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'


@pytest.mark.unit
async def test_second_user_is_not_admin(client: AsyncClient):
    async def _link(discord_id: str, username: str):
        r = await client.post('/api/auth/start')
        code = r.json()['code']
        body = json.dumps({'code': code, 'discord_id': discord_id, 'discord_username': username}).encode()
        await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})
        return r.cookies['attu_session']

    await _link('1', 'first')
    cookie2 = await _link('2', 'second')
    client.cookies.set('attu_session', cookie2)
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'user'
