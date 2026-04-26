"""bot-only endpoints, all guarded by HMAC verification."""

import os
import uuid

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException

from attu_tree.auth.hmac import verify_bot_hmac
from attu_tree.auth.link import LinkCodeError, redeem_link
from attu_tree.db import get_db
from attu_tree.models import (
    BotGrantRequest,
    BotLinkRequest,
    BotLinkResponse,
    BotRevokeRequest,
    BotViewLinkRequest,
    BotViewLinkResponse,
    GrantResponse,
    TreeListing,
    TreeListResponse,
)


router = APIRouter(prefix='/api/bot', tags=['bot'], dependencies=[Depends(verify_bot_hmac)])

_PUBLIC_BASE = os.getenv('ATTU_PUBLIC_BASE_URL', 'https://attuproject.org/trees')


@router.post('/auth/link', response_model=BotLinkResponse)
async def bot_link(
    body: BotLinkRequest,
    conn: aiosqlite.Connection = Depends(get_db),
) -> BotLinkResponse:
    try:
        display_name = await redeem_link(
            conn,
            body.code,
            body.discord_id,
            body.discord_username,
            roles=body.roles,
        )
    except LinkCodeError as exc:
        raise HTTPException(status_code=422, detail=exc.reason) from exc
    return BotLinkResponse(display_name=display_name)


@router.get('/users/{discord_id}/trees', response_model=TreeListResponse)
async def bot_user_trees(
    discord_id: str,
    conn: aiosqlite.Connection = Depends(get_db),
) -> TreeListResponse:
    user_row = await (await conn.execute(
        'SELECT id FROM users WHERE discord_id = ? AND deleted_at IS NULL', (discord_id,)
    )).fetchone()
    if user_row is None:
        raise HTTPException(status_code=404, detail='user_not_linked')

    uid = user_row['id']
    owned = await (await conn.execute(
        "SELECT id, name, revision, updated_at, 'owner' as role FROM trees WHERE owner_id = ?",
        (uid,),
    )).fetchall()
    shared = await (await conn.execute(
        """
        SELECT t.id, t.name, t.revision, t.updated_at, g.role
        FROM tree_grants g JOIN trees t ON t.id = g.tree_id
        WHERE g.user_id = ?
        """,
        (uid,),
    )).fetchall()
    return TreeListResponse(trees=[
        TreeListing(id=r['id'], name=r['name'], role=r['role'], revision=r['revision'], updated_at=r['updated_at'])
        for r in (*owned, *shared)
    ])


@router.post('/trees/{tree_id}/grants', response_model=GrantResponse, status_code=201)
async def bot_add_grant(
    tree_id: str,
    body: BotGrantRequest,
    conn: aiosqlite.Connection = Depends(get_db),
) -> GrantResponse:
    # verify actor owns the tree (or is admin)
    actor_row = await (await conn.execute(
        'SELECT id, role FROM users WHERE discord_id = ? AND deleted_at IS NULL',
        (body.actor_discord_id,),
    )).fetchone()
    if actor_row is None:
        raise HTTPException(status_code=403, detail='actor not found')

    tree_row = await (await conn.execute('SELECT owner_id FROM trees WHERE id = ?', (tree_id,))).fetchone()
    if tree_row is None:
        raise HTTPException(status_code=404, detail='tree_not_found')

    if actor_row['id'] != tree_row['owner_id'] and actor_row['role'] != 'admin':
        raise HTTPException(status_code=403, detail='not_owner')

    # find or stub-create target
    target_row = await (await conn.execute(
        'SELECT id FROM users WHERE discord_id = ?', (body.target_discord_id,)
    )).fetchone()
    if target_row is None:
        target_id = str(uuid.uuid4())
        await conn.execute(
            'INSERT INTO users(id, discord_id, discord_username, display_name) VALUES (?,?,?,?)',
            (target_id, body.target_discord_id, body.target_discord_username, body.target_discord_username),
        )
    else:
        target_id = target_row['id']

    if target_id == tree_row['owner_id']:
        raise HTTPException(status_code=400, detail='cannot grant access to tree owner')

    await conn.execute(
        'INSERT OR REPLACE INTO tree_grants(tree_id, user_id, role) VALUES (?,?,?)',
        (tree_id, target_id, body.role),
    )
    await conn.commit()
    return GrantResponse(user_id=target_id, role=body.role)


@router.delete('/trees/{tree_id}/grants', status_code=204)
async def bot_revoke_grant(
    tree_id: str,
    body: BotRevokeRequest,
    conn: aiosqlite.Connection = Depends(get_db),
) -> None:
    actor_row = await (await conn.execute(
        'SELECT id, role FROM users WHERE discord_id = ? AND deleted_at IS NULL',
        (body.actor_discord_id,),
    )).fetchone()
    if actor_row is None:
        raise HTTPException(status_code=403, detail='actor not found')

    tree_row = await (await conn.execute('SELECT owner_id FROM trees WHERE id = ?', (tree_id,))).fetchone()
    if tree_row is None:
        raise HTTPException(status_code=404, detail='tree_not_found')

    if actor_row['id'] != tree_row['owner_id'] and actor_row['role'] != 'admin':
        raise HTTPException(status_code=403, detail='not_owner')

    target_row = await (await conn.execute(
        'SELECT id FROM users WHERE discord_id = ?', (body.target_discord_id,)
    )).fetchone()
    if target_row is None:
        return  # nothing to revoke

    await conn.execute(
        'DELETE FROM tree_grants WHERE tree_id = ? AND user_id = ?',
        (tree_id, target_row['id']),
    )
    await conn.commit()


@router.post('/trees/{tree_id}/view-link', response_model=BotViewLinkResponse)
async def bot_view_link(
    tree_id: str,
    body: BotViewLinkRequest,
    conn: aiosqlite.Connection = Depends(get_db),
) -> BotViewLinkResponse:
    actor_row = await (await conn.execute(
        'SELECT id, role FROM users WHERE discord_id = ? AND deleted_at IS NULL',
        (body.actor_discord_id,),
    )).fetchone()
    if actor_row is None:
        raise HTTPException(status_code=403, detail='actor not found')

    tree_row = await (await conn.execute('SELECT owner_id FROM trees WHERE id = ?', (tree_id,))).fetchone()
    if tree_row is None:
        raise HTTPException(status_code=404, detail='tree_not_found')

    uid = actor_row['id']
    has_access = (
        uid == tree_row['owner_id']
        or actor_row['role'] == 'admin'
        or await (await conn.execute(
            'SELECT 1 FROM tree_grants WHERE tree_id = ? AND user_id = ?', (tree_id, uid)
        )).fetchone() is not None
    )
    if not has_access:
        raise HTTPException(status_code=403, detail='no_access')

    return BotViewLinkResponse(url=f'{_PUBLIC_BASE}/view/{tree_id}')
