"""auth endpoints: start link code, poll check, logout, me."""

import logging
from typing import Annotated

import aiosqlite
from fastapi import APIRouter, Cookie, Depends, Response

from attu_tree.auth.link import check_link, start_link
from attu_tree.auth.middleware import current_user
from attu_tree.db import get_db
from attu_tree.models import LinkCheckResponse, LinkStartResponse, MeResponse
from attu_tree.ratelimit import auth_start_limiter
from attu_tree.settings import settings


log = logging.getLogger(__name__)
router = APIRouter(prefix='/api/auth', tags=['auth'])


@router.post('/start', response_model=LinkStartResponse)
async def auth_start(
    response: Response,
    _rl: None = Depends(auth_start_limiter.dependency()),
    conn: aiosqlite.Connection = Depends(get_db),
) -> LinkStartResponse:
    """generate a fresh link code. pre-issues a session cookie (still pending)."""
    code, session_token, expires_at = await start_link(conn)
    _set_cookie(response, session_token)
    return LinkStartResponse(code=code, expires_at=expires_at)


@router.get('/check', response_model=LinkCheckResponse)
async def auth_check(
    attu_session: Annotated[str | None, Cookie()] = None,
    conn: aiosqlite.Connection = Depends(get_db),
) -> LinkCheckResponse:
    """web client polls every 2s after /start. returns ok once the bot redeemed the code.

    the session cookie is pre-issued by /start; when the bot calls /api/bot/auth/link,
    the session row is created and the code is marked consumed. this endpoint checks
    link_codes by session_token to detect that transition.
    """
    if not attu_session:
        return LinkCheckResponse(status='not_found')
    status = await check_link(conn, attu_session)
    return LinkCheckResponse(status=status)  # type: ignore[arg-type]


@router.post('/logout', status_code=204)
async def auth_logout(
    response: Response,
    conn: aiosqlite.Connection = Depends(get_db),
    attu_session: Annotated[str | None, Cookie()] = None,
) -> None:
    if attu_session:
        from attu_tree.auth.session import delete_session

        await delete_session(conn, attu_session)
    response.delete_cookie(
        key='attu_session',
        path=settings.session_cookie_path,
        httponly=True,
        secure=True,
        samesite='strict',
    )


@router.get('/me', response_model=MeResponse)
async def auth_me(
    user: Annotated[aiosqlite.Row, Depends(current_user)],
) -> MeResponse:
    return MeResponse(
        id=user['id'],
        discord_id=user['discord_id'],
        discord_username=user['discord_username'],
        display_name=user['display_name'],
        role=user['role'],
    )


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key='attu_session',
        value=token,
        httponly=True,
        secure=True,
        samesite='strict',
        path=settings.session_cookie_path,
        max_age=30 * 24 * 3600,
    )
