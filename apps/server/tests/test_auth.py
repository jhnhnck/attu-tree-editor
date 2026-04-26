"""tests for the link-code auth flow and session management."""

import asyncio
import hashlib
import hmac as _hmac
import json
import time

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_HMAC_SECRET, authed, hmac_headers


@pytest.mark.unit
async def test_auth_start_returns_code(client: AsyncClient):
    r = await client.post('/api/auth/start')
    assert r.status_code == 200
    body = r.json()
    code = body['code']
    # display form: `AB-123456`
    assert len(code) == 9
    assert code[2] == '-'
    assert code[:2].isalpha()
    assert code[3:].isdigit()
    assert 'expires_at' in body
    # cookie is set
    assert 'attu_session' in r.cookies


@pytest.mark.unit
async def test_auth_start_dev_codes_use_dev_alphabet(client: AsyncClient, monkeypatch):
    """on dev, the second alpha char is in {X, Z} so the bot can route."""
    from attu_tree.settings import settings
    monkeypatch.setattr(settings, 'environment', 'dev')
    # 50 samples is plenty to catch a partition bug
    for _ in range(50):
        r = await client.post('/api/auth/start')
        code = r.json()['code']
        assert code[1] in 'XZ', f'dev code {code} second char {code[1]!r} not in XZ'


@pytest.mark.unit
async def test_auth_start_prod_codes_avoid_dev_alphabet(client: AsyncClient, monkeypatch):
    """on prod, the second alpha char is never in {X, Z}; that's how the bot
    decides to route to the prod backend rather than dev."""
    from attu_tree.settings import settings
    monkeypatch.setattr(settings, 'environment', 'prod')
    for _ in range(50):
        r = await client.post('/api/auth/start')
        code = r.json()['code']
        assert code[1] not in 'XZ', f'prod code {code} leaked dev alphabet at char {code[1]!r}'


