"""tests for the bot-only endpoints."""

import json

import pytest
from httpx import AsyncClient

from tests.conftest import authed, hmac_headers, link_user


# ---------------------------------------------------------------------------
# bot user trees
# ---------------------------------------------------------------------------

@pytest.mark.unit
async def test_bot_user_trees_empty(client: AsyncClient):
    await link_user(client, '1', 'owner')
    body = b''
    r = await client.get('/api/bot/users/1/trees', headers=hmac_headers(body))
    assert r.status_code == 200
    assert r.json()['trees'] == []


@pytest.mark.unit
async def test_bot_user_trees_shows_owned(client: AsyncClient):
    await authed(client, '1', 'owner')
    tree_id = (await client.post('/api/trees', json={'name': 'bot-tree'})).json()['id']

    body = b''
    r = await client.get('/api/bot/users/1/trees', headers=hmac_headers(body))
    assert r.status_code == 200
    trees = r.json()['trees']
    assert any(t['id'] == tree_id for t in trees)


@pytest.mark.unit
async def test_bot_user_trees_not_linked(client: AsyncClient):
    body = b''
    r = await client.get('/api/bot/users/999/trees', headers=hmac_headers(body))
    assert r.status_code == 404
    assert r.json()['detail'] == 'user_not_linked'


# ---------------------------------------------------------------------------
# bot grant / revoke
# ---------------------------------------------------------------------------

@pytest.mark.unit
async def test_bot_grant_and_revoke(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    await link_user(client, '2', 'target')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'shared-via-bot'})).json()['id']

    # grant via bot endpoint
    grant_body = json.dumps({
        'actor_discord_id': '1',
        'target_discord_id': '2',
        'target_discord_username': 'target',
        'role': 'editor',
    }).encode()
    r = await client.post(
        f'/api/bot/trees/{tree_id}/grants',
        content=grant_body,
        headers={**hmac_headers(grant_body), 'content-type': 'application/json'},
    )
    assert r.status_code == 201

    # revoke via bot endpoint
    revoke_body = json.dumps({'actor_discord_id': '1', 'target_discord_id': '2'}).encode()
    r2 = await client.request(
        'DELETE',
        f'/api/bot/trees/{tree_id}/grants',
        content=revoke_body,
        headers={**hmac_headers(revoke_body), 'content-type': 'application/json'},
    )
    assert r2.status_code == 204


@pytest.mark.unit
async def test_bot_grant_non_owner_rejected(client: AsyncClient):
    """an actor who isn't the owner (and isn't admin) can't grant."""
    await link_user(client, '2', 'intruder')
    owner_cookie = await link_user(client, '3', 'realowner')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'protected'})).json()['id']

    # intruder tries to grant
    grant_body = json.dumps({
        'actor_discord_id': '2',
        'target_discord_id': '1',
        'target_discord_username': 'x',
        'role': 'editor',
    }).encode()
    r = await client.post(
        f'/api/bot/trees/{tree_id}/grants',
        content=grant_body,
        headers={**hmac_headers(grant_body), 'content-type': 'application/json'},
    )
    assert r.status_code == 403


@pytest.mark.unit
async def test_bot_grant_admin_actor_allowed(client: AsyncClient):
    """admin actor can grant on a tree they don't own (cross-tree authority)."""
    owner_cookie = await link_user(client, '1', 'owner')
    await link_user(client, '2', 'admin', roles=['admin'])

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'shared'})).json()['id']

    grant_body = json.dumps({
        'actor_discord_id': '2',
        'target_discord_id': '3',
        'target_discord_username': 'newcomer',
        'role': 'editor',
    }).encode()
    r = await client.post(
        f'/api/bot/trees/{tree_id}/grants',
        content=grant_body,
        headers={**hmac_headers(grant_body), 'content-type': 'application/json'},
    )
    assert r.status_code == 201


@pytest.mark.unit
async def test_bot_view_link(client: AsyncClient):
    await authed(client, '1', 'owner')
    tree_id = (await client.post('/api/trees', json={'name': 'viewable'})).json()['id']

    body = json.dumps({'actor_discord_id': '1'}).encode()
    r = await client.post(
        f'/api/bot/trees/{tree_id}/view-link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    assert r.status_code == 200
    assert f'/view/{tree_id}' in r.json()['url']


@pytest.mark.unit
async def test_bot_view_link_no_access(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    await link_user(client, '2', 'outsider')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'private'})).json()['id']

    body = json.dumps({'actor_discord_id': '2'}).encode()
    r = await client.post(
        f'/api/bot/trees/{tree_id}/view-link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# hmac on bot routes
# ---------------------------------------------------------------------------

@pytest.mark.unit
async def test_bot_routes_reject_missing_hmac(client: AsyncClient):
    r = await client.get('/api/bot/users/1/trees')
    assert r.status_code in (401, 422)  # missing required header


@pytest.mark.unit
async def test_bot_routes_reject_wrong_secret(client: AsyncClient):
    body = b''
    bad_headers = hmac_headers(body, secret='wrong')
    r = await client.get('/api/bot/users/1/trees', headers=bad_headers)
    assert r.status_code == 401
