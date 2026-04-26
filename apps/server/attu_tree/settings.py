"""app settings loaded from environment / .env via pydantic-settings."""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    database_url: str = 'sqlite+aiosqlite:///./attu_tree.db'
    discord_bot_hmac_secret: str = ''
    session_secret: str = ''
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173']
    # path prefix the session cookie is scoped to; / for dev, /trees/ in prod
    session_cookie_path: str = '/'
    # max bytes accepted for a single tree blob (json) on create / save
    max_tree_blob_bytes: int = 10 * 1024 * 1024
    # which environment we're running as. encoded into link codes (the second
    # alpha character) so a single discord bot can route /trees link to the
    # right backend without the user needing to think about it. see
    # auth/link.py for the dev/prod alphabet partition.
    environment: Literal['dev', 'prod'] = 'dev'

    # raw sqlite path extracted from database_url for aiosqlite
    @property
    def sqlite_path(self) -> str:
        # strips the driver prefix; supports sqlite+aiosqlite:///path and sqlite:///path
        raw = self.database_url
        for prefix in ('sqlite+aiosqlite:///', 'sqlite:///'):
            if raw.startswith(prefix):
                return raw[len(prefix):]
        return raw


settings = Settings()
