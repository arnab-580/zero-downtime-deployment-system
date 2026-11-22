import asyncio
import json
import logging
import os
import random
import socket
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field
import redis.asyncio as aioredis


# --- Structured JSON Logging ---
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": round(time.time(), 3),
            "level": record.levelname,
            "msg": record.getMessage(),
            "version": APP_VERSION,
            "pod": POD_NAME,
        }
        return json.dumps(payload)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger = logging.getLogger("orderpulse")
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))
logger.addHandler(handler)
logger.propagate = False

# --- Configuration ---
APP_VERSION = os.getenv("APP_VERSION", "v1.0.0")
GIT_SHA = os.getenv("GIT_SHA", "local")
POD_NAME = socket.gethostname()
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CHAOS_ERROR_RATE = float(os.getenv("CHAOS_ERROR_RATE", "0"))
CHAOS_LATENCY_MS = int(os.getenv("CHAOS_LATENCY_MS", "0"))

# --- Prometheus Metrics (Matches k8s/platform/analysis-template.yaml!) ---
HTTP_REQUESTS_TOTAL = Counter(
    "http_requests_total",
    "Total HTTP requests handled",
    ["method", "route", "status_code", "app_version"],
)
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "route", "status_code", "app_version"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)
DB_QUERY_DURATION = Histogram(
    "db_query_duration_seconds",
    "PostgreSQL query latency in seconds",
    ["operation"],
    buckets=(0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5),
)
ORDERS_CREATED_TOTAL = Counter(
    "orders_created_total",
    "Total confirmed orders persisted in PostgreSQL",
    ["app_version"],
)

db_pool: Optional[AsyncConnectionPool] = None
redis_client: Optional[aioredis.Redis] = None
is_draining = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global db_pool, redis_client, is_draining
    db_pool = AsyncConnectionPool(
        conninfo=DATABASE_URL,
        min_size=2,
        max_size=15,
        open=False,
        kwargs={"row_factory": dict_row},
    )
    await db_pool.open()
    redis_client = aioredis.from_url(
        REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    logger.info("orderpulse api started and connected to postgres + redis")
    try:
        yield
    finally:
        is_draining = True
        logger.info("closing postgres pool and redis client cleanly")
        if redis_client:
            await redis_client.aclose()
        if db_pool:
            await db_pool.close()
        logger.info("graceful shutdown complete")


app = FastAPI(title="OrderPulse API", version=APP_VERSION, lifespan=lifespan)


# --- Instrumentation & Safe Canary Fault Injection Middleware ---
@app.middleware("http")
async def observe_and_chaos(request: Request, call_next):
    path = request.url.path
    if path in ("/healthz", "/readyz", "/metrics"):
        return await call_next(request)

    start = time.perf_counter()

    # Controlled canary chaos (never breaks probes/metrics so Prometheus catches it cleanly)
    if path.startswith("/api/"):
        if CHAOS_LATENCY_MS > 0:
            await asyncio.sleep(CHAOS_LATENCY_MS / 1000.0)
        if CHAOS_ERROR_RATE > 0 and random.random() < CHAOS_ERROR_RATE:
            elapsed = time.perf_counter() - start
            labels = {
                "method": request.method,
                "route": path,
                "status_code": "500",
                "app_version": APP_VERSION,
            }
            HTTP_REQUESTS_TOTAL.labels(**labels).inc()
            HTTP_REQUEST_DURATION.labels(**labels).observe(elapsed)
            logger.warning(f"injected canary fault on {path}")
            return JSONResponse(
                status_code=500,
                content={"error": "simulated_canary_failure", "version": APP_VERSION, "pod": POD_NAME},
            )

    response = await call_next(request)
    elapsed = time.perf_counter() - start
    route_obj = request.scope.get("route")
    route_label = route_obj.path if route_obj else path
    labels = {
        "method": request.method,
        "route": route_label,
        "status_code": str(response.status_code),
        "app_version": APP_VERSION,
    }
    HTTP_REQUESTS_TOTAL.labels(**labels).inc()
    HTTP_REQUEST_DURATION.labels(**labels).observe(elapsed)
    return response


# --- Kubernetes Probes & Internal Prometheus Metrics ---
@app.get("/healthz")
async def healthz():
    return {"status": "alive", "version": APP_VERSION, "pod": POD_NAME}


@app.get("/readyz")
async def readyz():
    if is_draining or db_pool is None or redis_client is None:
        return JSONResponse(status_code=503, content={"status": "draining"})
    try:
        async with db_pool.connection(timeout=2) as conn:
            await conn.execute("SELECT 1")
        await redis_client.ping()
        return {"status": "ready", "version": APP_VERSION, "pod": POD_NAME}
    except Exception as exc:
        logger.error(f"readiness check failed: {exc}")
        return JSONResponse(status_code=503, content={"status": "not_ready"})


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# --- Business API ---
class CreateOrderRequest(BaseModel):
    product_id: int = Field(gt=0)
    customer_name: str = Field(min_length=1, max_length=100)
    quantity: int = Field(default=1, gt=0, le=10)


@app.get("/api/version")
async def get_version():
    async with db_pool.connection() as conn:
        cur = await conn.execute("SELECT version_num FROM alembic_version LIMIT 1")
        row = await cur.fetchone()
    return {
        "version": APP_VERSION,
        "commit": GIT_SHA,
        "pod": POD_NAME,
        "db_revision": row["version_num"] if row else "unknown",
    }


@app.get("/api/products")
async def list_products():
    cache_key = "products:all"
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            return {"source": "redis", "version": APP_VERSION, "pod": POD_NAME, "products": json.loads(cached)}
    except Exception:
        pass

    t0 = time.perf_counter()
    async with db_pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, sku, name, price_cents, stock FROM products ORDER BY id ASC"
        )
        rows = await cur.fetchall()
    DB_QUERY_DURATION.labels(operation="list_products").observe(time.perf_counter() - t0)

    try:
        await redis_client.set(cache_key, json.dumps(rows), ex=5)
    except Exception:
        pass

    return {"source": "postgres", "version": APP_VERSION, "pod": POD_NAME, "products": rows}


