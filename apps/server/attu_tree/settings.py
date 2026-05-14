"""app settings loaded from a bind-mounted toml file via pydantic-settings.

deployment loads `data/trees-config.toml` (mounted at /app/data/trees-config.toml).
no `.env` is read at runtime; missing-file falls through to defaults so dev outside
docker keeps working. set `TREES_CONFIG_PATH` to point at a different toml when
running uvicorn locally.

structure:
  [app] environment
  [server] cors_origins, max_tree_blob_bytes, public_base_url, database_url
  [secrets] discord_bot_hmac_secret, session_secret
  [wiki] base_url
"""

import os
from typing import Literal

from pydantic import BaseModel
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict
from pydantic_settings.sources.providers.toml import TomlConfigSettingsSource


_DEFAULT_CONFIG_PATH = '/app/data/trees-config.toml'
# session cookie path is fixed by the deployment topology (caddy mounts the spa
# at /trees/), so it lives as a class constant rather than a knob
SESSION_COOKIE_PATH = '/trees/'


class AppConfig(BaseModel):
    environment: Literal['dev', 'prod'] = 'dev'


class ServerConfig(BaseModel):
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173']
    # 100 MB; matches the wiki caddy `max-body-100mb` cap
    max_tree_blob_bytes: int = 100_000_000
    public_base_url: str = 'https://attuproject.org/trees'
    database_url: str = 'sqlite+aiosqlite:////app/data/attu_tree.db'


class SecretsConfig(BaseModel):
    discord_bot_hmac_secret: str = ''
    session_secret: str = ''


class WikiConfig(BaseModel):
    base_url: str = 'https://attuproject.org'


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        toml_file=os.getenv('TREES_CONFIG_PATH', _DEFAULT_CONFIG_PATH),
        extra='ignore',
    )

    app: AppConfig = AppConfig()
    server: ServerConfig = ServerConfig()
    secrets: SecretsConfig = SecretsConfig()
    wiki: WikiConfig = WikiConfig()

    # deployment invariant; tied to the spa mount path baked into the dockerfile
    session_cookie_path: str = SESSION_COOKIE_PATH

    @property
    def sqlite_path(self) -> str:
        # strips the driver prefix; supports sqlite+aiosqlite:///path and sqlite:///path
        raw = self.server.database_url
        for prefix in ('sqlite+aiosqlite:///', 'sqlite:///'):
            if raw.startswith(prefix):
                return raw[len(prefix) :]
        return raw

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # toml beats env; env only matters for dev-outside-docker via
        # TREES_CONFIG_PATH (resolved when the source is constructed above)
        return (
            init_settings,
            TomlConfigSettingsSource(settings_cls),
            env_settings,
            file_secret_settings,
        )


settings = Settings()
