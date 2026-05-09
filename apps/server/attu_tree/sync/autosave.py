"""revision-checked autosave (last-writer-wins first cut).

PUT /api/trees/{id}:
  - client sends {blob, expected_revision, name?, schema_version?}
  - server compares expected_revision to current; equal → advance + write → 200
  - not equal → 409 with {server_revision, server_blob, server_updated_at}
"""

import json
from datetime import UTC, datetime

import aiosqlite

from attu_tree.auth.link import REVISION_CAP
from attu_tree.settings import settings


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


class RevisionConflict(Exception):
    def __init__(self, server_revision: int, server_blob: object, server_updated_at: str) -> None:
        super().__init__('revision conflict')
        self.server_revision = server_revision
        self.server_blob = server_blob
        self.server_updated_at = server_updated_at


class BlobTooLarge(Exception):
    """raised when a save payload exceeds settings.server.max_tree_blob_bytes."""

    def __init__(self, size: int, limit: int) -> None:
        super().__init__(f'blob size {size} exceeds limit {limit}')
        self.size = size
        self.limit = limit


async def apply_save(
    conn: aiosqlite.Connection,
    tree_id: str,
    user_id: str,
    blob: object,
    expected_revision: int,
    name: str | None = None,
    schema_version: int | None = None,
) -> tuple[int, str]:
    """save and return (new_revision, updated_at). raises RevisionConflict on mismatch."""
    row = await (await conn.execute(
        'SELECT revision, blob, updated_at, name, schema_version FROM trees WHERE id = ?',
        (tree_id,),
    )).fetchone()
    if row is None:
        raise ValueError('tree not found')

    if row['revision'] != expected_revision:
        raise RevisionConflict(
            server_revision=row['revision'],
            server_blob=json.loads(row['blob']),
            server_updated_at=row['updated_at'],
        )

    new_revision = row['revision'] + 1
    now = _now_iso()
    blob_str = json.dumps(blob)
    encoded_size = len(blob_str.encode('utf-8'))
    if encoded_size > settings.server.max_tree_blob_bytes:
        raise BlobTooLarge(encoded_size, settings.server.max_tree_blob_bytes)
    new_name = name if name is not None else row['name']
    new_sv = schema_version if schema_version is not None else row['schema_version']

    # archive the previous revision
    await conn.execute(
        'INSERT OR IGNORE INTO tree_revisions(tree_id, revision, blob, user_id, created_at) VALUES (?,?,?,?,?)',
        (tree_id, row['revision'], row['blob'], user_id, now),
    )

    # prune old revisions beyond the cap
    await conn.execute(
        """
        DELETE FROM tree_revisions
        WHERE tree_id = ? AND revision NOT IN (
            SELECT revision FROM tree_revisions WHERE tree_id = ?
            ORDER BY revision DESC LIMIT ?
        )
        """,
        (tree_id, tree_id, REVISION_CAP),
    )

    await conn.execute(
        'UPDATE trees SET blob=?, revision=?, updated_at=?, name=?, schema_version=? WHERE id=?',
        (blob_str, new_revision, now, new_name, new_sv, tree_id),
    )
    await conn.commit()
    return new_revision, now
