"""link code flow: web-initiated, bot-redeemed.

web calls start_link() → gets an `AB-123456`-shaped code and pre-issued session token.
web polls check_link() every 2s until the bot redeems.
bot calls redeem_link() with discord user info + roles → code is consumed,
session bound to user, role mirrored from the bot-supplied roles list.

role authority is the discord side. unknown roles are silently dropped. if
no admin roles have been linked yet, the system simply has no admins; we do
not auto-promote anyone.
"""

import logging
import random
import re
import uuid
from datetime import UTC, datetime, timedelta

import aiosqlite

from attu_tree.auth.session import new_token
from attu_tree.settings import settings


log = logging.getLogger(__name__)

# code shape: `AB-123456` (display) / `AB123456` (storage).
# - char[0]: any of the 24 ambiguity-stripped letters (no I, no O)
# - char[1]: env discriminator. dev uses {X, Z}; prod uses the other 22.
#   one bot instance can route `/trees link` to the right backend just by
#   inspecting char[1] of the user-supplied code.
# - dash separator (display only; stripped on storage and input)
# - 6 digits (full 0-9; intra-segment ambiguity isn't a concern with the
#   alpha/digit split made obvious by the dash)
#
# search space: prod = 24 * 22 * 10^6 ≈ 528M codes; dev = 24 * 2 * 10^6 ≈ 48M.
# both comfortably above brute-force-in-10-min territory once /api/auth/start
# rate limiting (separate to-do) is in place.
_ALPHA_FIRST = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
_ALPHA_DEV = 'XZ'
_ALPHA_PROD = ''.join(c for c in _ALPHA_FIRST if c not in _ALPHA_DEV)
_DIGITS = '0123456789'
_DIGIT_LEN = 6
_CODE_TTL_MINUTES = 10
# keep at most this many recent revisions per tree
REVISION_CAP = 20

_NON_ALNUM = re.compile(r'[^A-Z0-9]')


def _alpha_for_env() -> str:
    return _ALPHA_DEV if settings.app.environment == 'dev' else _ALPHA_PROD


def _gen_code() -> str:
    """generate a fresh code in the storage form (no dash, uppercase)."""
    first = random.choice(_ALPHA_FIRST)
    second = random.choice(_alpha_for_env())
    digits = ''.join(random.choices(_DIGITS, k=_DIGIT_LEN))
    return f'{first}{second}{digits}'


def format_code(stored: str) -> str:
    """user-facing form: `AB-123456`."""
    if len(stored) < 2:
        return stored
    return f'{stored[:2]}-{stored[2:]}'


def normalize_code(supplied: str) -> str:
    """server- and bot-facing normalisation: strip non-alphanumeric and
    uppercase. accepts `AB-123456`, `ab-123456`, `AB123456`, `ab 123456`,
    etc. matches the storage form so callers can pass straight to the db."""
    return _NON_ALNUM.sub('', supplied.upper())


# roles the server understands; anything else from the bot is dropped.
# precedence is by list order: first match wins when multiple known roles are
# supplied (e.g. ['admin', 'user'] resolves to 'admin').
_KNOWN_ROLES: tuple[str, ...] = ('admin', 'user')


def resolve_role(roles: list[str]) -> str:
    """pick the highest-precedence role we recognise; default to 'user'."""
    s = {r for r in roles if isinstance(r, str)}
    for known in _KNOWN_ROLES:
        if known in s:
            return known
    return 'user'


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _expiry_iso(minutes: int = _CODE_TTL_MINUTES) -> str:
    dt = datetime.now(UTC) + timedelta(minutes=minutes)
    return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


