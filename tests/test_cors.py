from fastapi.testclient import TestClient

from arena.api import Limits, create_app
from arena.record import scripted_victim
from atlas.trace import TraceStore


def _client(tmp_path, **kwargs):
    store = TraceStore(str(tmp_path / "t.db"))
    return TestClient(create_app(store, scripted_victim, Limits(store, 10, 100), **kwargs))


def test_only_the_configured_site_may_call_the_arena_from_a_browser(tmp_path):
    client = _client(tmp_path, allow_origin="https://atlas.example")
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    allowed = client.options("/api/rounds", headers={"Origin": "https://atlas.example", **preflight})
    assert allowed.headers["access-control-allow-origin"] == "https://atlas.example"
    other = client.options("/api/rounds", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in other.headers


def test_no_other_site_is_allowed_by_default(tmp_path):
    response = _client(tmp_path).get("/api/status", headers={"Origin": "https://atlas.example"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
