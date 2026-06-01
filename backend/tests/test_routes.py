from fastapi.testclient import TestClient

from app import cache, generation
from app.main import app

client = TestClient(app)


def test_nodes_returns_three():
    response = client.get("/api/nodes")
    assert response.status_code == 200
    assert {n["id"] for n in response.json()} == {"data-engineering", "ai-ml", "domo"}


def test_seed_unknown_node_404():
    assert client.get("/api/seed/marketing").status_code == 404


def test_seed_known_node_returns_shape(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    response = client.get("/api/seed/domo")
    assert response.status_code == 200
    assert response.json() == {"node": "domo", "html": None}


def test_generate_route_streams_events(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)

    def fake_stream(client_, messages, usage_out=None):
        yield "<!doctype html><html><body><div>ok</div></body></html>"

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    response = client.post("/api/generate", json={"node": "domo", "prompt": "test"})
    assert response.status_code == 200
    body = response.text
    assert '"type": "meta"' in body
    assert '"type": "done"' in body
    assert "<html" in body


def test_seeds_unknown_node_returns_404():
    assert client.get("/api/seeds/marketing").status_code == 404


def test_seeds_returns_all_pinned_for_node(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p1", "<html>first</html>", ms=100, pinned=True)
    cache.save("domo", "p2", "<html>second</html>", ms=200, pinned=True)
    response = client.get("/api/seeds/domo")
    assert response.status_code == 200
    body = response.json()
    assert body["node"] == "domo"
    assert len(body["seeds"]) == 2


def test_seeds_returns_empty_list_when_none_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    response = client.get("/api/seeds/domo")
    assert response.status_code == 200
    assert response.json()["seeds"] == []
