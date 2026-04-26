-- initial schema for the family tree editor backend
-- all ids are uuid v4 (text); foreign keys are enforced at application layer

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    discord_id    TEXT NOT NULL UNIQUE,
    discord_username TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    deleted_at    TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);

-- link_codes: web-initiated auth codes redeemed by the discord bot
-- session_token is pre-issued so web polling can flip to authenticated in one step
CREATE TABLE IF NOT EXISTS link_codes (
    code          TEXT PRIMARY KEY,
    session_token TEXT NOT NULL,
    user_id       TEXT REFERENCES users(id),
    expires_at    TEXT NOT NULL,
    consumed_at   TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS trees (
    id             TEXT PRIMARY KEY,
    owner_id       TEXT NOT NULL REFERENCES users(id),
    name           TEXT NOT NULL DEFAULT '',
    schema_version INTEGER NOT NULL DEFAULT 1,
    blob           TEXT NOT NULL DEFAULT '{}',
    revision       INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trees_owner_id ON trees(owner_id);

CREATE TABLE IF NOT EXISTS tree_grants (
    tree_id    TEXT NOT NULL REFERENCES trees(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    role       TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
    granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (tree_id, user_id)
);

CREATE TABLE IF NOT EXISTS tree_revisions (
    tree_id    TEXT NOT NULL REFERENCES trees(id),
    revision   INTEGER NOT NULL,
    blob       TEXT NOT NULL,
    user_id    TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (tree_id, revision)
);