@pytest.mark.unit
async def test_redeem_accepts_various_input_forms(client: AsyncClient):
    """server normalises supplied codes - `AB-123456`, `ab123456`, etc. all work."""
    import json as _json
    from tests.conftest import hmac_headers

    r = await client.post('/api/auth/start')
    code = r.json()['code']
    # try the lowercased / dash-stripped form (what a sloppy bot might send)
    sloppy = code.lower().replace('-', '')
    body = _json.dumps({
        'code': sloppy, 'discord_id': '1', 'discord_username': 'x', 'roles': [],
    }).encode()
    r2 = await client.post(
        '/api/bot/auth/link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    assert r2.status_code == 200


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
    body = json.dumps({
        'code': code, 'discord_id': '111', 'discord_username': 'testuser', 'roles': [],
    }).encode()
    r2 = await client.post(
        '/api/bot/auth/link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    assert r2.status_code == 200
    assert r2.json()['display_name'] == 'testuser'

    # web polling now sees ok
    client.cookies.set('attu_session', session_cookie)
    r3 = await client.get('/api/auth/check')
    assert r3.json()['status'] == 'ok'


@pytest.mark.unit
async def test_bot_link_code_not_found(client: AsyncClient):
    body = json.dumps({
        'code': 'XXXXXX', 'discord_id': '111', 'discord_username': 'x', 'roles': [],
    }).encode()
    r = await client.post(
        '/api/bot/auth/link',
        content=body,
        headers={**hmac_headers(body), 'content-type': 'application/json'},
    )
    assert r.status_code == 422
    assert r.json()['detail'] == 'code_not_found'


@pytest.mark.unit
async def test_bot_link_code_already_used(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code = r.json()['code']

    payload = {'code': code, 'discord_id': '111', 'discord_username': 'x', 'roles': []}
    body = json.dumps(payload).encode()
    headers = {**hmac_headers(body), 'content-type': 'application/json'}

    await client.post('/api/bot/auth/link', content=body, headers=headers)
    # second attempt
    body2 = json.dumps(payload).encode()
    r2 = await client.post(
        '/api/bot/auth/link',
        content=body2,
        headers={**hmac_headers(body2), 'content-type': 'application/json'},
    )
    assert r2.status_code == 422
    assert r2.json()['detail'] == 'code_already_used'


@pytest.mark.unit
async def test_bot_link_hmac_mismatch(client: AsyncClient):
    r = await client.post('/api/auth/start')
    code = r.json()['code']
    body = json.dumps({'code': code, 'discord_id': '111', 'discord_username': 'x'}).encode()
    bad_headers = hmac_headers(body, secret='wrong-secret')
    r2 = await client.post(
        '/api/bot/auth/link',
        content=body,
        headers={**bad_headers, 'content-type': 'application/json'},
    )
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
    bad_headers = {
        'x-attu-timestamp': ts,
        'x-attu-signature': f'sha256={sig}',
        'content-type': 'application/json',
    }
    r2 = await client.post('/api/bot/auth/link', content=body, headers=bad_headers)
    assert r2.status_code == 401


@pytest.mark.unit
async def test_bot_link_hmac_implausible_timestamp(client: AsyncClient):
    """absurdly large timestamps are rejected as invalid, not silently let
    through into the skew comparison."""
    body = b'{}'
    ts = '99999999999999'  # past the clamp
    payload = f'{ts}.'.encode() + body
    sig = _hmac.new(TEST_HMAC_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    headers = {
        'x-attu-timestamp': ts,
        'x-attu-signature': f'sha256={sig}',
        'content-type': 'application/json',
    }
    r = await client.post('/api/bot/auth/link', content=body, headers=headers)
    assert r.status_code == 401


@pytest.mark.unit
async def test_me_returns_user(client: AsyncClient):
    await authed(client, '999', 'meeee')
    r = await client.get('/api/auth/me')
    assert r.status_code == 200
    me = r.json()
    assert me['discord_id'] == '999'
    assert me['discord_username'] == 'meeee'


@pytest.mark.unit
async def test_me_unauthenticated(client: AsyncClient):
    r = await client.get('/api/auth/me')
    assert r.status_code == 401


@pytest.mark.unit
async def test_logout_clears_session(client: AsyncClient):
    await authed(client, '777', 'logoutuser')
    await client.post('/api/auth/logout')
    client.cookies.delete('attu_session')

    r2 = await client.get('/api/auth/me')
    assert r2.status_code == 401


# ---------------------------------------------------------------------------
# bot-supplied roles
# ---------------------------------------------------------------------------

@pytest.mark.unit
async def test_default_role_is_user(client: AsyncClient):
    """no roles supplied (or empty list) → user is plain 'user'."""
    await authed(client, '1', 'first')
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'user'


@pytest.mark.unit
async def test_admin_role_from_bot(client: AsyncClient):
    """bot supplies roles=['admin'] → user is admin."""
    await authed(client, '1', 'boss', roles=['admin'])
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'


@pytest.mark.unit
async def test_unknown_roles_dropped(client: AsyncClient):
    """unknown role strings are silently ignored; falls back to 'user'."""
    await authed(client, '1', 'x', roles=['mod', 'wizard', 'verified'])
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'user'


@pytest.mark.unit
async def test_admin_among_unknown_still_admin(client: AsyncClient):
    """an admin alongside unknown roles still resolves to admin."""
    await authed(client, '1', 'x', roles=['mod', 'admin', 'wizard'])
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'


@pytest.mark.unit
async def test_role_demotion_on_relink(client: AsyncClient):
    """a user whose discord roles change on the bot side gets demoted on
    next re-link (no admin ui needed for role mutation)."""
    cookie = await authed(client, '1', 'x', roles=['admin'])
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'admin'

    # bot re-links the same discord user without the admin role
    client.cookies.delete('attu_session')
    await authed(client, '1', 'x', roles=[])

    # original session is still bound to the user; check via /me
    me2 = (await client.get('/api/auth/me')).json()
    assert me2['role'] == 'user'

    # the originally-issued cookie also reflects the demotion (same user_id)
    client.cookies.set('attu_session', cookie)
    me3 = (await client.get('/api/auth/me')).json()
    assert me3['role'] == 'user'


@pytest.mark.unit
async def test_role_promotion_on_relink(client: AsyncClient):
    """a user gaining the admin role on discord becomes admin on re-link."""
    await authed(client, '1', 'x', roles=[])
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'user'

    client.cookies.delete('attu_session')
    await authed(client, '1', 'x', roles=['admin'])
    me2 = (await client.get('/api/auth/me')).json()
    assert me2['role'] == 'admin'


@pytest.mark.unit
async def test_no_admin_election_on_first_user(client: AsyncClient):
    """unlike the previous bootstrap behaviour, the first user is not
    auto-promoted; if no one logs in with the admin role, the system has
    no admins at all."""
    await authed(client, '1', 'first')  # roles=[]
    me = (await client.get('/api/auth/me')).json()
    assert me['role'] == 'user'

    # admin endpoints are inaccessible
    r = await client.get('/api/admin/users')
    assert r.status_code == 403


@pytest.mark.unit
async def test_concurrent_redeem_only_one_wins(client: AsyncClient):
    """two concurrent bot calls with the same code: one succeeds, the other
    sees `code_already_used`. validates the BEGIN IMMEDIATE wrapper."""
    r = await client.post('/api/auth/start')
    code = r.json()['code']

    body_a = json.dumps({
        'code': code, 'discord_id': '1', 'discord_username': 'a', 'roles': [],
    }).encode()
    body_b = json.dumps({
        'code': code, 'discord_id': '2', 'discord_username': 'b', 'roles': [],
    }).encode()

    async def _post(body: bytes):
        return await client.post(
            '/api/bot/auth/link',
            content=body,
            headers={**hmac_headers(body), 'content-type': 'application/json'},
        )

    r1, r2 = await asyncio.gather(_post(body_a), _post(body_b))
    statuses = sorted((r1.status_code, r2.status_code))
    # one 200, one 422 (code_already_used)
    assert statuses == [200, 422]
    losing = r1 if r1.status_code == 422 else r2
    assert losing.json()['detail'] == 'code_already_used'
