"""trees crud + share grants (cookie-authenticated)."""

import json
import uuid
from datetime import UTC, datetime
from typing import Annotated

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response

from attu_tree.auth.middleware import current_user
from attu_tree.db import get_db
from attu_tree.models import (
    GrantListing,
    GrantListResponse,
    GrantRequest,
    GrantResponse,
    TreeConflictResponse,
    TreeCreateRequest,
    TreeCreateResponse,
    TreeListing,
    TreeListResponse,
    TreeResponse,
    TreeSaveRequest,
    TreeSaveResponse,
)
from attu_tree.ratelimit import tree_limiter
from attu_tree.settings import settings
from attu_tree.sync.autosave import BlobTooLarge, RevisionConflict, apply_save
from attu_tree.trees.access import tree_owner, tree_read, tree_write


router = APIRouter(prefix='/api/trees', tags=['trees'], dependencies=[Depends(tree_limiter.dependency())])


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _serialize_blob(blob: object) -> str:
    """json-encode a blob and reject if it exceeds the configured cap.

    enforces the size limit at the boundary so a malformed-or-malicious payload
    can't bloat the trees / tree_revisions tables. raises 413.
    """
    s = json.dumps(blob)
    if len(s.encode('utf-8')) > settings.server.max_tree_blob_bytes:
        raise HTTPException(
            status_code=413,
            detail=f'tree blob exceeds maximum size of {settings.server.max_tree_blob_bytes} bytes',
        )
    return s


@router.get('', response_model=TreeListResponse)
async def list_trees(
    user: Annotated[aiosqlite.Row, Depends(current_user)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> TreeListResponse:
    owned = await (
        await conn.execute(
            "SELECT id, name, revision, updated_at, 'owner' as role FROM trees WHERE owner_id = ?",
            (user['id'],),
        )
    ).fetchall()
    shared = await (
        await conn.execute(
            """
        SELECT t.id, t.name, t.revision, t.updated_at, g.role
        FROM tree_grants g JOIN trees t ON t.id = g.tree_id
        WHERE g.user_id = ?
        """,
            (user['id'],),
        )
    ).fetchall()
    trees = [TreeListing(id=r['id'], name=r['name'], role=r['role'], revision=r['revision'], updated_at=r['updated_at']) for r in (*owned, *shared)]
    return TreeListResponse(trees=trees)


@router.post('', response_model=TreeCreateResponse, status_code=201)
async def create_tree(
    body: TreeCreateRequest,
    user: Annotated[aiosqlite.Row, Depends(current_user)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> TreeCreateResponse:
    tree_id = str(uuid.uuid4())
    blob_str = _serialize_blob(body.blob)
    await conn.execute(
        'INSERT INTO trees(id, owner_id, name, schema_version, blob, revision, updated_at) VALUES (?,?,?,?,?,1,?)',
        (tree_id, user['id'], body.name, body.schema_version, blob_str, _now_iso()),
    )
    await conn.commit()
    return TreeCreateResponse(id=tree_id, revision=1)


@router.get('/{tree_id}', response_model=TreeResponse)
async def get_tree(
    tree_and_role: Annotated[tuple, Depends(tree_read)],
) -> TreeResponse:
    tree, role = tree_and_role
    return TreeResponse(
        id=tree['id'],
        name=tree['name'],
        owner_id=tree['owner_id'],
        schema_version=tree['schema_version'],
        blob=json.loads(tree['blob']),
        revision=tree['revision'],
        updated_at=tree['updated_at'],
        role=role,
    )


@router.put('/{tree_id}', response_model=TreeSaveResponse, responses={409: {'model': TreeConflictResponse}})
async def save_tree(
    body: TreeSaveRequest,
    tree_and_role: Annotated[tuple, Depends(tree_write)],
    user: Annotated[aiosqlite.Row, Depends(current_user)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> TreeSaveResponse | Response:
    tree, _ = tree_and_role
    try:
        new_rev, updated_at = await apply_save(
            conn=conn,
            tree_id=tree['id'],
            user_id=user['id'],
            blob=body.blob,
            expected_revision=body.expected_revision,
            name=body.name,
            schema_version=body.schema_version,
        )
        return TreeSaveResponse(revision=new_rev, updated_at=updated_at)
    except BlobTooLarge as exc:
        raise HTTPException(
            status_code=413,
            detail=f'tree blob exceeds maximum size of {exc.limit} bytes',
        ) from exc
    except RevisionConflict as exc:
        return Response(
            content=TreeConflictResponse(
                server_revision=exc.server_revision,
                server_blob=exc.server_blob,
                server_updated_at=exc.server_updated_at,
            ).model_dump_json(),
            status_code=409,
            media_type='application/json',
        )


@router.delete('/{tree_id}', status_code=204)
async def delete_tree(
    tree_and_role: Annotated[tuple, Depends(tree_owner)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> None:
    tree, _ = tree_and_role
    await conn.execute('DELETE FROM tree_grants WHERE tree_id = ?', (tree['id'],))
    await conn.execute('DELETE FROM tree_revisions WHERE tree_id = ?', (tree['id'],))
    await conn.execute('DELETE FROM trees WHERE id = ?', (tree['id'],))
    await conn.commit()


@router.get('/{tree_id}/grants', response_model=GrantListResponse)
async def list_grants(
    tree_and_role: Annotated[tuple, Depends(tree_owner)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> GrantListResponse:
    tree, _ = tree_and_role
    rows = await (
        await conn.execute(
            """
        SELECT u.id as user_id, u.discord_id, u.display_name, g.role
        FROM tree_grants g JOIN users u ON u.id = g.user_id
        WHERE g.tree_id = ?
        ORDER BY u.display_name
        """,
            (tree['id'],),
        )
    ).fetchall()
    return GrantListResponse(
        grants=[
            GrantListing(
                user_id=r['user_id'],
                discord_id=r['discord_id'],
                display_name=r['display_name'],
                role=r['role'],
            )
            for r in rows
        ]
    )


@router.post('/{tree_id}/grants', response_model=GrantResponse, status_code=201)
async def add_grant(
    body: GrantRequest,
    tree_and_role: Annotated[tuple, Depends(tree_owner)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> GrantResponse:
    tree, _ = tree_and_role
    # resolve or stub-create the target user
    user_row = await (await conn.execute('SELECT id FROM users WHERE discord_id = ?', (body.discord_id,))).fetchone()
    if user_row is None:
        # stub user: known discord id, not yet linked
        target_id = str(uuid.uuid4())
        await conn.execute(
            'INSERT INTO users(id, discord_id, discord_username, display_name) VALUES (?,?,?,?)',
            (target_id, body.discord_id, body.discord_id, body.discord_id),
        )
    else:
        target_id = user_row['id']

    # don't grant the owner their own tree
    if target_id == tree['owner_id']:
        raise HTTPException(status_code=400, detail='cannot grant access to the tree owner')

    await conn.execute(
        'INSERT OR REPLACE INTO tree_grants(tree_id, user_id, role) VALUES (?,?,?)',
        (tree['id'], target_id, body.role),
    )
    await conn.commit()
    return GrantResponse(user_id=target_id, role=body.role)


@router.delete('/{tree_id}/grants/{user_id}', status_code=204)
async def revoke_grant(
    user_id: str,
    tree_and_role: Annotated[tuple, Depends(tree_owner)],
    conn: aiosqlite.Connection = Depends(get_db),
) -> None:
    tree, _ = tree_and_role
    await conn.execute(
        'DELETE FROM tree_grants WHERE tree_id = ? AND user_id = ?',
        (tree['id'], user_id),
    )
    await conn.commit()
