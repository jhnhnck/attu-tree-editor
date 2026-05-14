"""tests for trees CRUD, share grants, and revision-checked autosave."""

import pytest
from httpx import AsyncClient

from attu_tree.settings import settings
from tests.conftest import authed, link_user


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_create_tree(client: AsyncClient):
    await authed(client, '1')
    r = await client.post('/api/trees', json={'name': 'my tree', 'blob': {'people': {}}})
    assert r.status_code == 201
    body = r.json()
    assert 'id' in body
    assert body['revision'] == 1


@pytest.mark.unit
async def test_create_tree_unauthenticated(client: AsyncClient):
    r = await client.post('/api/trees', json={'name': 'x'})
    assert r.status_code == 401


@pytest.mark.unit
async def test_list_trees(client: AsyncClient):
    await authed(client, '1')
    await client.post('/api/trees', json={'name': 'tree-a'})
    await client.post('/api/trees', json={'name': 'tree-b'})
    r = await client.get('/api/trees')
    assert r.status_code == 200
    names = {t['name'] for t in r.json()['trees']}
    assert names == {'tree-a', 'tree-b'}


@pytest.mark.unit
async def test_get_tree(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 'test', 'blob': {'x': 1}})).json()['id']
    r = await client.get(f'/api/trees/{tree_id}')
    assert r.status_code == 200
    body = r.json()
    assert body['name'] == 'test'
    assert body['blob'] == {'x': 1}
    assert body['role'] == 'owner'


@pytest.mark.unit
async def test_get_tree_not_found(client: AsyncClient):
    await authed(client, '1')
    r = await client.get('/api/trees/nonexistent-id')
    assert r.status_code == 404


@pytest.mark.unit
async def test_delete_tree(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 'bye'})).json()['id']
    r = await client.delete(f'/api/trees/{tree_id}')
    assert r.status_code == 204
    assert (await client.get(f'/api/trees/{tree_id}')).status_code == 404


@pytest.mark.unit
async def test_delete_tree_not_owner(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'secret'})).json()['id']

    intruder_cookie = await link_user(client, '2', 'intruder')
    client.cookies.set('attu_session', intruder_cookie)
    r = await client.delete(f'/api/trees/{tree_id}')
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# share grants
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_add_and_revoke_grant(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    await link_user(client, '2', 'editor')  # ensure user exists

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'shared'})).json()['id']

    r = await client.post(f'/api/trees/{tree_id}/grants', json={'discord_id': '2', 'role': 'editor'})
    assert r.status_code == 201
    grantee_id = r.json()['user_id']

    # grantee can read
    grantee_cookie = await link_user(client, '2', 'editor')
    client.cookies.set('attu_session', grantee_cookie)
    r2 = await client.get(f'/api/trees/{tree_id}')
    assert r2.status_code == 200
    assert r2.json()['role'] == 'editor'

    # owner revokes
    client.cookies.set('attu_session', owner_cookie)
    r3 = await client.delete(f'/api/trees/{tree_id}/grants/{grantee_id}')
    assert r3.status_code == 204

    # grantee can no longer read
    client.cookies.set('attu_session', grantee_cookie)
    r4 = await client.get(f'/api/trees/{tree_id}')
    assert r4.status_code == 403


@pytest.mark.unit
async def test_viewer_cannot_write(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    viewer_cookie = await link_user(client, '2', 'viewer')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'ro'})).json()['id']
    await client.post(f'/api/trees/{tree_id}/grants', json={'discord_id': '2', 'role': 'viewer'})

    client.cookies.set('attu_session', viewer_cookie)
    r = await client.put(f'/api/trees/{tree_id}', json={'blob': {}, 'expected_revision': 1})
    assert r.status_code == 403


@pytest.mark.unit
async def test_outsider_cannot_read(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    outsider_cookie = await link_user(client, '2', 'outsider')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'private'})).json()['id']

    client.cookies.set('attu_session', outsider_cookie)
    r = await client.get(f'/api/trees/{tree_id}')
    assert r.status_code == 403


