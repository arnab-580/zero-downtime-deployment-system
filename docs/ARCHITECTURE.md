# OrderPulse Architecture Deep Dive

OrderPulse is a production-grade, stateful progressive delivery platform implementing zero-downtime canary rollouts, backward-compatible database migrations, and automated SLO-gated rollbacks on Kubernetes.

---

## 1. High-Altitude Topology

```mermaid
graph TD
    User["Internet Traffic / Load Generator"] -->|HTTPS :443| Gateway["Envoy Gateway (Gateway API v1)"]
    
    subgraph DataPlane ["Data Plane (Traffic & Ingress)"]
        Gateway -->|HTTPRoute /metrics| BlockMetrics["302 Redirect to / (Block Public Access)"]
        Gateway -->|HTTPRoute / 90%| SvcStable["Service: orderpulse-stable"]
        Gateway -->|HTTPRoute / 10%| SvcCanary["Service: orderpulse-canary"]
        
        SvcStable --> PodsStable["FastAPI Pods v1 (Stable RS)"]
        SvcCanary --> PodsCanary["FastAPI Pods v2 (Canary RS)"]
        
        PodsStable --> Redis["Redis 7 (Idempotency & Read Cache)"]
        PodsCanary --> Redis
        PodsStable --> Postgres["PostgreSQL 16 (StatefulSet + PVC)"]
        PodsCanary --> Postgres
    end

    subgraph ControlPlane ["Control Plane (Progressive Delivery & Telemetry)"]
        ArgoRollouts["Argo Rollouts Controller"]
        Plugin["gatewayAPI Plugin (v0.17.0)"]
        Prometheus["Prometheus (Pod SD)"]
        Grafana["Grafana Dashboards"]
        
        ArgoRollouts -->|1. Mutate Route Weights| Plugin
        Plugin -->|PATCH httproutes| Gateway
        ArgoRollouts -->|2. Update Selectors| SvcStable
        ArgoRollouts -->|2. Update Selectors| SvcCanary
        
        Prometheus -->|Scrape :8000/metrics| PodsStable
        Prometheus -->|Scrape :8000/metrics| PodsCanary
        ArgoRollouts -->|3. Evaluate SLO Gate| Prometheus
        Grafana -->|Visualize RPS / 5xx / p95| Prometheus
    end

    subgraph SecurityTier ["NetworkPolicy Isolation"]
        NetPol["protect-data-tier"] -.->|Allows Ingress ONLY from app=orderpulse-api & job=orderpulse-migrate| Postgres
        NetPol -.->|Allows Ingress ONLY from app=orderpulse-api| Redis
    end
```

---

## 2. Ingress & Traffic Routing (Gateway API vs. Ingress-NGINX)

### Why Gateway API Replaces Ingress-NGINX
1. **End-of-Life of Ingress-NGINX**: The community `kubernetes/ingress-nginx` controller officially reached End-of-Life in March 2026. Forward-looking cloud-native platforms standardize on the official Kubernetes Gateway API (`gateway.networking.k8s.io`).
2. **Role-Oriented Design**: Gateway API cleanly separates cluster infrastructure (`GatewayClass`, `Gateway`) owned by Platform/SRE teams from routing rules (`HTTPRoute`) owned by Application teams.
3. **First-Class Traffic Splitting**: Unlike legacy Ingress annotations (`nginx.ingress.kubernetes.io/canary-weight`) which suffer from fragmentation and poor controller portability, Gateway API defines multi-backend weighted distribution as a core native specification:
   ```yaml
   backendRefs:
     - name: orderpulse-stable
       port: 80
       weight: 90
     - name: orderpulse-canary
       port: 80
       weight: 10
   ```
4. **xDS Dynamic Reconfiguration**: Envoy Gateway translates `HTTPRoute` rules into Envoy xDS configuration dynamically over gRPC. Routing weights update in milliseconds without reloading proxy processes or dropping persistent TCP keep-alive connections.

---

## 3. Database Evolution: The Expand-and-Contract Pattern

Deploying stateless containers with zero downtime is trivial; deploying stateful systems where v1 and v2 run concurrently against a single shared database is where real-world downtime occurs.

OrderPulse implements the **Expand-and-Contract (Parallel Run)** database migration pattern.

