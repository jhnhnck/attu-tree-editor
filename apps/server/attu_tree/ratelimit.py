"""minimal in-memory sliding-window rate limiter — no external deps.

each limiter instance tracks per-key request timestamps in a plain dict.
timestamps older than the window are dropped on each check so the dict
doesn't grow unboundedly for idle keys.

usage (fastapi dependency injection):

    from attu_tree.ratelimit import auth_start_limiter, tree_limiter

    @router.post('/start')
    async def auth_start(
        _: None = Depends(auth_start_limiter.dependency()),
        ...
    ) -> ...:
"""

import time
from collections import deque
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request


class RateLimiter:
    """sliding-window in-memory rate limiter.

    args:
        max_requests: how many calls are allowed in the window
        window_seconds: the rolling window size in seconds
        key_fn: extracts the bucket key from a request-like object; defaults to
                client ip. replacing this in tests allows bypassing limits.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        key_fn: Callable[[Any], str | None] | None = None,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._key_fn: Callable[[Any], str | None] = key_fn or _client_ip
        # {key: deque of timestamps}
        self._buckets: dict[str, deque[float]] = {}

    def clear(self) -> None:
        """drop all recorded timestamps — used by tests to reset state."""
        self._buckets.clear()

    def check(self, request: Any) -> None:
        """raise 429 if this request exceeds the per-ip limit.

        a None key (e.g. missing ip in tests) is allowed through without
        counting — callers that want strict test coverage should set a known
        key_fn.
        """
        key = self._key_fn(request)
        if key is None:
            return
        now = time.time()
        cutoff = now - self.window_seconds
        bucket = self._buckets.setdefault(key, deque())
        # evict expired timestamps
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            raise HTTPException(status_code=429, detail='rate limit exceeded')
        bucket.append(now)

    def dependency(self) -> Callable:
        """return a fastapi dependency callable that enforces this limiter."""

        async def _dep(request: Request) -> None:
            self.check(request)

        return _dep


def _client_ip(request: Request) -> str | None:
    """extract the best-effort client ip from the request.

    prefers the leftmost address in x-forwarded-for (set by a reverse proxy)
    so the limit applies to the real client, not the proxy ip.
    """
    forwarded_for = request.headers.get('x-forwarded-for')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    if request.client:
        return request.client.host
    return None


# module-level singleton limiters — imported by routers
auth_start_limiter = RateLimiter(max_requests=10, window_seconds=60)
tree_limiter = RateLimiter(max_requests=60, window_seconds=60)
