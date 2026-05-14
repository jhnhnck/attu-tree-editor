"""admin endpoints: user management (admin role required)."""

from datetime import UTC
from typing import Annotated

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException

from attu_tree.auth.middleware import current_admin
from attu_tree.auth.session import delete_user_sessions
from attu_tree.db import get_db
from attu_tree.models import AdminUserListing, AdminUserListResponse, AdminUserUpdateRequest


router = APIRouter(prefix='/api/admin', tags=['admin'])


@router.get('/users', response_model=AdminUserListResponse)
async def list_users(
    _: Annotated[aiosqlite.Row, Depends(current_admin)],
    conn: aiosqlite.Connection = Depends(get_db),
    page: int = 1,
    per_page: int = 50,
) -> AdminUserListResponse:
    offset = (max(page, 1) - 1) * per_page
    rows = await (
        await conn.execute(
            'SELECT id, discord_id, discord_username, display_name, role, created_at, deleted_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
            (per_page, offset),
        )
    ).fetchall()
    total = (await (await conn.execute('SELECT COUNT(*) FROM users')).fetchone())[0]
    users = [
        AdminUserListing(
            id=r['id'],
            discord_id=r['discord_id'],
            discord_username=r['discord_username'],
            display_name=r['display_name'],
            role=r['role'],
            created_at=r['created_at'],
            deleted_at=r['deleted_at'],
        )
        for r in rows
    ]
    return AdminUserListResponse(users=users, total=total)


@router.put('/users/{user_id}', response_model=AdminUserListing)
async def update_user(
    user_id: str,
    body: AdminUserUpdateRequest,
    _: Annotated[aiosqlite.Row, Depends(current_admin)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> AdminUserListing:
    """admin can rename a user's display_name. role mutation lives on the
    discord side and is mirrored into our users table on every link redemption,
    so it's not exposed here."""
    row = await (
        await conn.execute(
            'SELECT id, discord_id, discord_username, display_name, role, created_at, deleted_at FROM users WHERE id = ?',
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='user not found')

    if body.display_name is not None:
        await conn.execute(
            'UPDATE users SET display_name = ? WHERE id = ?',
            (body.display_name, user_id),
        )
        await conn.commit()
        row = await (
            await conn.execute(
                'SELECT id, discord_id, discord_username, display_name, role, created_at, deleted_at FROM users WHERE id = ?',
                (user_id,),
            )
        ).fetchone()

    return AdminUserListing(
        id=row['id'],
        discord_id=row['discord_id'],
        discord_username=row['discord_username'],
        display_name=row['display_name'],
        role=row['role'],
        created_at=row['created_at'],
        deleted_at=row['deleted_at'],
    )


@router.delete('/users/{user_id}', status_code=204)
async def delete_user(
    user_id: str,
    admin: Annotated[aiosqlite.Row, Depends(current_admin)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> None:
    if user_id == admin['id']:
        raise HTTPException(status_code=400, detail='cannot delete yourself')
    row = await (await conn.execute('SELECT id FROM users WHERE id = ?', (user_id,))).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='user not found')
    from datetime import datetime

    now = datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    await conn.execute('UPDATE users SET deleted_at = ? WHERE id = ?', (now, user_id))
    await conn.commit()
    await delete_user_sessions(conn, user_id)
