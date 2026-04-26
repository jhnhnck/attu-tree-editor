"""aiosqlite connection pool + migration runner.

the module exposes `get_db()` as a FastAPI dependency and `init_db()` for
the lifespan startup hook. migrations are plain sql files in migrations/,
applied in filename order and tracked in _meta.
"""

import logging
import re
from collections.abc import AsyncGenerator
from pathlib import Path

import aiosqlite

from attu_tree.settings import settings


log = logging.getLogger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent / 'migrations'

# module-level connection (single-writer sqlite; WAL mode keeps reads non-blocking)
# wrapped in a dict so the linter doesn't flag global mutation
_state: dict[str, aiosqlite.Connection | None] = {'db': None}


async def init_db() -> None:
    path = settings.sqlite_path
    log.info('opening sqlite at %s', path)
    conn = await aiosqlite.connect(path)
    conn.row_factory = aiosqlite.Row
    await conn.execute('PRAGMA journal_mode=WAL')
    await conn.execute('PRAGMA busy_timeout=5000')
    await conn.execute('PRAGMA foreign_keys=ON')
    _state['db'] = conn
    await _run_migrations(conn)
    log.info('db ready')


async def close_db() -> None:
    conn = _state.get('db')
    if conn is not None:
        await conn.close()
        _state['db'] = None


async def get_db() -> AsyncGenerator[aiosqlite.Connection]:
    """FastAPI dependency; yields the shared connection."""
    conn = _state.get('db')
    if conn is None:
        raise RuntimeError('db not initialised; call init_db() in the lifespan')
    yield conn


async def _run_migrations(conn: aiosqlite.Connection) -> None:
    await conn.execute(
        'CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    )
    await conn.commit()

    row = await (await conn.execute("SELECT value FROM _meta WHERE key='schema_version'")).fetchone()
    current = int(row['value']) if row else 0

    migration_files = sorted(
        f for f in _MIGRATIONS_DIR.iterdir()
        if re.match(r'^\d{3}_.*\.sql$', f.name)
    )

    applied = 0
    for path in migration_files:
        version = int(path.name[:3])
        if version <= current:
            continue
        log.info('applying migration %s', path.name)
        sql = path.read_text()
        await conn.executescript(sql)
        await conn.execute(
            "INSERT OR REPLACE INTO _meta(key, value) VALUES ('schema_version', ?)",
            (str(version),),
        )
        await conn.commit()
        applied += 1
        current = version

    if applied:
        log.info('applied %d migration(s); schema_version=%d', applied, current)
