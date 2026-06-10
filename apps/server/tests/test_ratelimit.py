"""tests for the in-memory sliding-window rate limiter."""

import time

import pytest
from httpx import AsyncClient

from attu_tree.ratelimit import RateLimiter
from tests.conftest import authed


# ---------------------------------------------------------------------------
# unit tests for RateLimiter itself (no fastapi stack)
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_limiter_allows_up_to_max():
    lim = RateLimiter(max_requests=3, window_seconds=60)

    class _Req:
        client = type('C', (), {'host': '1.2.3.4'})()
        headers: dict = {}

    req = _Req()
    # first 3 are fine
    lim.check(req)
    lim.check(req)
    lim.check(req)


@pytest.mark.unit
async def test_limiter_blocks_on_max_plus_one():
    from fastapi import HTTPException

    lim = RateLimiter(max_requests=3, window_seconds=60)

    class _Req:
        client = type('C', (), {'host': '1.2.3.4'})()
        headers: dict = {}

    req = _Req()
    for _ in range(3):
        lim.check(req)
    with pytest.raises(HTTPException) as exc_info:
        lim.check(req)
    assert exc_info.value.status_code == 429


@pytest.mark.unit
async def test_limiter_resets_after_window(monkeypatch):
    """timestamps outside the window are evicted; counter resets."""
    lim = RateLimiter(max_requests=2, window_seconds=60)

    class _Req:
        client = type('C', (), {'host': '1.2.3.4'})()
        headers: dict = {}

    req = _Req()
    # travel back 70 seconds so old timestamps expire
    old_time = time.time() - 70
    lim._buckets['1.2.3.4'] = __import__('collections').deque([old_time, old_time])
    # now the bucket has 2 stale entries; after eviction both new calls should pass
    lim.check(req)
    lim.check(req)


@pytest.mark.unit
async def test_limiter_none_key_passes():
    """request with no client ip is let through without incrementing any counter."""
    lim = RateLimiter(max_requests=1, window_seconds=60)

    class _Req:
        client = None
        headers: dict = {}

    lim.check(_Req())
    lim.check(_Req())  # would 429 if key were tracked


@pytest.mark.unit
async def test_limiter_forwarded_for_used_as_key():
    """x-forwarded-for's leftmost address is used over client.host."""
    lim = RateLimiter(max_requests=1, window_seconds=60)

    class _Req:
        client = type('C', (), {'host': '10.0.0.1'})()
        headers = {'x-forwarded-for': '8.8.8.8, 10.0.0.1'}

    req = _Req()
    lim.check(req)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        lim.check(req)
    assert exc_info.value.status_code == 429
    # proxy ip alone is not yet tracked
    assert '10.0.0.1' not in lim._buckets


@pytest.mark.unit
async def test_limiter_clear_resets_state():
    from fastapi import HTTPException

    lim = RateLimiter(max_requests=1, window_seconds=60)

    class _Req:
        client = type('C', (), {'host': '1.2.3.4'})()
        headers: dict = {}

    req = _Req()
    lim.check(req)
    with pytest.raises(HTTPException):
        lim.check(req)
    lim.clear()
    lim.check(req)  # should pass after clear


# ---------------------------------------------------------------------------
# integration tests through the fastapi layer
#
# these tests re-enable real ip extraction by temporarily restoring the actual
# _client_ip key_fn on the singleton limiters (bypass_rate_limiters in conftest
# sets it to `lambda _req: None` for all other tests). we do this by calling
# monkeypatch on the fixture-provided monkeypatch — but fixtures can't be
# requested inside test functions directly; instead we pre-fill _buckets and
# restore the real key_fn at the test scope.
# ---------------------------------------------------------------------------


@pytest.mark.unit
async def test_auth_start_rate_limited_at_11th_request(client: AsyncClient, monkeypatch):
    """/api/auth/start rejects the 11th call from the same ip with 429."""
    import collections

    from attu_tree.ratelimit import _client_ip, auth_start_limiter

    # restore real key_fn (bypass_rate_limiters set it to None)
    monkeypatch.setattr(auth_start_limiter, '_key_fn', _client_ip)
    auth_start_limiter.clear()

    now = time.time()
    # pre-fill 9 timestamps so the 10th call is the last allowed
    auth_start_limiter._buckets['5.5.5.5'] = collections.deque([now - i * 0.1 for i in range(9)])

    r10 = await client.post('/api/auth/start', headers={'x-forwarded-for': '5.5.5.5'})
    assert r10.status_code == 200

    r11 = await client.post('/api/auth/start', headers={'x-forwarded-for': '5.5.5.5'})
    assert r11.status_code == 429


@pytest.mark.unit
async def test_tree_routes_rate_limited(client: AsyncClient, monkeypatch):
    """tree routes return 429 once the per-ip budget is exhausted."""
    import collections

    from attu_tree.ratelimit import _client_ip, tree_limiter

    await authed(client, '42', 'ratelimituser')

    # restore real key_fn
    monkeypatch.setattr(tree_limiter, '_key_fn', _client_ip)
    tree_limiter.clear()

    now = time.time()
    # pre-fill 59 timestamps so the 60th call is the last allowed
    tree_limiter._buckets['9.9.9.9'] = collections.deque([now - i * 0.1 for i in range(59)])

    r60 = await client.get('/api/trees', headers={'x-forwarded-for': '9.9.9.9'})
    assert r60.status_code == 200

    r61 = await client.get('/api/trees', headers={'x-forwarded-for': '9.9.9.9'})
    assert r61.status_code == 429


@pytest.mark.unit
async def test_different_ips_have_independent_buckets(client: AsyncClient, monkeypatch):
    """two ips each get their own quota; one hitting the limit doesn't affect the other."""
    import collections

    from attu_tree.ratelimit import _client_ip, auth_start_limiter

    monkeypatch.setattr(auth_start_limiter, '_key_fn', _client_ip)
    auth_start_limiter.clear()

    now = time.time()
    # saturate ip A
    auth_start_limiter._buckets['1.1.1.1'] = collections.deque([now - i * 0.1 for i in range(10)])

    # ip B is still under quota
    r_b = await client.post('/api/auth/start', headers={'x-forwarded-for': '2.2.2.2'})
    assert r_b.status_code == 200

    # ip A is blocked
    r_a = await client.post('/api/auth/start', headers={'x-forwarded-for': '1.1.1.1'})
    assert r_a.status_code == 429