```mermaid
sequenceDiagram
    autonumber
    participant CD as Deployment Engine
    participant DB as PostgreSQL 16
    participant V1 as FastAPI v1 Pods (Running)
    participant V2 as FastAPI v2 Pods (Deploying)

    Note over CD,DB: Phase 1: Expand (Non-Breaking Schema Addition)
    CD->>DB: PreSync Job: alembic upgrade head
    DB->>DB: SELECT pg_advisory_lock(8472910)
    DB->>DB: ALTER TABLE orders ADD COLUMN currency VARCHAR(3) DEFAULT 'USD'
    Note over DB: PostgreSQL 11+ metadata-only update (O(1) execution, 0 lock contention)
    DB->>DB: autocommit_block(): CREATE INDEX CONCURRENTLY idx_orders_created_at
    DB->>DB: SELECT pg_advisory_unlock(8472910)
    
    Note over V1,DB: Phase 2: Parallel Run (Canary 10% -> 25% -> 50% -> 100%)
    V1->>DB: Reads/Writes orders (unaware of promo_code/currency columns) -> 200 OK
    V2->>DB: Reads/Writes orders (utilizing promo_code & currency columns) -> 201 OK
    
    Note over CD,V1: Phase 3: Contract (Post-Cutover / Future Release)
    CD->>V1: Scale down v1 pods cleanly
    Note over DB: Old schema elements deprecated safely after all clients upgrade
```

### Key Migration Invariants
1. **Session-Level Advisory Locking (`pg_advisory_lock`)**:
   Prevents multiple concurrent migration jobs (e.g., from retries or parallel CI triggers) from interleaving DDL statements.
2. **Instant Metadata Updates**:
   Adding columns with non-volatile defaults (`DEFAULT 'USD'`) in PostgreSQL 11+ is an instantaneous table-metadata change that does not rewrite table rows or acquire exclusive table locks.
3. **`CREATE INDEX CONCURRENTLY` in `autocommit_block()`**:
   Standard index creation holds an `EXCLUSIVE SHARE` lock that blocks all incoming `INSERT` and `UPDATE` queries. Concurrently building the index scans the table without blocking live transaction throughput.

---

## 4. Packet-Draining Pod Lifecycle (Zero Dropped Connections)

When a pod is scheduled for termination during downscaling, Kubernetes executes two actions in parallel:
1. Removes the pod IP from `EndpointSlices` / kube-proxy iptables.
2. Sends `SIGTERM` to the container process.

Because propagating endpoint updates to Envoy Gateway and Linux conntrack takes ~1–2 seconds, sending `SIGTERM` immediately causes in-flight HTTP requests to fail with `502 Bad Gateway` or `Connection Reset`.

### OrderPulse Termination Sequence

```mermaid
sequenceDiagram
    participant K8s as Kubernetes API
    participant EP as EndpointSlice / Envoy
    participant Pod as FastAPI Container (Uvicorn)
    participant Client as k6 / In-flight Traffic

    K8s->>EP: Mark Pod as Terminating (withdraw IP from endpoints)
    K8s->>Pod: Invoke preStop Hook: /bin/sh -c "sleep 10"
    
    Note over Pod: Pod continues running HTTP listener for 10s!
    Client->>Pod: In-flight requests initiated during endpoint sync arrive
    Pod->>Client: Request successfully completed (200 OK)
    
    Note over EP: EndpointSlice propagation completes across cluster
    K8s->>Pod: Send SIGTERM signal (after 10s sleep ends)
    Pod->>Pod: Uvicorn enters graceful shutdown (--timeout-graceful-shutdown 20)
    Pod->>Pod: Drain active connections, flush logs, close DB & Redis pools
    Pod->>K8s: Process exits with returncode 0
```

### Server Timeout Alignment
- `Envoy Gateway Idle Timeout`: 60 seconds
- `Uvicorn keep-alive timeout`: `--timeout-keep-alive 65` (exceeds proxy idle timeout to eliminate race-condition resets)
- `Uvicorn graceful shutdown`: `--timeout-graceful-shutdown 20`
- `Pod termination grace period`: `terminationGracePeriodSeconds: 30`

---

## 5. Automated SLO Gate & Failure Blast Radius

Argo Rollouts queries Prometheus metrics scoped exclusively to the canary pod hash (`rollouts_pod_template_hash`).

### Metric 1: HTTP 5xx Error Rate (< 1%)
```promql
(
  sum(rate(http_requests_total{namespace="deployment-engine", rollouts_pod_template_hash="{{args.canary-hash}}", status_code=~"5.."}[2m]))
  or vector(0)
)
/
clamp_min(
  sum(rate(http_requests_total{namespace="deployment-engine", rollouts_pod_template_hash="{{args.canary-hash}}"}[2m]))
  or vector(0.001),
  0.001
)
```

### Metric 2: p95 Latency (< 250ms)
```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_request_duration_seconds_bucket{namespace="deployment-engine", rollouts_pod_template_hash="{{args.canary-hash}}"}[2m])
  )
) or vector(0)
```

### Auto-Rollback Safeguards
- **Evaluation Interval**: Every 20 seconds
- **Failure Limit**: 2 consecutive failures
- **Detection Window**: ~40–60 seconds
- **Blast Radius**: Maximum 10% of total external traffic is exposed to the faulty release before automatic rollback triggers and resets traffic to 100% stable.
