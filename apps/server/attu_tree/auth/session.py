"""session CRUD helpers."""

import secrets
from datetime import UTC, datetime, timedelta

import aiosqlite


_SESSION_DAYS = 30


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _expiry_iso(days: int = _SESSION_DAYS) -> str:
    dt = datetime.now(UTC) + timedelta(days=days)
    return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def new_token() -> str:
    return secrets.token_urlsafe(32)


async def create_session(conn: aiosqlite.Connection, user_id: str, token: str | None = None) -> str:
    tok = token or new_token()
    await conn.execute(
        'INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)',
        (tok, user_id, _expiry_iso()),
    )
    await conn.commit()
    return tok


async def resolve_session(conn: aiosqlite.Connection, token: str) -> aiosqlite.Row | None:
    """returns the user row (joined) if session is valid and not expired."""
    row = await (
        await conn.execute(
            """
        SELECT u.id, u.discord_id, u.discord_username, u.display_name, u.role, u.deleted_at,
               s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """,
            (token,),
        )
    ).fetchone()
    return row


async def delete_session(conn: aiosqlite.Connection, token: str) -> None:
    await conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
    await conn.commit()


async def delete_user_sessions(conn: aiosqlite.Connection, user_id: str) -> None:
    await conn.execute('DELETE FROM sessions WHERE user_id = ?', (user_id,))
    await conn.commit()
