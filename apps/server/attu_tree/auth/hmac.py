"""HMAC verification for bot-to-server requests.

bots sign every request with:
  X-Attu-Timestamp: <unix-seconds-utc>
  X-Attu-Signature: sha256=<hex(hmac(secret, f"{timestamp}.{body}"))>

the server rejects requests whose timestamp is outside a ±300s window and
whose signature doesn't match, preventing replay attacks.
"""

import hashlib
import hmac
import logging
import time

from fastapi import Header, HTTPException, Request

from attu_tree.settings import settings


log = logging.getLogger(__name__)

_SKEW_SECONDS = 300
# clamp to a sane epoch range so a malformed-but-numeric timestamp can't
# push abs() into pathological values; year 2286 is plenty of headroom
_MAX_REASONABLE_TS = 10_000_000_000


def _sign(body: bytes, timestamp: str) -> str:
    payload = f'{timestamp}.'.encode() + body
    return hmac.new(settings.secrets.discord_bot_hmac_secret.encode(), payload, hashlib.sha256).hexdigest()


async def verify_bot_hmac(
    request: Request,
    x_attu_timestamp: str = Header(...),
    x_attu_signature: str = Header(...),
) -> None:
    """FastAPI dependency; raises 401 if the HMAC is invalid or stale."""
    if not settings.secrets.discord_bot_hmac_secret:
        log.warning('discord_bot_hmac_secret not set; rejecting bot request')
        raise HTTPException(status_code=401, detail='bot auth not configured')

    try:
        ts = int(x_attu_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail='invalid timestamp') from exc

    if ts < 0 or ts > _MAX_REASONABLE_TS:
        raise HTTPException(status_code=401, detail='invalid timestamp')

    if abs(time.time() - ts) > _SKEW_SECONDS:
        raise HTTPException(status_code=401, detail='timestamp outside skew window')

    body = await request.body()
    expected = f'sha256={_sign(body, x_attu_timestamp)}'
    if not hmac.compare_digest(expected, x_attu_signature):
        raise HTTPException(status_code=401, detail='signature mismatch')
