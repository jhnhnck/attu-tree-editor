"""pydantic wire models for all api endpoints."""

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------

class LinkStartResponse(BaseModel):
    code: str
    expires_at: str


class LinkCheckResponse(BaseModel):
    status: Literal['pending', 'ok', 'expired', 'not_found']


class MeResponse(BaseModel):
    id: str
    discord_id: str
    discord_username: str
    display_name: str
    role: Literal['admin', 'user']


# ---------------------------------------------------------------------------
# trees
# ---------------------------------------------------------------------------

class TreeListing(BaseModel):
    id: str
    name: str
    role: Literal['owner', 'editor', 'viewer']
    revision: int
    updated_at: str


class TreeListResponse(BaseModel):
    trees: list[TreeListing]


class TreeCreateRequest(BaseModel):
    name: str = ''
    blob: Any = Field(default_factory=dict)
    schema_version: int = 1


class TreeCreateResponse(BaseModel):
    id: str
    revision: int


class TreeResponse(BaseModel):
    id: str
    name: str
    owner_id: str
    schema_version: int
    blob: Any
    revision: int
    updated_at: str
    role: Literal['owner', 'editor', 'viewer']


class TreeSaveRequest(BaseModel):
    name: str | None = None
    blob: Any = None
    schema_version: int | None = None
    expected_revision: int


class TreeSaveResponse(BaseModel):
    revision: int
    updated_at: str


class TreeConflictResponse(BaseModel):
    server_revision: int
    server_blob: Any
    server_updated_at: str


class GrantRequest(BaseModel):
    discord_id: str
    role: Literal['viewer', 'editor']


class GrantResponse(BaseModel):
    user_id: str
    role: str


# ---------------------------------------------------------------------------
# bot-only
# ---------------------------------------------------------------------------

class BotLinkRequest(BaseModel):
    code: str
    discord_id: str
    discord_username: str
    # discord-side roles the user holds. server keeps only entries it recognises
    # (today: 'admin', 'user'); unknown strings are silently dropped so the bot
    # can ship new role names ahead of the server. applied on every link, so
    # role changes on discord propagate the next time the user re-links.
    roles: list[str] = Field(default_factory=list)


class BotLinkResponse(BaseModel):
    display_name: str


class BotGrantRequest(BaseModel):
    actor_discord_id: str
    target_discord_id: str
    target_discord_username: str
    role: Literal['viewer', 'editor']


class BotRevokeRequest(BaseModel):
    actor_discord_id: str
    target_discord_id: str


class BotViewLinkRequest(BaseModel):
    actor_discord_id: str


class BotViewLinkResponse(BaseModel):
    url: str


# ---------------------------------------------------------------------------
# admin
# ---------------------------------------------------------------------------

class AdminUserListing(BaseModel):
    id: str
    discord_id: str
    discord_username: str
    display_name: str
    role: Literal['admin', 'user']
    created_at: str
    deleted_at: str | None


class AdminUserListResponse(BaseModel):
    users: list[AdminUserListing]
    total: int


class AdminUserUpdateRequest(BaseModel):
    # role is intentionally not mutable here: the bot's link payload (mirroring
    # discord roles) is the only source of truth. see BotLinkRequest.roles.
    display_name: str | None = None