@pytest.mark.unit
async def test_list_grants(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    await link_user(client, '2', 'editor-user')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'shared'})).json()['id']
    await client.post(f'/api/trees/{tree_id}/grants', json={'discord_id': '2', 'role': 'editor'})

    r = await client.get(f'/api/trees/{tree_id}/grants')
    assert r.status_code == 200
    grants = r.json()['grants']
    assert len(grants) == 1
    assert grants[0]['discord_id'] == '2'
    assert grants[0]['role'] == 'editor'
    assert 'display_name' in grants[0]


@pytest.mark.unit
async def test_list_grants_requires_owner(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    intruder_cookie = await link_user(client, '2', 'intruder')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'private'})).json()['id']

    client.cookies.set('attu_session', intruder_cookie)
    r = await client.get(f'/api/trees/{tree_id}/grants')
    assert r.status_code == 403


@pytest.mark.unit
async def test_listed_trees_include_shared(client: AsyncClient):
    owner_cookie = await link_user(client, '1', 'owner')
    editor_cookie = await link_user(client, '2', 'editor')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'collaborative'})).json()['id']
    await client.post(f'/api/trees/{tree_id}/grants', json={'discord_id': '2', 'role': 'editor'})

    client.cookies.set('attu_session', editor_cookie)
    r = await client.get('/api/trees')
    ids = [t['id'] for t in r.json()['trees']]
    assert tree_id in ids


# ---------------------------------------------------------------------------
# revision-checked autosave
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_save_lww_happy_path(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 'test', 'blob': {}})).json()['id']

    r = await client.put(f'/api/trees/{tree_id}', json={'blob': {'x': 1}, 'expected_revision': 1})
    assert r.status_code == 200
    body = r.json()
    assert body['revision'] == 2
    assert 'updated_at' in body


@pytest.mark.unit
async def test_save_conflict_returns_409(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 'conflict', 'blob': {'v': 0}})).json()['id']

    # send wrong expected_revision
    r = await client.put(f'/api/trees/{tree_id}', json={'blob': {'v': 1}, 'expected_revision': 99})
    assert r.status_code == 409
    body = r.json()
    assert body['server_revision'] == 1
    assert 'server_blob' in body


@pytest.mark.unit
async def test_save_updates_name(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 'old', 'blob': {}})).json()['id']
    await client.put(f'/api/trees/{tree_id}', json={'name': 'new', 'blob': {}, 'expected_revision': 1})
    r = await client.get(f'/api/trees/{tree_id}')
    assert r.json()['name'] == 'new'


@pytest.mark.unit
async def test_save_revision_increments(client: AsyncClient):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'blob': {}})).json()['id']
    for i in range(3):
        r = await client.put(f'/api/trees/{tree_id}', json={'blob': {}, 'expected_revision': i + 1})
        assert r.json()['revision'] == i + 2


# ---------------------------------------------------------------------------
# blob size cap
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_create_tree_rejects_oversized_blob(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings.server, 'max_tree_blob_bytes', 256)
    await authed(client, '1')
    big = {'people': {f'p{i}': {'given': 'x' * 50} for i in range(100)}}
    r = await client.post('/api/trees', json={'name': 'big', 'blob': big})
    assert r.status_code == 413


@pytest.mark.unit
async def test_save_tree_rejects_oversized_blob(client: AsyncClient, monkeypatch):
    await authed(client, '1')
    tree_id = (await client.post('/api/trees', json={'name': 't', 'blob': {}})).json()['id']

    monkeypatch.setattr(settings.server, 'max_tree_blob_bytes', 256)
    big = {'people': {f'p{i}': {'given': 'x' * 50} for i in range(100)}}
    r = await client.put(
        f'/api/trees/{tree_id}',
        json={'blob': big, 'expected_revision': 1},
    )
    assert r.status_code == 413
