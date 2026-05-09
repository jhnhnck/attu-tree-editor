"""tests for spa serving + window.__TREES_CONFIG__ injection."""

import pytest
from httpx import AsyncClient

from attu_tree import main
from attu_tree.settings import settings


@pytest.fixture(autouse=True)
def reset_templated_index_cache():
    """force a fresh template build per test so settings overrides take effect."""
    main._templated_index.cache_clear()
    yield
    main._templated_index.cache_clear()


@pytest.fixture()
def static_dir(tmp_path, monkeypatch):
    """point _STATIC_DIR at a tmpdir with a minimal index.html and an asset."""
    (tmp_path / 'index.html').write_text(
        '<!doctype html><html><head><title>t</title></head><body></body></html>',
        encoding='utf-8',
    )
    assets = tmp_path / 'assets'
    assets.mkdir()
    (assets / 'app.js').write_text('console.log("ok");', encoding='utf-8')
    monkeypatch.setattr(main, '_STATIC_DIR', tmp_path)
    monkeypatch.setattr(main, '_INDEX_PATH', tmp_path / 'index.html')
    return tmp_path


@pytest.mark.unit
async def test_spa_returns_index_with_injected_config(client: AsyncClient, static_dir, monkeypatch):
    monkeypatch.setattr(settings.wiki, 'base_url', 'https://example.com')
    monkeypatch.setattr(settings.app, 'environment', 'dev')
    r = await client.get('/')
    assert r.status_code == 200
    assert r.headers['cache-control'] == 'no-store'
    assert 'window.__TREES_CONFIG__' in r.text
    assert '"wikiBaseUrl": "https://example.com"' in r.text
    assert '"environment": "dev"' in r.text


@pytest.mark.unit
async def test_spa_serves_static_asset_directly(client: AsyncClient, static_dir):
    r = await client.get('/assets/app.js')
    assert r.status_code == 200
    assert 'console.log' in r.text


@pytest.mark.unit
async def test_spa_returns_index_for_client_routes(client: AsyncClient, static_dir):
    r = await client.get('/view/some-tree-id')
    assert r.status_code == 200
    assert 'window.__TREES_CONFIG__' in r.text


@pytest.mark.unit
async def test_spa_rejects_path_traversal(client: AsyncClient, static_dir):
    r = await client.get('/../etc/passwd')
    # starlette normalises the path before routing; either way we should
    # never serve a file outside the static dir
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert 'window.__TREES_CONFIG__' in r.text