@app.get("/api/orders")
async def list_orders():
    t0 = time.perf_counter()
    async with db_pool.connection() as conn:
        cur = await conn.execute(
            """
            SELECT o.id, o.customer_name, o.quantity, o.total_cents, o.status,
                   o.created_at, p.name AS product_name
            FROM orders o
            JOIN products p ON p.id = o.product_id
            ORDER BY o.id DESC
            LIMIT 20
            """
        )
        rows = await cur.fetchall()
    DB_QUERY_DURATION.labels(operation="list_orders").observe(time.perf_counter() - t0)

    for r in rows:
        r["created_at"] = r["created_at"].isoformat()

    return {"source": "postgres", "version": APP_VERSION, "pod": POD_NAME, "orders": rows}


@app.post("/api/orders", status_code=201)
async def create_order(
    payload: CreateOrderRequest,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    idem_key = idempotency_key or str(uuid.uuid4())
    redis_idem_key = f"idem:{idem_key}"

    # 1. Fast-path idempotency deduplication via Redis
    try:
        existing_cached = await redis_client.get(redis_idem_key)
        if existing_cached:
            return JSONResponse(
                status_code=200,
                content={**json.loads(existing_cached), "deduplicated": True, "version": APP_VERSION, "pod": POD_NAME},
            )
    except Exception:
        pass

    # 2. Transactional checkout in PostgreSQL (row lock prevents overselling)
    t0 = time.perf_counter()
    async with db_pool.connection() as conn:
        async with conn.transaction():
            cur = await conn.execute(
                "SELECT id, product_id, customer_name, quantity, total_cents, status, created_at FROM orders WHERE idempotency_key = %s",
                (idem_key,),
            )
            existing_db = await cur.fetchone()
            if existing_db:
                existing_db["created_at"] = existing_db["created_at"].isoformat()
                return JSONResponse(
                    status_code=200,
                    content={**existing_db, "deduplicated": True, "version": APP_VERSION, "pod": POD_NAME},
                )

            cur = await conn.execute(
                "SELECT id, name, price_cents, stock FROM products WHERE id = %s FOR UPDATE",
                (payload.product_id,),
            )
            product = await cur.fetchone()
            if not product:
                raise HTTPException(status_code=404, detail="product_not_found")
            if product["stock"] < payload.quantity:
                raise HTTPException(status_code=409, detail="out_of_stock")

            total_cents = product["price_cents"] * payload.quantity
            await conn.execute(
                "UPDATE products SET stock = stock - %s WHERE id = %s",
                (payload.quantity, payload.product_id),
            )
            cur = await conn.execute(
                """
                INSERT INTO orders (idempotency_key, product_id, customer_name, quantity, total_cents)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, product_id, customer_name, quantity, total_cents, status, created_at
                """,
                (idem_key, payload.product_id, payload.customer_name.strip(), payload.quantity, total_cents),
            )
            order = await cur.fetchone()
    DB_QUERY_DURATION.labels(operation="create_order").observe(time.perf_counter() - t0)

    order["created_at"] = order["created_at"].isoformat()
    ORDERS_CREATED_TOTAL.labels(app_version=APP_VERSION).inc()

    # Invalidate product cache & record idempotency key in Redis
    try:
        await redis_client.set(redis_idem_key, json.dumps(order), ex=300)
        await redis_client.delete("products:all")
    except Exception:
        pass

    return {**order, "version": APP_VERSION, "pod": POD_NAME}


@app.get("/")
async def storefront():
    return FileResponse(Path(__file__).parent / "static" / "index.html")