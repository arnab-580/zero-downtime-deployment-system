import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const versionHits = new Counter("version_hits");

export const options = {
  scenarios: {
    continuous_aws_traffic: {
      executor: "constant-arrival-rate",
      rate: 20,              // 20 req/s steady reads + real Postgres writes
      timeUnit: "1s",
      duration: "3m30s",     // Covers full 10% -> 25% -> 50% -> 100% rollout
      preAllocatedVUs: 15,
      maxVUs: 40,
    },
  },
  thresholds: {
    http_req_failed: ["rate==0"],      // ZERO failed/dropped requests allowed
    http_req_duration: ["p(95)<500"],  // End-to-end HTTPS p95 over internet < 500ms
  },
};

const BASE_URL = __ENV.TARGET_URL || "https://orderpulse.3-6-45-243.sslip.io";

export default function () {
  if (Math.random() < 0.75) {
    const res = http.get(`${BASE_URL}/api/products`);
    check(res, { "GET /api/products 200": (r) => r.status === 200 });
    if (res.status === 200) {
      versionHits.add(1, { version: res.json("version") || "unknown" });
    }
  } else {
    const res = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify({
        product_id: (Math.floor(Math.random() * 4) % 4) + 1,
        customer_name: `k6-buyer-${__VU}`,
        quantity: 1,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `k6-${__VU}-${__ITER}-${Date.now()}`,
        },
      }
    );
    check(res, { "POST /api/orders 201": (r) => r.status === 201 });
    if (res.status === 201) {
      versionHits.add(1, { version: res.json("version") || "unknown" });
    }
  }
  sleep(0.05);
}