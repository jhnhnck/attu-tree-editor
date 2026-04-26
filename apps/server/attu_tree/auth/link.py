"""link code flow: web-initiated, bot-redeemed.

web calls start_link() → gets a 6-char code and pre-issued session token.
web polls check_link() every 2s until the bot redeems.
bot calls redeem_link() with discord user info → code is consumed, session bound to user.
"""

import logging
import random
import uuid
from datetime import UTC, datetime, timedelta

import aiosqlite

from attu_tree.auth.session import new_token
from attu_tree.settings import settings


log = logging.getLogger(__name__)

# ambiguity-stripped charset: no 0, O, I, 1, l
_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_CODE_LEN = 6
_CODE_TTL_MINUTES = 10
# keep at most this many recent revisions per tree
REVISION_CAP = 20


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
) -> str:
    """bot calls this. marks code consumed, upserts user, binds session. returns display_name."""
    row = await (await conn.execute(
        'SELECT code, session_token, expires_at, consumed_at FROM link_codes WHERE code = ?',
        (code.upper(),),
    )).fetchone()
    if row is None:
        raise LinkCodeError('code_not_found')
    if row['expires_at'] < _now_iso():
        raise LinkCodeError('code_expired')
    if row['consumed_at'] is not None:
        raise LinkCodeError('code_already_used')

    # find or create the user
    user_row = await (await conn.execute(
        'SELECT id, display_name, role FROM users WHERE discord_id = ?',
        (discord_id,),
    )).fetchone()

    no_admins = (await (await conn.execute("SELECT COUNT(*) FROM users WHERE role='admin'")).fetchone())[0] == 0
    is_bootstrap_admin = settings.initial_admin_discord_id and discord_id == settings.initial_admin_discord_id

    if user_row is None:
        user_id = str(uuid.uuid4())
        role = 'admin' if (is_bootstrap_admin or no_admins) else 'user'
        display_name = discord_username
        await conn.execute(
            'INSERT INTO users(id, discord_id, discord_username, display_name, role) VALUES (?,?,?,?,?)',
            (user_id, discord_id, discord_username, display_name, role),
        )
    else:
        user_id = user_row['id']
        display_name = user_row['display_name']
        role = user_row['role']
        # promote if bootstrap admin matches and they're not already admin
        if is_bootstrap_admin and role != 'admin':
            await conn.execute("UPDATE users SET role='admin' WHERE id=?", (user_id,))
        # refresh username
        await conn.execute('UPDATE users SET discord_username=? WHERE id=?', (discord_username, user_id))

    # bind the pre-issued session to the user and consume the code
    session_token = row['session_token']
    expires_at = _expiry_from_now_days(30)
    await conn.execute(
        'INSERT OR REPLACE INTO sessions(token, user_id, expires_at) VALUES (?,?,?)',
        (session_token, user_id, expires_at),
    )
    await conn.execute(
        'UPDATE link_codes SET consumed_at=?, user_id=? WHERE code=?',
        (_now_iso(), user_id, code.upper()),
    )
    await conn.commit()
    log.info('link code redeemed for discord_id=%s user_id=%s', discord_id, user_id)
    return display_name


def _expiry_from_now_days(days: int) -> str:
    dt = datetime.now(UTC) + timedelta(days=days)
    return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
