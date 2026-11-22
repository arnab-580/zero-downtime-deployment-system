from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_healthz():
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "alive"


def test_metrics_exposes_slo_series():
    client.get("/api/nonexistent-probe-test")
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "http_requests_total" in res.text
    assert "http_request_duration_seconds_bucket" in res.text


def test_order_validation_rejects_bad_quantity():
    res = client.post(
        "/api/orders",
        json={"product_id": 1, "customer_name": "Arnab", "quantity": -5},
    )
    assert res.status_code == 422