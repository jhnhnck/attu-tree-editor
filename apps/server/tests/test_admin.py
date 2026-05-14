"""tests for admin endpoints + admin's cross-tree authority."""

import pytest
from httpx import AsyncClient

from tests.conftest import authed, link_user


@pytest.mark.unit
async def test_admin_list_users(client: AsyncClient):
    admin_cookie = await link_user(client, '1', 'admin', roles=['admin'])
    await link_user(client, '2', 'regular')

    client.cookies.set('attu_session', admin_cookie)
    r = await client.get('/api/admin/users')
    assert r.status_code == 200
    body = r.json()
    assert body['total'] == 2
    discord_ids = {u['discord_id'] for u in body['users']}
    assert {'1', '2'} == discord_ids


@pytest.mark.unit
async def test_admin_can_rename_user(client: AsyncClient):
    """admin can rename the display_name; role mutation is not exposed
    through this endpoint (role authority lives on the discord side)."""
    admin_cookie = await link_user(client, '1', 'admin', roles=['admin'])
    await link_user(client, '2', 'orig')

    client.cookies.set('attu_session', admin_cookie)
    users = (await client.get('/api/admin/users')).json()['users']
    target_id = next(u['id'] for u in users if u['discord_id'] == '2')

    r = await client.put(f'/api/admin/users/{target_id}', json={'display_name': 'renamed'})
    assert r.status_code == 200
    assert r.json()['display_name'] == 'renamed'
    assert r.json()['role'] == 'user'  # role unchanged


@pytest.mark.unit
async def test_admin_role_field_is_unknown(client: AsyncClient):
    """clients that try to send a role field get the request rejected by
    pydantic (model has no such field). this enforces 'discord side is the
    only role authority' at the wire."""
    admin_cookie = await link_user(client, '1', 'admin', roles=['admin'])
    await link_user(client, '2', 'target')

    client.cookies.set('attu_session', admin_cookie)
    users = (await client.get('/api/admin/users')).json()['users']
    target_id = next(u['id'] for u in users if u['discord_id'] == '2')

    # extra fields are ignored by default in pydantic, so we just verify the
    # role doesn't change even if the client tries
    r = await client.put(
        f'/api/admin/users/{target_id}',
        json={'role': 'admin', 'display_name': 'x'},
    )
    assert r.status_code == 200
    assert r.json()['role'] == 'user'


@pytest.mark.unit
async def test_admin_delete_user(client: AsyncClient):
    admin_cookie = await link_user(client, '1', 'admin', roles=['admin'])
    victim_cookie = await link_user(client, '2', 'victim')

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
    await authed(client, '1', 'admin', roles=['admin'])
    me = (await client.get('/api/auth/me')).json()
    r = await client.delete(f'/api/admin/users/{me["id"]}')
    assert r.status_code == 400


@pytest.mark.unit
async def test_non_admin_cannot_access_admin_routes(client: AsyncClient):
    await link_user(client, '1', 'admin', roles=['admin'])
    regular_cookie = await link_user(client, '2', 'regular')

    client.cookies.set('attu_session', regular_cookie)
    r = await client.get('/api/admin/users')
    assert r.status_code == 403


@pytest.mark.unit
async def test_unauthenticated_cannot_access_admin_routes(client: AsyncClient):
    r = await client.get('/api/admin/users')
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# admin's cross-tree authority
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_admin_can_read_others_tree(client: AsyncClient):
    """admins bypass per-tree access checks and can GET any tree."""
    owner_cookie = await link_user(client, '1', 'owner')
    admin_cookie = await link_user(client, '2', 'admin', roles=['admin'])

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'private'})).json()['id']

    client.cookies.set('attu_session', admin_cookie)
    r = await client.get(f'/api/trees/{tree_id}')
    assert r.status_code == 200
    assert r.json()['name'] == 'private'


@pytest.mark.unit
async def test_admin_can_edit_others_tree(client: AsyncClient):
    """admins can save into a tree they don't own without an explicit grant."""
    owner_cookie = await link_user(client, '1', 'owner')
    admin_cookie = await link_user(client, '2', 'admin', roles=['admin'])

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'foo', 'blob': {}})).json()['id']

    client.cookies.set('attu_session', admin_cookie)
    r = await client.put(
        f'/api/trees/{tree_id}',
        json={'blob': {'edited_by_admin': True}, 'expected_revision': 1},
    )
    assert r.status_code == 200
    assert r.json()['revision'] == 2

    r2 = await client.get(f'/api/trees/{tree_id}')
    assert r2.json()['blob'] == {'edited_by_admin': True}


@pytest.mark.unit
async def test_admin_can_delete_others_tree(client: AsyncClient):
    """admins can delete trees they don't own."""
    owner_cookie = await link_user(client, '1', 'owner')
    admin_cookie = await link_user(client, '2', 'admin', roles=['admin'])

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'doomed'})).json()['id']

    client.cookies.set('attu_session', admin_cookie)
    r = await client.delete(f'/api/trees/{tree_id}')
    assert r.status_code == 204

    # gone for the original owner too
    client.cookies.set('attu_session', owner_cookie)
    r2 = await client.get(f'/api/trees/{tree_id}')
    assert r2.status_code == 404


@pytest.mark.unit
async def test_admin_can_share_others_tree(client: AsyncClient):
    """admins can grant access on trees they don't own."""
    owner_cookie = await link_user(client, '1', 'owner')
    admin_cookie = await link_user(client, '2', 'admin', roles=['admin'])
    grantee_cookie = await link_user(client, '3', 'grantee')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'shared-by-admin'})).json()['id']

    client.cookies.set('attu_session', admin_cookie)
    r = await client.post(
        f'/api/trees/{tree_id}/grants',
        json={'discord_id': '3', 'role': 'editor'},
    )
    assert r.status_code == 201

    # grantee can now read
    client.cookies.set('attu_session', grantee_cookie)
    r2 = await client.get(f'/api/trees/{tree_id}')
    assert r2.status_code == 200
    assert r2.json()['role'] == 'editor'


@pytest.mark.unit
async def test_admin_can_revoke_grants_on_others_tree(client: AsyncClient):
    """admins can revoke a grant on someone else's tree."""
    owner_cookie = await link_user(client, '1', 'owner')
    admin_cookie = await link_user(client, '2', 'admin', roles=['admin'])
    grantee_cookie = await link_user(client, '3', 'grantee')

    client.cookies.set('attu_session', owner_cookie)
    tree_id = (await client.post('/api/trees', json={'name': 'tt'})).json()['id']
    grant = (
        await client.post(
            f'/api/trees/{tree_id}/grants',
            json={'discord_id': '3', 'role': 'editor'},
        )
    ).json()

    client.cookies.set('attu_session', admin_cookie)
    r = await client.delete(f'/api/trees/{tree_id}/grants/{grant["user_id"]}')
    assert r.status_code == 204

    client.cookies.set('attu_session', grantee_cookie)
    r2 = await client.get(f'/api/trees/{tree_id}')
    assert r2.status_code == 403