async def start_link(conn: aiosqlite.Connection) -> tuple[str, str, str]:
    """create a fresh link code + pre-issued session token.

    returns (display_code, session_token, expires_at). the storage form (no
    dash) is what lands in the db; the display form (`AB-123456`) is what we
    hand back to the spa, which renders it to the user.
    """
    stored = _gen_code()
    token = new_token()
    expires_at = _expiry_iso()
    await conn.execute(
        'INSERT INTO link_codes(code, session_token, expires_at) VALUES (?, ?, ?)',
        (stored, token, expires_at),
    )
    await conn.commit()
    return format_code(stored), token, expires_at


async def check_link(conn: aiosqlite.Connection, session_token: str) -> str:
    """returns 'pending' or 'ok'. the web client polls this."""
    row = await (
        await conn.execute(
            """
        SELECT user_id, expires_at, consumed_at
        FROM link_codes
        WHERE session_token = ?
        """,
            (session_token,),
        )
    ).fetchone()
    if row is None:
        return 'not_found'
    if row['expires_at'] < _now_iso():
        return 'expired'
    if row['consumed_at'] is not None:
        return 'ok'
    return 'pending'


class LinkCodeError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


async def redeem_link(
    conn: aiosqlite.Connection,
    code: str,
    discord_id: str,
    discord_username: str,
    roles: list[str] | None = None,
) -> str:
    """bot calls this. marks code consumed, upserts user, binds session.

    atomicity comes from the `UPDATE ... WHERE consumed_at IS NULL` pattern:
    two concurrent calls can't both win because sqlite serialises writes and
    the loser sees rowcount=0. role is resolved from the supplied list on
    every link, so a user demoted on discord loses admin the next time they
    re-link.
    """
    role = resolve_role(roles or [])
    # accept the code in any of the user-typeable forms; the db stores the
    # dashless uppercase canonical form
    code_norm = normalize_code(code)
    now = _now_iso()

    # step 1: read the code row so we can give a precise error and grab the
    # pre-issued session token. this is just for diagnostics + reading the
    # token; the actual consume-claim happens atomically below.
    row = await (
        await conn.execute(
            'SELECT session_token, expires_at, consumed_at FROM link_codes WHERE code = ?',
            (code_norm,),
        )
    ).fetchone()
    if row is None:
        raise LinkCodeError('code_not_found')
    if row['expires_at'] < now:
        raise LinkCodeError('code_expired')
    if row['consumed_at'] is not None:
        raise LinkCodeError('code_already_used')

    # step 2: upsert the user. atomic via UNIQUE(discord_id) + ON CONFLICT;
    # the candidate id we'd assign for a new row is discarded if a concurrent
    # call beat us with the same discord_id.
    candidate_id = str(uuid.uuid4())
    await conn.execute(
        """
        INSERT INTO users(id, discord_id, discord_username, display_name, role)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET
            discord_username = excluded.discord_username,
            role = excluded.role
        """,
        (candidate_id, discord_id, discord_username, discord_username, role),
    )
    user_row = await (
        await conn.execute(
            'SELECT id, display_name FROM users WHERE discord_id = ?',
            (discord_id,),
        )
    ).fetchone()
    user_id = user_row['id']
    display_name = user_row['display_name']

    # step 3: atomically claim the code. rowcount=0 means a concurrent caller
    # consumed it between our step 1 read and now.
    cursor = await conn.execute(
        'UPDATE link_codes SET consumed_at = ?, user_id = ? WHERE code = ? AND consumed_at IS NULL',
        (now, user_id, code_norm),
    )
    if cursor.rowcount == 0:
        # commit the upsert (user is now persisted) but signal the loss
        await conn.commit()
        raise LinkCodeError('code_already_used')

    # step 4: bind the pre-issued session to the user
    await conn.execute(
        'INSERT OR REPLACE INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)',
        (row['session_token'], user_id, _expiry_from_now_days(30)),
    )
    await conn.commit()
    log.info('link code redeemed for discord_id=%s user_id=%s role=%s', discord_id, user_id, role)
    return display_name


def _expiry_from_now_days(days: int) -> str:
    dt = datetime.now(UTC) + timedelta(days=days)
    return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
