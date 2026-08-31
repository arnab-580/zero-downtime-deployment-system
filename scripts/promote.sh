#!/usr/bin/env bash
set -euo pipefail

COLOR="${1:?usage: promote.sh <blue|green>}"

# 1. Patch the Kubernetes active service selector
kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$COLOR\"}}}"

# 2. Refresh the active service port forward on port 8080
pkill -9 -f "svc/active 8080" 2>/dev/null || true
sleep 1
setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
disown -a

echo "Active traffic is now routed 100% to $COLOR"
