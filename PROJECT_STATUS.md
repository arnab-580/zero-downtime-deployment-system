# OrderPulse • Project Status & AI Studio Context Document

> **Purpose**: This document provides a complete, structured summary of the OrderPulse platform's current operational state, implemented features, verified milestones, infrastructure topology, and mathematical proofs. Use this document as the prompt/context in Google AI Studio or other agent sessions to resume or extend work seamlessly.

---

## 1. Executive Summary

- **Project Name**: OrderPulse — Zero-Downtime Stateful Delivery Platform
- **Repository**: [github.com/arnab-580/zero-downtime-deployment-system](https://github.com/arnab-580/zero-downtime-deployment-system)
- **Active Git Branch**: `main` (clean working directory, up to date with `origin/main`)
- **Live Production URL**: [https://orderpulse.3-6-45-243.sslip.io](https://orderpulse.3-6-45-243.sslip.io) (valid Let's Encrypt HTTPS :443)
- **Active Version**: `v2.0.0` (3/3 healthy replicas running on AWS)
- **Container Registry**: `ghcr.io/arnab-580/orderpulse-api` (tags: `v1.0.0`, `v2.0.0`, `v2.0.21`, immutable commit SHAs)

---

## 2. Infrastructure & Environment Status

| Layer | Technology | Details & Current Status |
| :--- | :--- | :--- |
| **Cloud Provider** | AWS (Region: `ap-south-1` Mumbai) | Managed 100% via Terraform (`infra/terraform/`). |
| **Compute Instance** | EC2 `m7i-flex.large` | 2 vCPUs, 8 GiB RAM, Ubuntu 24.04 LTS, IMDSv2 enforced, encrypted 25 GB gp3 EBS root volume. Instance ID: `i-09bf4d74a69acd24a`. |
| **Networking** | Custom AWS VPC (`10.0.0.0/16`) | Public Subnet (`10.0.1.0/24` in `ap-south-1a`), Internet Gateway, Route Table, Elastic IP (`3.6.45.243`). |
| **Security Group** | Locked Security Group | Ports `80` & `443` public (`0.0.0.0/0`); Ports `22` (SSH) & `6443` (K8s API) restricted strictly to admin IP; internal cluster `self = true`. |
| **Kubernetes Engine** | Lightweight K8s (`k3s` v1.37.2) | Built-in Traefik disabled (`--disable traefik`), cluster API bound to private IP `10.0.1.237`, public Elastic IP in `--tls-san`. |
| **Ingress Controller** | Envoy Gateway v1.10.0 | Official Kubernetes Gateway API v1 (`GatewayClass: eg`, `Gateway: main-gateway`, `HTTPRoute: orderpulse-route`). |
| **TLS / PKI** | cert-manager v1.21.3 | ACME HTTP-01 solver via Gateway API HTTPRoute automatically issued valid Let's Encrypt certificate (`orderpulse-tls`). |
| **Continuous Delivery** | Argo Rollouts v1.10.1 (Chart 2.43.8) | Installed with `argoproj-labs/gatewayAPI` plugin v0.17.0 for native HTTPRoute traffic splitting. |
| **Observability** | Prometheus v3.2.1 + Grafana v11.5.2 | Pod-scoped service discovery scraping application latency histograms and status codes; pre-provisioned Grafana dashboards. |

---

## 3. Implemented Application Features

### A. Core Microservice (`services/api` / `app/`)
- **Framework**: Python 3.12 + FastAPI + single-worker Uvicorn (`--timeout-keep-alive 65`, `--timeout-graceful-shutdown 20`).
- **Persistence**: PostgreSQL 16 StatefulSet with 2 GiB PVC, accessed via async connection pooling (`psycopg_pool`).
- **Caching & Deduplication**: Redis 7 Deployment (128 MB LRU memory limit) caching product catalogs and storing 5-minute idempotency keys via `Idempotency-Key` headers to prevent double-charging.
- **Storefront UI**: Responsive, accessible HTML5/CSS3 frontend served directly from FastAPI using relative endpoints (zero hardcoded IPs, zero fake metrics). Displays real-time database orders, live pod name, version badge, and Redis cache hit status.
- **Promo Code Engine (v2.0.0)**: Supports discount codes (e.g., `DEVOPS20` for 20% off, `SRE10` for 10% off) with automatic subtotal/discount calculation and transactional stock decrements.
- **Multi-Currency (v2.0.0)**: Accepts orders in `USD`, `INR`, and `EUR` with payload validation.
- **Telemetry Instrumentation**: Native Prometheus client exporting `http_requests_total` (by method, route, status_code, app_version), `http_request_duration_seconds` histograms, `db_query_duration_seconds` histograms, and `orders_created_total`.
- **Chaos Fault Injection**: Built-in middleware controllable via `CHAOS_ERROR_RATE` and `CHAOS_LATENCY_MS` environment variables (scoped to `/api/*` so Kubernetes probes `/healthz` and `/readyz` remain unaffected).

### B. Database Schema Evolution (Alembic)
- **Locking Safety**: Uses dedicated session-level PostgreSQL advisory lock (`pg_advisory_lock(8472910)`) in `app/alembic/env.py` to prevent race conditions during concurrent deployments.
- **Migration `001_initial_schema`**: Created `products` (idempotently seeded with stock) and `orders` tables.
- **Migration `002_expand_promo_currency`**: Expand-and-contract migration adding `currency`, `promo_code`, and `discount_cents` with non-volatile defaults (O(1) instant metadata update, 0 table rewrite lock) and built `idx_orders_created_at` concurrently using `autocommit_block()`.

### C. Container & Pod Hardening
- **Multi-Stage Dockerfile**: Builds on `python:3.12-slim`, isolates dependency wheels, runs as dedicated non-root user (UID `1001`).
- **Kubernetes SecurityContext**: `runAsNonRoot: true`, `runAsUser: 1001`, `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`.
- **Zero-Packet-Drop Lifecycle**: Container `lifecycle.preStop` executes `/bin/sh -c "sleep 10"` to allow Envoy Gateway and kube-proxy endpoint propagation to complete before sending `SIGTERM`. Server keep-alive (`65s`) exceeds Envoy idle timeout (`60s`).
- **Availability Guarantees**: `PodDisruptionBudget` (`minAvailable: 2`) prevents voluntary evictions from taking down the service during node maintenance.
- **Data Tier Isolation**: Kubernetes `NetworkPolicy` (`protect-data-tier`) blocks all ingress to PostgreSQL and Redis except from pods labeled `app=orderpulse-api` and `job=orderpulse-migrate`.

---

## 4. Successful Operations & Live Verifications Completed

### Milestone 1: Automated DevSecOps Supply Chain
- GitHub Actions CI (`.github/workflows/ci.yml`) runs on push and release tags.
- Executes `ruff check` (linting & import sorting) and `pytest -v` (API contracts).
- Builds multi-stage container once.
- Scans built container image using `aquasecurity/trivy-action@v0.36.0` (fails build on any unfixed CRITICAL CVE).
- Pushes immutable Git-SHA and semantic version tags (`v1.0.0`, `v2.0.0`) to GitHub Container Registry (`ghcr.io`).

### Milestone 2: Expand-and-Contract Database Migration
- Executed Kubernetes Job `orderpulse-migrate-v2` (`002_expand_promo_currency.py`).
- Completed in ~4 seconds while live v1.0.0 pods handled continuous user read/write traffic with 0 locking errors.

### Milestone 3: Experiment A — Live Zero-Downtime Canary Promotion (v1.0.0 ➔ v2.0.0)
- **Load Test**: Continuous `k6` traffic running 30 req/s (reads + checkout writes) for 3m 30s over public internet HTTPS.
- **Progressive Delivery**: Argo Rollouts shifted traffic dynamically via Envoy Gateway HTTPRoute: `10%` (45s pause) ➔ `25%` (45s pause) ➔ `50%` (45s pause) ➔ `100%` (promotion).
- **SLO Verification**: Prometheus `canary-slo-gate` confirmed 0% error rate and < 10ms p95 latency at each step.
- **k6 Final Results**:
  - `checks_succeeded`: **100.00%** (6,301 out of 6,301 requests)
  - `http_req_failed`: **0.00%** (0 dropped requests)
  - `http_req_duration`: avg=48.39ms, p95=51.35ms
  - Both `v1.0.0` and `v2.0.0` served traffic concurrently and seamlessly.

### Milestone 4: Experiment B — Automated SLO-Gated Rollback (Chaos Test)
- Promoted revision 3 configured with `CHAOS_ERROR_RATE: "0.20"`.
- Canary scaled to 1 pod and received 10% traffic.
- Prometheus measured an instant ~13.36% 5xx error rate on the canary pod hash.
- Argo Rollouts AnalysisTemplate assessed the failure (`failed (3) > failureLimit (2)`), automatically marked the rollout `Aborted` / `Degraded`, reset Envoy Gateway HTTPRoute weights to **100% stable (v2.0.0) / 0% canary**, and killed the degraded canary pod within ~45 seconds.
- Stable v2.0.0 remained 100% online; live users experienced zero disruption after automatic abort.

---

## 5. Repository File Map

```text
zero-downtime-deployment-engine/
├── .github/workflows/
│   └── ci.yml                          # GitHub Actions CI (Ruff, Pytest, Docker build, Trivy scan, GHCR push)
├── app/
│   ├── alembic/
│   │   ├── versions/
│   │   │   ├── 001_initial_schema.py   # Baseline schema (products + orders)
│   │   │   └── 002_expand_promo_currency.py # Expand migration (promo, currency, concurrent index)
│   │   └── env.py                      # Advisory lock migration harness
│   ├── static/
│   │   └── index.html                  # Royal Blue v2 storefront UI
│   ├── tests/
│   │   └── test_app.py                 # FastAPI unit & validation tests
│   ├── alembic.ini                     # Alembic configuration
│   ├── Dockerfile                      # Non-root multi-stage Python 3.12 container
│   ├── main.py                         # FastAPI async backend + Prometheus metrics + chaos middleware
│   ├── pyproject.toml                  # Ruff & Pytest configuration
│   └── requirements.txt                # Pinned application dependencies
├── docs/
│   ├── ARCHITECTURE.md                 # Deep-dive architecture and design invariants
│   └── RUNBOOK.md                      # Operational and incident runbook
├── infra/terraform/
│   ├── main.tf                         # AWS VPC, Subnet, IGW, Route Table, SG, EC2 k3s, EIP
│   ├── outputs.tf                      # Terraform outputs (IP, domain, SSH commands)
│   ├── variables.tf                    # Configurable infrastructure inputs
│   └── terraform.tfvars                # Local admin IP and SSH key path (git-ignored)
├── k8s/
│   ├── namespace.yaml                  # deployment-engine namespace definition
│   ├── platform/
│   │   ├── analysis-template.yaml      # Argo Rollouts Prometheus SLO gate (<1% 5xx, <250ms p95)
│   │   ├── argo-rollouts-values.yaml   # Helm values + Gateway API traffic router plugin
│   │   ├── cluster-issuer.yaml         # Let's Encrypt ACME HTTP-01 ClusterIssuer
│   │   ├── gateway.yaml                # Envoy Gateway (port 80 & port 443 HTTPS listeners)
│   │   ├── grafana.yaml                # Pre-provisioned Grafana deployment + dashboard
│   │   └── prometheus.yaml             # Pod-scoped Prometheus deployment with hash relabeling
│   └── workloads/
│       ├── httproute.yaml              # HTTP->HTTPS redirect + weighted canary traffic route
│       ├── migration-job.yaml          # v1.0.0 Alembic migration job
│       ├── migration-job-v2.yaml       # v2.0.0 Alembic migration job
│       ├── pdb-netpol.yaml             # PodDisruptionBudget + data-tier NetworkPolicy
│       ├── postgres.yaml               # PostgreSQL 16 StatefulSet + Service
│       ├── redis.yaml                  # Redis 7 Deployment + Service
│       ├── rollout.yaml                # Argo Rollouts definition (canary strategy + analysis)
│       └── services.yaml               # orderpulse-stable & orderpulse-canary ClusterIP services
├── loadtest/
│   └── zero-downtime.js                # Continuous k6 scenario (30 req/s reads + writes)
├── README.md                           # Master GitHub showcase & documentation
└── PROJECT_STATUS.md                   # This status & AI Studio context file
```

---

## 6. Essential Operational Commands

### Connecting to the Cluster
```powershell
$env:KUBECONFIG = "$HOME\.kube\aws-orderpulse.yaml"
kubectl get nodes -o wide
kubectl -n deployment-engine get rollout,pods,certificate
```

### Accessing Private Dashboards (Authenticated Tunnels)
```powershell
# 1. Grafana Dashboard (http://localhost:3000 | admin / orderpulse-admin)
kubectl -n deployment-engine port-forward svc/grafana 3000:3000

# 2. Argo Rollouts Dashboard (http://localhost:3100/rollouts/deployment-engine)
kubectl -n argo-rollouts port-forward svc/argo-rollouts-dashboard 3100:3100

# 3. Prometheus Metrics Explorer (http://localhost:9090/targets)
kubectl -n deployment-engine port-forward svc/prometheus 9090:9090
```

### Running the k6 Zero-Downtime Load Test
```powershell
docker run --rm -v "${PWD}/loadtest:/loadtest" grafana/k6 run /loadtest/zero-downtime.js
```

### AWS Cost Management (Pausing Compute when Idle)
```powershell
# Stop instance (preserves EBS data, Let's Encrypt cert, and Elastic IP; drops billing to ₹0/hr)
aws ec2 stop-instances --instance-ids i-09bf4d74a69acd24a --region ap-south-1
aws ec2 wait instance-stopped --instance-ids i-09bf4d74a69acd24a --region ap-south-1

# Start instance when resuming
aws ec2 start-instances --instance-ids i-09bf4d74a69acd24a --region ap-south-1
aws ec2 wait instance-running --instance-ids i-09bf4d74a69acd24a --region ap-south-1
```

---

## 7. Current State & Immediate Next Opportunities

The core platform is **100% complete, hardened, verified, and operational**. If you wish to expand the architecture further in future AI Studio sessions, top high-impact enhancements include:
1. **Pull-Based GitOps via Argo CD**: Deploying an Argo CD instance to sync changes declaratively from GitHub commits, converting the Alembic migration into an Argo CD `PreSync` hook.
2. **Multi-Node AWS Scaling**: Expanding Terraform to deploy 1–2 `c7i-flex.large` worker nodes across multiple Availability Zones with `podAntiAffinity` to test node-drain resilience under load.
3. **Structured Alerting**: Adding Prometheus `Alertmanager` to fire Slack or webhook alerts when canary rollbacks occur or database query latency exceeds thresholds.
