import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def test_healthz_returns_alive():
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "alive"


def test_metrics_exposes_slo_counters_and_histograms():
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "http_requests_total" in res.text
    assert "http_request_duration_seconds" in res.text


def test_order_validation_rejects_invalid_payload():
    res = client.post(
        "/api/orders",
        json={"product_id": 1, "customer_name": "Arnab", "quantity": -5},
    )
    assert res.status_code == 422
