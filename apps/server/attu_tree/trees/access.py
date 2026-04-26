"""per-tree access helpers wired as FastAPI dependencies."""

from typing import Annotated

import aiosqlite
from fastapi import Depends, HTTPException

from attu_tree.auth.middleware import current_user
from attu_tree.db import get_db


async def _fetch_tree(tree_id: str, conn: aiosqlite.Connection) -> aiosqlite.Row:
    row = await (await conn.execute('SELECT * FROM trees WHERE id = ?', (tree_id,))).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='tree not found')
    return row


async def _get_grant_role(
    tree_id: str,
    user_id: str,
    owner_id: str,
    conn: aiosqlite.Connection,
) -> str | None:
    """returns 'owner', 'editor', 'viewer', or None if no access."""
    if user_id == owner_id:
        return 'owner'
    row = await (await conn.execute(
        'SELECT role FROM tree_grants WHERE tree_id = ? AND user_id = ?',
        (tree_id, user_id),
    )).fetchone()
    return row['role'] if row else None


def make_tree_access(require_write: bool = False, require_owner: bool = False):
    """returns a FastAPI dependency factory for tree access checks."""
    async def _dep(
        tree_id: str,
        user: Annotated[aiosqlite.Row, Depends(current_user)],
        conn: aiosqlite.Connection = Depends(get_db),
    ) -> tuple[aiosqlite.Row, str]:
        tree = await _fetch_tree(tree_id, conn)
        # admins bypass all per-tree checks
        if user['role'] == 'admin':
            role = 'owner' if tree['owner_id'] == user['id'] else 'editor'
            return tree, role
        role = await _get_grant_role(tree_id, user['id'], tree['owner_id'], conn)
        if role is None:
            raise HTTPException(status_code=403, detail='no access')
        if require_owner and role != 'owner':
            raise HTTPException(status_code=403, detail='owner only')
        if require_write and role == 'viewer':
            raise HTTPException(status_code=403, detail='read-only access')
        return tree, role
    return _dep


tree_read = make_tree_access(require_write=False)
tree_write = make_tree_access(require_write=True)
tree_owner = make_tree_access(require_owner=True)
