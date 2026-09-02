#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-green}"

echo "==> Initiating Rollback: Routing 100% traffic to $TARGET (holding stable release)..."

# 1. Ensure both deployments have healthy replicas - DO NOT delete any pods!
kubectl -n deployment-engine scale deployment green --replicas=3 2>/dev/null || true
kubectl -n deployment-engine scale deployment blue  --replicas=3 2>/dev/null || true

# 2. Route 100% of live traffic to target baseline
kubectl -n deployment-engine patch service active --type merge \
  -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$TARGET\"}}}"

# 3. Refresh port forwarder so it immediately re-binds to the target pod
pkill -f "svc/active 8080" 2>/dev/null || true
setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
disown -a

echo "✅ Rollback complete: 100% traffic routed to $TARGET. All pods kept alive for next deployment pipeline."
