"""tests for admin endpoints."""

import json

import pytest
from httpx import AsyncClient

from tests.conftest import hmac_headers


async def _link_user(client: AsyncClient, discord_id: str, username: str = 'u') -> str:
    r = await client.post('/api/auth/start')
    code, cookie = r.json()['code'], r.cookies['attu_session']
    body = json.dumps({'code': code, 'discord_id': discord_id, 'discord_username': username}).encode()
    await client.post('/api/bot/auth/link', content=body, headers={**hmac_headers(body), 'content-type': 'application/json'})
    return cookie


@pytest.mark.unit
async def test_admin_list_users(client: AsyncClient):
    admin_cookie = await _link_user(client, '1', 'admin')  # first user → admin
    await _link_user(client, '2', 'regular')

    client.cookies.set('attu_session', admin_cookie)
    r = await client.get('/api/admin/users')
    assert r.status_code == 200
    body = r.json()
    assert body['total'] == 2
    discord_ids = {u['discord_id'] for u in body['users']}
    assert {'1', '2'} == discord_ids


@pytest.mark.unit
async def test_admin_promote_user(client: AsyncClient):
    admin_cookie = await _link_user(client, '1', 'admin')
    regular_cookie = await _link_user(client, '2', 'regular')

    client.cookies.set('attu_session', admin_cookie)
    users = (await client.get('/api/admin/users')).json()['users']
    target_id = next(u['id'] for u in users if u['discord_id'] == '2')

    r = await client.put(f'/api/admin/users/{target_id}', json={'role': 'admin'})
    assert r.status_code == 200
    assert r.json()['role'] == 'admin'

    # verify via /me
    client.cookies.set('attu_session', regular_cookie)
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'


@pytest.mark.unit
async def test_admin_delete_user(client: AsyncClient):
    admin_cookie = await _link_user(client, '1', 'admin')
    victim_cookie = await _link_user(client, '2', 'victim')

    client.cookies.set('attu_session', admin_cookie)
    users = (await client.get('/api/admin/users')).json()['users']
    victim_id = next(u['id'] for u in users if u['discord_id'] == '2')

    r = await client.delete(f'/api/admin/users/{victim_id}')
    assert r.status_code == 204

    # victim session invalidated
    client.cookies.set('attu_session', victim_cookie)
    r2 = await client.get('/api/auth/me')
    assert r2.status_code == 401


@pytest.mark.unit
async def test_admin_cannot_delete_self(client: AsyncClient):
    admin_cookie = await _link_user(client, '1', 'admin')
    client.cookies.set('attu_session', admin_cookie)
    me = (await client.get('/api/auth/me')).json()
    r = await client.delete(f'/api/admin/users/{me["id"]}')
    assert r.status_code == 400


@pytest.mark.unit
async def test_non_admin_cannot_access_admin_routes(client: AsyncClient):
    await _link_user(client, '1', 'admin')  # creates first admin
    regular_cookie = await _link_user(client, '2', 'regular')

    client.cookies.set('attu_session', regular_cookie)
    r = await client.get('/api/admin/users')
    assert r.status_code == 403


@pytest.mark.unit
async def test_unauthenticated_cannot_access_admin_routes(client: AsyncClient):
    r = await client.get('/api/admin/users')
    assert r.status_code == 401
