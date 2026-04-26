"""FastAPI dependencies for the current authenticated user."""

from typing import Annotated

import aiosqlite
from fastapi import Cookie, Depends, HTTPException

from attu_tree.auth.session import resolve_session
from attu_tree.db import get_db


async def _get_user(
    attu_session: Annotated[str | None, Cookie()] = None,
    conn: aiosqlite.Connection = Depends(get_db),
) -> aiosqlite.Row | None:
    if not attu_session:
        return None
    return await resolve_session(conn, attu_session)


async def current_user(
    user: Annotated[aiosqlite.Row | None, Depends(_get_user)],
) -> aiosqlite.Row:
    if user is None or user['deleted_at'] is not None:
        raise HTTPException(status_code=401, detail='not authenticated')
    return user


async def optional_user(
    user: Annotated[aiosqlite.Row | None, Depends(_get_user)],
) -> aiosqlite.Row | None:
    if user is not None and user['deleted_at'] is not None:
        return None
    return user


async def current_admin(
    user: Annotated[aiosqlite.Row, Depends(current_user)],
) -> aiosqlite.Row:
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail='admin only')
    return user
