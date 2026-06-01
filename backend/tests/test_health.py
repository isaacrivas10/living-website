from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_and_model_status():
    with patch("app.main.check_model_reachable", return_value=True):
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_reachable"] is True
    assert isinstance(body["model_name"], str) and len(body["model_name"]) > 0
    assert isinstance(body["model_temperature"], float)
    assert isinstance(body["model_max_tokens"], int)


def test_health_reports_model_unreachable():
    with patch("app.main.check_model_reachable", return_value=False):
        response = client.get("/api/health")
    assert response.json()["model_reachable"] is False
