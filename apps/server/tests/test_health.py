"""FamilyTreeEditor - smoke test for the /health endpoint.

licensed under the MIT license; see LICENSE.md for full text.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from attu_tree.main import app


@pytest.mark.unit
async def test_health_returns_ok() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        response = await client.get('/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert 'version' in body
