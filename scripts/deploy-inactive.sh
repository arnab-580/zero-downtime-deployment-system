#!/usr/bin/env bash
set -euo pipefail
IMAGE="${1:?image required}"
ACTIVE="$(kubectl -n deployment-engine get service active -o jsonpath='{.spec.selector.color}' 2>/dev/null || true)"
TARGET=green
[[ "$ACTIVE" == green ]] && TARGET=blue
kubectl -n deployment-engine set image deployment/$TARGET website="$IMAGE" >/dev/null
kubectl -n deployment-engine rollout status deployment/$TARGET --timeout=180s >/dev/null
echo "$TARGET"
