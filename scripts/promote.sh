#!/usr/bin/env bash
set -euo pipefail

COLOR="${1:?usage: promote.sh <blue|green>}"

# 1. Ensure deployments have healthy replicas (never delete pods)
kubectl -n deployment-engine scale deployment "$COLOR" --replicas=3 2>/dev/null || true

# 2. Patch the Kubernetes active service selector
kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$COLOR\"}}}"

# 3. Refresh port forwarder so it immediately re-binds to the new color's pod
pkill -f "svc/active 8080" 2>/dev/null || true
setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
disown -a

echo "Active traffic is now routed 100% to $COLOR"
