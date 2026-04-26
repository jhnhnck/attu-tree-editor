"""link code flow: web-initiated, bot-redeemed.

web calls start_link() → gets a 6-char code and pre-issued session token.
web polls check_link() every 2s until the bot redeems.
bot calls redeem_link() with discord user info + roles → code is consumed,
session bound to user, role mirrored from the bot-supplied roles list.

role authority is the discord side. unknown roles are silently dropped. if
no admin roles have been linked yet, the system simply has no admins; we do
not auto-promote anyone.
"""

import logging
import random
import uuid
from datetime import UTC, datetime, timedelta

import aiosqlite

from attu_tree.auth.session import new_token


log = logging.getLogger(__name__)

# ambiguity-stripped charset: no 0, O, I, 1, l
_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_CODE_LEN = 6
_CODE_TTL_MINUTES = 10
# keep at most this many recent revisions per tree
REVISION_CAP = 20

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


def _gen_code() -> str:
    return ''.join(random.choices(_CHARSET, k=_CODE_LEN))


async def start_link(conn: aiosqlite.Connection) -> tuple[str, str, str]:
    """create a fresh link code + pre-issued session token. returns (code, session_token, expires_at)."""
    code = _gen_code()
    token = new_token()
    expires_at = _expiry_iso()
    await conn.execute(
        'INSERT INTO link_codes(code, session_token, expires_at) VALUES (?, ?, ?)',
        (code, token, expires_at),
    )
    await conn.commit()
    return code, token, expires_at


async def check_link(conn: aiosqlite.Connection, session_token: str) -> str:
    """returns 'pending' or 'ok'. the web client polls this."""
    row = await (await conn.execute(
        """
        SELECT user_id, expires_at, consumed_at
        FROM link_codes
        WHERE session_token = ?
        """,
        (session_token,),
    )).fetchone()
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
    code_upper = code.upper()
    now = _now_iso()

    # step 1: read the code row so we can give a precise error and grab the
    # pre-issued session token. this is just for diagnostics + reading the
    # token; the actual consume-claim happens atomically below.
    row = await (await conn.execute(
        'SELECT session_token, expires_at, consumed_at FROM link_codes WHERE code = ?',
        (code_upper,),
    )).fetchone()
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
    user_row = await (await conn.execute(
        'SELECT id, display_name FROM users WHERE discord_id = ?',
        (discord_id,),
    )).fetchone()
    user_id = user_row['id']
    display_name = user_row['display_name']

    # step 3: atomically claim the code. rowcount=0 means a concurrent caller
    # consumed it between our step 1 read and now.
    cursor = await conn.execute(
        'UPDATE link_codes SET consumed_at = ?, user_id = ? WHERE code = ? AND consumed_at IS NULL',
        (now, user_id, code_upper),
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
