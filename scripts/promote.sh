#!/usr/bin/env bash
set -euo pipefail

COLOR="${1:?usage: promote.sh <blue|green>}"

kubectl -n deployment-engine rollout status deployment "$COLOR" --timeout=120s

# 1. Patch the Kubernetes active service selector
kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$COLOR\"}}}"

# Keep the port-forward process alive. A port-forward restart creates a real
# outage window and drops every connection being opened during the handoff.
echo "Active traffic is now routed 100% to $COLOR (existing connections drained by Kubernetes)"
